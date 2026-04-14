# Datafer

Outil d'optimisation sémantique SEO par **datashake**. Reprise de Surfer, pensé multi-utilisateurs avec dossiers clients et partage de briefs.

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **Cloudflare Pages / Workers** via [OpenNext](https://opennext.js.org/cloudflare)
- **Cloudflare D1** (SQLite serverless) + **Drizzle ORM**
- **Better-auth** (email + password, inscription fermée)
- **Tailwind v4**

## Développement local

Pré-requis : Node 20+, `wrangler` authentifié (`npx wrangler login`).

```bash
# 1. Installer les dépendances
npm install

# 2. Créer la base D1 (une seule fois)
npx wrangler d1 create datafer
# → copier le database_id dans wrangler.toml

# 3. Générer et appliquer les migrations en local
npm run db:generate
npm run db:migrate:local

# 4. Copier les vars locales
cp .dev.vars.example .dev.vars
# → remplir BETTER_AUTH_SECRET (openssl rand -base64 32),
#   SERPAPI_KEY, HALOSCAN_KEY

# 5. Créer un premier utilisateur (en local)
npm run create-user -- --email toi@datashake.fr --password 'motdepasse' --name Toi --local

# 6. Lancer le dev server
npm run dev
```

Ouvre `http://localhost:3000` → redirige vers `/login`.

## Déploiement Cloudflare

```bash
# 1. Appliquer les migrations en prod
npm run db:migrate:remote

# 2. Définir les secrets (une seule fois)
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put SERPAPI_KEY
npx wrangler secret put HALOSCAN_KEY

# 3. Déployer
npm run deploy

# 4. Créer un utilisateur en prod
npm run create-user -- --email consultant@datashake.fr --password '…'
```

## Structure

```
src/
  app/
    login/            → page de connexion
    app/              → espace authentifié (dossiers clients, briefs)
    api/auth/[...all] → handler better-auth
  db/
    schema.ts         → schéma Drizzle (users, clients, briefs + tables auth)
    index.ts          → factory D1 + Drizzle
  lib/
    auth.ts           → config better-auth (server)
    auth-client.ts    → client React
  proxy.ts            → garde d'auth sur /app (Next.js 16 = ex-middleware)
scripts/
  create-user.ts      → création manuelle d'un compte (pas d'inscription publique)
drizzle/              → migrations SQL générées
wrangler.toml         → config Cloudflare (D1, Workers)
open-next.config.ts   → config OpenNext Cloudflare adapter
drizzle.config.ts     → config Drizzle Kit
```

## Roadmap

- [x] Scaffold Next.js 16 + Cloudflare + D1 + Drizzle + Better-auth
- [x] Page de connexion, garde d'auth sur `/app`, schéma DB
- [ ] Portage de l'éditeur WYSIWYG + scoring NLP (depuis le HTML original)
- [ ] CRUD dossiers clients
- [ ] CRUD briefs (SERP + NLP + Haloscan stockés en D1)
- [ ] Partage de brief via lien public (token)
- [ ] API routes `/api/serp` et `/api/haloscan` (clés côté serveur)

## Notes de sécurité

- Les clés API **SERPAPI** et **Haloscan** vivent uniquement côté serveur (Cloudflare Worker), jamais dans le navigateur.
- L'inscription publique est désactivée (`disableSignUp: true` dans better-auth). Les comptes sont créés via `npm run create-user`.
- La session est stockée en cookie HTTP-only sécurisé par better-auth.
