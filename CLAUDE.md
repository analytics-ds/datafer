# CLAUDE.md — Datafer

Notes opérationnelles pour Claude Code sur ce repo. Les choses évidentes à la lecture du code ne sont pas dupliquées ici — focus sur les pièges et workflows manuels.

## Stack

- Next.js 16 (App Router) + React 19
- OpenNext Cloudflare adapter (`opennextjs-cloudflare`) → Cloudflare Workers
- Cloudflare D1 (SQLite) via Drizzle ORM
- Better-auth (email + password, `disableSignUp: true`)
- URL prod : https://datafer.analytics-e0d.workers.dev

## Déploiement — PAS d'auto-deploy

**Le repo GitHub n'a aucun CI/CD branché sur Cloudflare.** Un `git push` sur `main` ne déploie rien en prod, il ne fait que pousser le code sur GitHub.

Pour déployer, il faut lancer manuellement depuis la machine locale :

```bash
npm run deploy
```

Ça exécute `opennextjs-cloudflare build && opennextjs-cloudflare deploy` et upload le Worker + les assets `public/` sur Cloudflare. Les assets sous `public/` ne sont servis en prod qu'après un deploy — un fichier committé sur `main` mais jamais déployé renvoie 404.

## Migrations D1

Les migrations doivent être appliquées **avant** de déployer du code qui dépend des nouvelles colonnes, sinon la prod casse le temps du deploy.

```bash
npm run db:generate          # génère la migration SQL à partir du schéma Drizzle
npm run db:migrate:local     # applique en local
npm run db:migrate:remote    # applique en prod (D1 distant)
```

Wrangler tracke les migrations via son journal interne, donc `db:migrate:remote` est idempotent.

## Création d'un utilisateur

Pas d'inscription publique (voir `src/lib/auth.ts`). Les comptes sont créés via le script :

```bash
npm run create-user -- --email <email> --first-name <Prénom> --last-name <Nom>
```

Par défaut : password `1234`, `must_change_password = 1` → forcé au 1er login. Le script exécute directement un `wrangler d1 execute datafer --remote` (modifier la BDD prod, pas seulement le code local).

Options :
- `--password <pwd>` : force un password custom
- `--no-force-change` : désactive le flag de changement obligatoire
- `--local` : cible D1 local au lieu de prod

## Avatars utilisateurs

Convention : `public/avatars/<prénom>.<ext>` (jpeg, png...). Le champ `user.image` en BDD stocke le path relatif (ex : `/avatars/damien.jpeg`).

Workflow pour ajouter l'avatar d'un user existant :

1. Copier la photo dans `public/avatars/<prénom>.<ext>`
2. UPDATE SQL :
   ```bash
   npx wrangler d1 execute datafer --remote \
     --command "UPDATE user SET image = '/avatars/<prénom>.<ext>' WHERE email = '<email>';"
   ```
3. Commit le fichier sur GitHub (pour traçabilité)
4. **`npm run deploy`** (sinon l'image reste en 404 en prod, cf. section Déploiement)

## Secrets Cloudflare

Set via `wrangler secret put <NAME>` (jamais commit). Secrets en place :
- `BETTER_AUTH_SECRET`
- `SERPAPI_KEY`
- `HALOSCAN_KEY`
- `CRAZYSERP_KEY` (+ `CRAZYSERP_KEY_FALLBACK`)
- `BRIGHTDATA_TOKEN`, `BRIGHTDATA_ZONE` (zone `web_unlocker1`, Premium activé depuis 2026-05-02)
- `BRIGHTDATA_BROWSER_WSS` (zone `scraping_browser1`, format `wss://brd-customer-XXX-zone-YYY:PWD@brd.superproxy.io:9222`)
- `CRON_SECRET`

Les secrets doivent être set **deux fois** : sur le worker principal `datafer` (`wrangler secret put X`) ET sur le consumer `datafer-analysis-consumer` (`wrangler secret put X --config wrangler-analysis.toml`).

## Architecture analyse asynchrone (Queue)

Une analyse de brief = 30-60s CPU + 60-90s wall (SERP + crawl 10 sites + NLP + scoring). Trop long pour un worker Next.js classique → on a découpé en 2 workers :

- **Producteur** = worker Next.js (`datafer`). À la création d'un brief, il enqueue un message `AnalysisMessage` dans la CF Queue `datafer-analysis` puis répond 200 immédiatement.
- **Consumer** = worker dédié `datafer-analysis-consumer` (cf. `src/worker-analysis/index.ts` + `wrangler-analysis.toml`). Tourne `completeBriefAnalysis()` pour chaque message.

Config consumer (`wrangler-analysis.toml`) :
- `max_batch_size = 1` (jamais 2 analyses en parallèle dans le même worker → on dépasse le budget CPU sinon)
- `max_retries = 1` (échoue vite, le cron cleanup ramasse derrière)
- DLQ : `datafer-analysis-dlq`

Déploiement consumer : `npx wrangler deploy --config wrangler-analysis.toml` (à faire en plus de `npm run deploy` quand on touche à la logique d'analyse).

## Cleanup briefs zombies

`/api/cron/cleanup-stuck/route.ts` + `.github/workflows/cleanup-stuck-briefs.yml` :
- Cron GH Actions `* * * * *` (toutes les 1 min, latence GHA réelle 1-5 min)
- Tout brief `pending` depuis plus de `STUCK_THRESHOLD_MS = 2 min` est forcé en `failed`
- Worst-case visible user : ~3 min entre crash worker et passage en failed

Auth via `Authorization: Bearer ${CRON_SECRET}` (constant-time compare).

## SERP provider

Provider par défaut = CrazySerp (`SERP_PROVIDER=crazyserp`, ~$0.50/1k vs SerpAPI $10/1k). Fallback sur SerpAPI via `SERPAPI_KEY` si CrazySerp répond 0 résultats ou 0 credits.

**Locale FR** : on passe `gl=fr&hl=fr&google_domain=google.fr` à CrazySerp (sinon SERP US-biased). La logique vit dans `src/lib/analysis.ts` (rechercher `gl/hl/googleDomain`).

Doc API CrazySerp : skill projet `.claude/skills/crazyserp-api/SKILL.md`.

## Crawl cascade

`crawlPage(url, env)` dans `src/lib/analysis.ts` essaie 3 niveaux dans l'ordre :

1. **fetch direct** (gratuit, ~70% de succès). Échec si bot detection forte.
2. **Bright Data Web Unlocker** (REST, $1.50/CPM). Résout cloudflare/datadome/PerimeterX. Zone `web_unlocker1` Premium.
3. **Bright Data Scraping Browser** (WSS Puppeteer/CDP, $8/GB). Niveau 3 réservé aux pages JS-only (Nike Snkrs, etc.). Client CDP raw écrit à la main (`crawlWithBrightDataBrowser`) parce que CF Workers n'a pas de driver Puppeteer compatible. Pièges :
   - URL `wss://...` doit être convertie en `https://...` pour `fetch()` (CF Workers ne supporte pas wss:// dans fetch)
   - Credentials inline dans l'URL (`user:pwd@`) sont strippés par CF Workers → parser et passer en header `Authorization: Basic ...`
   - `Target.createTarget {url}` échoue avec "Opening non-blank pages not supported" → toujours `{url:'about:blank'}` puis `Page.navigate`

### Pages problématiques connues

- **kitchen-daily.fr** : `wc=10` chez parseHTML alors que le HTML brut contient ~132 mots de contenu réel. Aucune classe noise ne matche. Suspecté Next.js parser bug (htmlparser2 bouffe les `<Script>` mais ne récupère pas le texte rendu côté client). Non résolu au 2026-05-02. Symptôme similaire sur **wethenew**.
- **Nike Snkrs** : résolu le 2026-05-02. Le contenu était wrappé dans des classes `modal-*` qui matchaient `NOISE_CLASS_RE` → on les a retirées du regex (cf. `NOISE_CLASS_RE` dans `analysis.ts`). Score scrap : 5/9 → 9/10.

## Scoring SEO

Pondération sur 100 (depuis 2026-05-02, itération 5) :

| Critère | Max | Notes |
|---|---|---|
| keyword | 15 | softScore (couverture tokens) max 7 + bonus exact max 8 |
| **nlpCoverage** | **25** | Split par tier (cf. ci-dessous) |
| contentLength | 12 | wc dans `[minWordCount, maxWordCount]` → 12 |
| headings | 15 | H1/H2/H3 + keyword dans H1/H2 |
| placement | 15 | KW exact ou soft dans first 100 mots / 1ère phrase / H1 / H2 |
| structure | 9 | Listes, tableau, FAQ, etc. |
| quality | 9 | Diversité lexicale, longueur phrases, density |

Total SEO weight = 0.95, GEO weight = 0.05 (le SEO classique reste l'essentiel, GEO en bonus).

### Split nlpCoverage par tier

Le scoring NLP suit les tiers que voit l'utilisateur dans l'éditeur (`brief-view.tsx` / `brief-editor.tsx`) :

- **Essentiels** (presence ≥ 70 chez les concurrents) : 15 pts linéaire, faut **100%** pour 15/15
- **Importants** (40 ≤ presence < 70) : 10 pts linéaire
- **Opportunités** (< 40) : ignorées du scoring (bonus, pas obligatoires)

Pris sur top40 termes pour aligner avec `slice(0, 40)` côté UI. Détails exposés dans `nlpCoverage.details` : `essentialsUsed/Total/Coverage/Score` + `importantsUsed/Total/Coverage/Score`.

### Historique des itérations scoring

- **iter 1 (2026-05-01)** : remontée du bonus exact KW (4 → 8 pts) parce que des contenus sans KW exact tombaient à des scores trop hauts
- **iter 2 (2026-05-01)** : softScore KW tightened à 7 max (avant pas de cap) → un contenu sans KW exact plafonne à 7/15
- **iter 3 (2026-05-02)** : reverted (Pierre : "score beaucoup beaucoup trop dur")
- **iter 4 (2026-05-02)** : GEO 10 → 5 pts, nlpCoverage 20 → 25 (linéaire `round(cov × 25)` au lieu de paliers). Rééquilibrage : headings 18→15, structure 10→9, quality 10→9.
- **iter 5 (2026-05-02)** : split nlpCoverage par tier (Essentiels 15 + Importants 10). Avant on avait `round(cov_top30 × 25)` qui mélangeait tous les tiers. Pierre : "4/5 essentiels + 18/32 importants j'ai un score de fou c'est pas normal".

## Briefs Pierre cite régulièrement pour tester

- **box repas** (kitchendaily) : test crawl Next.js + scoring concurrentiel
- **bijoux de corps** : test discrimination essentiels/importants
- **costume homme beige** (Celio) : test client rattaché + position SERP
- **Nike x Patta**, **sneakers patta nike collection** : test Bright Data Browser CDP
- **gérer son patrimoine** (Fundora) : test KW low volume
