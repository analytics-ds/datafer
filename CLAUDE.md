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
