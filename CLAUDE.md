# CLAUDE.md — Datafer

Notes opérationnelles pour Claude Code sur ce repo. Les choses évidentes à la lecture du code ne sont pas dupliquées ici — focus sur les pièges et workflows manuels.

## Stack

- Next.js 16 (App Router) + React 19
- OpenNext Cloudflare adapter (`opennextjs-cloudflare`) → Cloudflare Workers
- Cloudflare D1 (SQLite) via Drizzle ORM
- Better-auth (email + password, `disableSignUp: true`)
- URL prod : https://datafer.analytics-e0d.workers.dev

## Déploiement — auto-deploy via GitHub Actions

**Auto-deploy actif depuis 2026-05-10.** Un `git push` sur `main` déclenche `.github/workflows/deploy.yml` qui :

1. `npm ci` + tests Vitest
2. Migrations D1 distantes (`db:migrate:remote`)
3. Génère les types Cloudflare
4. Déploie le worker principal `datafer` (Next.js via OpenNext)
5. Déploie le consumer `datafer-analysis-consumer` (cf. `wrangler-analysis.toml`)

Durée typique : 1m30 à 2m. Suivre l'état avec `gh run watch <id>` ou via la liste `gh run list --workflow=deploy.yml`.

Déploiement manuel local (fallback) :

```bash
npm run deploy                                                # main worker uniquement
npx wrangler deploy --config wrangler-analysis.toml           # consumer uniquement
```

`npm run deploy` exécute `opennextjs-cloudflare build && opennextjs-cloudflare deploy` et upload le Worker + les assets `public/`. Les assets sous `public/` ne sont servis en prod qu'après un deploy : un fichier committé sur `main` mais jamais déployé renvoie 404 (cas impossible avec l'auto-deploy puisque le workflow déploie systématiquement).

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
- `[limits] cpu_ms = 300000` (5 min, Workers Paid activé)
- `max_batch_size = 1` (jamais 2 analyses en parallèle dans le même worker → on consomme tout le budget CPU sur une seule analyse)
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

Pondération sur 100 (depuis 2026-05-08, itération 8) :

| Critère | Max | Notes |
|---|---|---|
| keyword | 15 | softScore (couverture tokens) max 7 + bonus exact max 8 |
| **nlpCoverage** | **27** | Essentiels 17 + Importants 10 (split par tier) |
| contentLength | 7 | wc dans `[min,max]` (3) + ±20% avg (2) + ≥avg (2) |
| headings | 13 | H1 unique (4) + KW H1 (3) + H2 count (3) + KW H2 (2) + ≥2 H3 (1) |
| placement | 13 | KW exact first 100 (4) + 1ère phrase (2) + last 100 (2) + distribution (5) |
| structure | 6 | Ratio paragraphes (3) + longueur paragraphes (2) + wc≥500 (1) |
| quality | 5 | Phrases moy (2) + density (1) + diversité ≥0.55 (2) |
| images | 4 | Linéaire vers médiane concurrents, neutralisé si médiane=0 |
| **semantic** | **10** | Cosinus moyen paragraphe vs centroïde top 10 (mapping non linéaire) |

Total SEO weight = 0.92, GEO weight = 0.08.

**Score relatif vs concurrents** (depuis iter 7) : le `total` retourné est calibré sur la médiane des scores bruts des top 10 concurrents (`competitorScores` stocké dans `nlp_json`). Médiane = 50, médiane × 1.5 = 100. Floor médiane à 60 (sur KW à concu faible, on calibre comme si la médiane était 60). Le `rawTotal` reste accessible pour debug/comparaison cross-KW.

### Split nlpCoverage par tier

Le scoring NLP suit les tiers que voit l'utilisateur dans l'éditeur (`brief-view.tsx` / `brief-editor.tsx`) :

- **Essentiels** (presence ≥ 70 chez les concurrents) : 17 pts linéaire, faut **100%** pour 17/17
- **Importants** (40 ≤ presence < 70) : 10 pts linéaire
- **Opportunités** (< 40) : ignorées du scoring (bonus, pas obligatoires)

Pris sur top40 termes pour aligner avec `slice(0, 40)` côté UI.

### Critère sémantique paragraphe (iter 8)

`computeSemanticCentroid` (analysis.ts) embed les paragraphes ≥40 mots de chaque concurrent top 10 via Workers AI bge-m3 (1024 dim), calcule le centroïde top 10, le stocke dans `nlp.semanticCentroid`. Côté éditeur, debounce 2s : pour chaque paragraphe modifié, fetch `POST /api/v2/briefs/[id]/semantic-paragraph` qui retourne le cosinus + couleur (vert ≥ 0.75, jaune 0.55-0.75, rouge < 0.55). Mapping cosinus → score sémantique : 0.85 → 10, 0.65 → 5, 0.45 → 2. Critère neutralisé (max=0, renormalisation) si centroïde absent ou aucun paragraphe scoré.

### Historique des itérations scoring

- **iter 1-3 (2026-05-01/02)** : ajustements KW (bonus exact 4→8, softScore cap à 7).
- **iter 4 (2026-05-02)** : GEO 10 → 5 pts, nlpCoverage 20 → 25 linéaire.
- **iter 5 (2026-05-02)** : split nlpCoverage par tier (Essentiels 15 + Importants 10).
- **iter 6 (2026-05-03)** : ajout images /3, quality 9 → 6.
- **iter 7 (2026-05-08)** : rebalance complet + scoring relatif vs concu. nlpCoverage 25→35, contentLength 12→8, headings 15→13, placement 15→14, structure 9→6, quality 6→5, images 3→4. SEO 0.95 → 0.92, GEO 0.05 → 0.08. Floor médiane à 60.
- **iter 8 (2026-05-08)** : ajout critère sémantique paragraphe /10. nlpCoverage 35→27, placement 14→13, contentLength 8→7 pour libérer les 10 pts.

## Briefs Pierre cite régulièrement pour tester

- **box repas** (kitchendaily) : test crawl Next.js + scoring concurrentiel
- **bijoux de corps** : test discrimination essentiels/importants
- **costume homme beige** (Celio) : test client rattaché + position SERP
- **Nike x Patta**, **sneakers patta nike collection** : test Bright Data Browser CDP
- **gérer son patrimoine** (Fundora) : test KW low volume
