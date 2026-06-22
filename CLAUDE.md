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

Pondération (depuis 2026-06-22, itération 12 ; somme 104, renormalisée sur 100) :

| Critère | Max | Notes |
|---|---|---|
| keyword | 15 | softScore (couverture tokens) max 7 + bonus exact max 8 |
| **nlpCoverage** | **22** | BM25 fréquentiel. Essentiels 14 + Importants 8 (split par tier). Baissé de 27 à 22 en iter 12 (5 pts → semantic) |
| **differentiation** | **4** | Information gain : couverture des "Opportunités" (présence < 40 chez le top 10), plein régime à 50%. Récompense l'apport au-delà de la parité. max=0 si le KW n'a aucune opportunité |
| contentLength | 7 | wc dans `[min,max]` (3) + ±20% avg (2) + ≥avg (2) |
| headings | 13 | H1 unique (4) + KW H1 (3) + H2 count (3) + KW H2 (2) + ≥2 H3 (1) |
| placement | 13 | KW exact first 100 (4) + 1ère phrase (2) + last 100 (2) + distribution (5) |
| structure | 6 | Ratio paragraphes (3) + longueur paragraphes (2) + wc≥500 (1) |
| quality | 5 | Phrases moy (2) + density (1) + diversité ≥0.55 (2) |
| **salience** | **4** | KW exact en gras/emphase à sa 1ère mention dans le corps (brevet US9251473B2). Neutralisé (max=0) côté serveur/page crawlée (info de formatage absente) |
| images | 0 | RETIRÉ du scoring (iter 9, décision Pierre). Reste dans le breakdown (max=0) pour compat API |
| **semantic** | **15** | Cosinus moyen paragraphe vs centroïde top 10 (mapping non linéaire, rescalé /10→/15 en iter 12). Embeddings bge-m3 |

Total SEO weight = 0.92, GEO weight = 0.08.

**Score relatif vs concurrents** (depuis iter 7) : le `total` retourné est calibré sur la médiane des scores bruts des top 10 concurrents (`competitorScores` stocké dans `nlp_json`). Médiane = 50, médiane × 1.5 = 100. Floor médiane à 60 (sur KW à concu faible, on calibre comme si la médiane était 60). Le `rawTotal` reste accessible pour debug/comparaison cross-KW.

### Split nlpCoverage par tier

Le scoring NLP suit les tiers que voit l'utilisateur dans l'éditeur (`brief-view.tsx` / `brief-editor.tsx`) :

- **Essentiels** (presence ≥ 70 chez les concurrents) : 14 pts linéaire (était 17 avant iter 12), faut **100%** pour le max
- **Importants** (40 ≤ presence < 70) : 8 pts linéaire (était 10 avant iter 12)
- **Opportunités** (< 40) : ignorées du scoring (bonus, pas obligatoires)

Pris sur top40 termes pour aligner avec `slice(0, 40)` côté UI.

### Critère sémantique paragraphe (iter 8)

`computeSemanticCentroid` (analysis.ts) embed les paragraphes ≥40 mots de chaque concurrent top 10 via Workers AI bge-m3 (1024 dim), calcule le centroïde top 10, le stocke dans `nlp.semanticCentroid`. Côté éditeur, debounce 2s : pour chaque paragraphe modifié, fetch `POST /api/v2/briefs/[id]/semantic-paragraph` qui retourne le cosinus + couleur (vert ≥ 0.75, jaune 0.55-0.75, rouge < 0.55). Mapping cosinus → score sémantique (recalibré 2026-05-20, rescalé /15 en iter 12) : 0.78 → 15, 0.68 → 11, 0.60 → 8, 0.50 → 5, 0.40 → 2, ≤0.32 → 0. Les seuils de cosinus (la calibration) sont inchangés, seule l'amplitude est ×1.5 (le calcul se fait en float sur l'échelle /10 historique puis ×1.5). Critère neutralisé (max=0, renormalisation) si centroïde absent ou aucun paragraphe scoré.

**Finding 2026-05-20 (à garder en tête si on retouche la sémantique) :** les `competitorSemanticScores` réels en prod sont à 0.85-0.97 vs le centroïde (médiane ~0.88-0.90), parce que le centroïde est construit À PARTIR des paragraphes des concurrents (ils y sont donc mécaniquement proches). Le contenu utilisateur n'entre jamais dans le centroïde, il est donc structurellement plus bas. L'ancien plafond 0.85 plaçait le 10/10 au niveau des concurrents = inatteignable pour un doc externe. Le nouveau plafond 0.78 met la barre ~0.10 sous la médiane concurrents, écart réaliste d'un excellent contenu. Piste différée d'un scoring **relatif** aux competitorSemanticScores : non implémentée car on ne peut pas la valider sans mesurer le cosinus moyen utilisateur réel (non persisté, calculé live via /api/v2/briefs/[id]/semantic-paragraph, nécessite le binding Workers AI). Décision Pierre : on déploie le recalibrage et on observe avant d'aller plus loin.

### Historique des itérations scoring

- **iter 1-3 (2026-05-01/02)** : ajustements KW (bonus exact 4→8, softScore cap à 7).
- **iter 4 (2026-05-02)** : GEO 10 → 5 pts, nlpCoverage 20 → 25 linéaire.
- **iter 5 (2026-05-02)** : split nlpCoverage par tier (Essentiels 15 + Importants 10).
- **iter 6 (2026-05-03)** : ajout images /3, quality 9 → 6.
- **iter 7 (2026-05-08)** : rebalance complet + scoring relatif vs concu. nlpCoverage 25→35, contentLength 12→8, headings 15→13, placement 15→14, structure 9→6, quality 6→5, images 3→4. SEO 0.95 → 0.92, GEO 0.05 → 0.08. Floor médiane à 60.
- **iter 8 (2026-05-08)** : ajout critère sémantique paragraphe /10. nlpCoverage 35→27, placement 14→13, contentLength 8→7 pour libérer les 10 pts.
- **iter 9 (2026-06-10)** : critère images neutralisé en permanence (max=0, renormalisation), retours utilisateurs relayés par Pierre. Au même moment : isJunkNlpTerm partagé UI + scoring (les termes junk ne sont plus comptés dans nlpCoverage).
- **iter 12 (2026-06-22)** : rebalance **BM25 → embeddings** à enveloppe constante. nlpCoverage 27→22 (Essentiels 17→14, Importants 10→8), semantic 10→15 (mapping rescalé ×1.5, seuils de cosinus inchangés). Le total des max reste à 104. Objectif : réduire le poids de la fréquence de termes au profit du sens (cosinus embeddings), plus proche du NLP de Google. NB : non bench-validé sur prod (le bench `scripts/semantic-recalib-bench.ts` nécessite des embeddings prod), à observer sur les premiers briefs réels. Effet : un contenu fort en couverture de termes mais sémantiquement éloigné du sujet perd des points, un contenu qui colle vraiment au sens en gagne.
- **iter 11 (2026-06-22)** : ajout critère **differentiation** /4 (information gain). Les "Opportunités" (top40, présence < 40), jusque-là ignorées du scoring, deviennent un signal positif : couvrir les angles pertinents que le top 10 sous-traite. Répond au biais "suiveur" du scoring sémantique (récompensait la ressemblance au top 10, pas l'apport). Calculé partout (éditeur + serveur), aucune extraction supplémentaire. Plein régime à 50% des opportunités couvertes. Conséquence : un contenu qui ne fait que la parité avec le top 10 ne tape plus le max.
- **iter 10 (2026-06-22)** : ajout critère **saillance** /4 (brevet US9251473B2, idée reprise d'un Gem de veille SEO). KW exact en gras à sa 1ère mention dans le corps (hors titres, déjà couverts par headings). Détecté côté éditeur via DOM walk (`detectKwEmphasized`, texte normalisé), passé à `computeDetailedScore` via `EditorData.kwEmphasized`. Neutralisé (max=0) quand l'info de formatage n'est pas fournie (scoring serveur, page crawlée). La "pureté thématique" du même Gem n'a pas été ajoutée : déjà couverte par le critère sémantique (cosinus paragraphe vs centroïde + coloration rouge des paragraphes qui divergent).

## Briefs Pierre cite régulièrement pour tester

- **box repas** (kitchendaily) : test crawl Next.js + scoring concurrentiel
- **bijoux de corps** : test discrimination essentiels/importants
- **costume homme beige** (Celio) : test client rattaché + position SERP
- **Nike x Patta**, **sneakers patta nike collection** : test Bright Data Browser CDP
- **gérer son patrimoine** (Fundora) : test KW low volume
