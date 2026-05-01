---
name: crazyserp-api
description: Documentation de l'API CrazySerp utilisée par Datafer comme provider SERP par défaut. À consulter avant de modifier le code crawler/SERP, quand on debug une erreur "no SERP results", ou quand on veut ajouter de nouveaux paramètres à l'appel CrazySerp.
---

# API CrazySerp

Provider SERP utilisé par Datafer (alternative ~150× moins chère que SerpAPI). Le choix entre CrazySerp et SerpAPI se fait via la variable d'env `SERP_PROVIDER` dans wrangler.toml.

**Doc officielle** : https://crazyserp.com/fr/documentation/getting-started (SPA Next.js, ne rend pas en SSR — utiliser firecrawl si on veut la fetcher, sinon se fier à ce SKILL.md).

## Authentification

- **Header** : `Authorization: Bearer sk_<KEY>` — c'est le format observé en pratique. Le secret Cloudflare est `CRAZYSERP_KEY`.
- Aucun query param d'auth (la clé NE va PAS dans l'URL).

## Endpoint principal : recherche SERP

```
GET https://crazyserp.com/api/search
```

### Paramètres

| Param | Requis | Description |
|---|---|---|
| `q` | oui | Le keyword à requêter |
| `page` | non | Page de résultats, défaut 1. 1 page = 1 crédit |
| `location` | non | Pays/zone géographique (ex: `France`). FR = -50% sur le coût en crédit |

### Réponse JSON (champs clés observés)

```json
{
  "success": true,
  "keyword": "basket homme",
  "parsed_data": {
    "organic": [                    // Top 10 organique
      {
        "position": 1,
        "url": "https://...",
        "title": "...",
        "description": "...",       // = snippet
        "url_title": "Zalando",
        "breadcrumb": "...",
        "thumbnail": "data:image/png;base64,...",
        "rating": 4.1,              // optionnel
        "pixel_position": 128
      }
    ],
    "people_also_ask": [            // PAA
      {
        "question": "...",
        "answer": "...",            // peut être ""
        "source_url": "https://...",
        "clean_source_url": "https://...",
        "source_title": "...",
        "source_domain": "https://..."
      }
    ],
    "shopping_blocks": [...],       // Produits Shopping
    "listings": [...],              // Carrousels comparateurs
    "related": [...],               // Recherches associées
    "children_queries": [...],      // Suggestions sous-keywords
    "ai_overview": {},              // AI Overview Google
    "has_ai_overview": false,
    "has_local_pack": false,
    "has_map": false,
    "highlights": ["mot1", "mot2"], // Mots surlignés
    "result_count": 72300000,       // Nombre total de résultats Google
    "query_tabs": [...]             // Onglets dispo (Images, Videos, Books...)
  },
  "stats": {                        // Compteurs résumés (count par type)
    "organic_count": 10,
    "people_also_ask_count": 4,
    "shopping_count": 8,
    "listings_count": 4,
    "related_count": 6,
    ...
  },
  "params": {                       // Echo des params envoyés
    "device": "desktop",
    "gl": "us",
    "googleDomain": "google.com",
    "hl": "en",
    "location": "France",
    "page": "1",
    "q": "basket homme",
    "safe": "off"
  },
  "timestamp": "2026-05-01T11:45:56.875Z",
  "credits_used": 1
}
```

## Système de crédits

Trois pools de crédits, consommés dans l'ordre **sub > topup > sandbox** (à confirmer mais c'est la convention).

| Pool | Origine | Headers de réponse |
|---|---|---|
| `sub` | Abonnement payant | `x-remaining-sub-credits` |
| `topup` | Recharge ponctuelle (pay-as-you-go) | `x-remaining-topup-credits` |
| `sandbox` | Crédits gratuits (free trial / test) | `x-remaining-sandbox-credits` |

Headers retournés à chaque appel :
- `x-credits-type-used` : `sub` / `topup` / `sandbox`
- `x-remaining-sub-credits` : entier
- `x-remaining-topup-credits` : entier
- `x-remaining-sandbox-credits` : entier

**Coût** :
- 1 crédit par page de résultats
- France a une remise de -50% (à confirmer dans la doc tarifaire mais documenté dans le code Datafer `analysis.ts`)

**Vérification du solde** : pas d'endpoint dédié documenté (`/api/account` et `/api/credits` retournent 404). Pour connaître le solde, faire un appel de test sur n'importe quel keyword et lire les headers `x-remaining-*`.

## Codes d'erreur observés

| Code | Endpoint | Cause |
|---|---|---|
| 404 | `/api/account`, `/api/credits` | Endpoints inexistants |
| 200 + `success: false` | `/api/search` | À documenter selon les cas |

Quand le quota est épuisé : à confirmer empiriquement (probablement 402 Payment Required ou 429 Rate Limit).

## Limitations

- **Concurrency** : non documentée publiquement. À surveiller via les headers (probablement un `x-rate-limit-*`).
- **Locations** : 150+ pays selon la home page. `France` confirmé. Format = nom du pays en anglais, capitalisé.
- **Page** : la pagination par `page=N` consomme 1 crédit par page. Datafer n'utilise que la page 1.

## Branchement dans Datafer

Le code de l'appel est dans `src/lib/analysis.ts`, fonction `fetchSerpFromCrazyserp`. La sélection du provider se fait dans `briefs-service.ts` selon `env.SERP_PROVIDER` :

```ts
const provider = (e.SERP_PROVIDER === "serpapi" ? "serpapi" : "crazyserp");
const serpKey = provider === "serpapi" ? e.SERPAPI_KEY : e.CRAZYSERP_KEY;
```

**Pour basculer rapidement de provider** (en cas d'épuisement quota) :
1. Édit `wrangler.toml` ligne `SERP_PROVIDER = "crazyserp"` → `"serpapi"`
2. `npm run deploy` (pas d'auto-deploy Cloudflare, cf. CLAUDE.md racine)

**Pour mettre à jour la clé CrazySerp** :
```bash
echo "sk_<NEW_KEY>" | npx wrangler secret put CRAZYSERP_KEY
```
Pas besoin de redeploy : les secrets sont propagés immédiatement par Cloudflare.

## Test rapide depuis le terminal

```bash
curl -s -i -H "Authorization: Bearer sk_<KEY>" \
  "https://crazyserp.com/api/search?q=basket+homme&page=1&location=France" \
  | head -25
```

La sortie contient les headers `x-remaining-*-credits` qu'on peut lire pour connaître le solde sans endpoint dédié.

## Choses NON documentées ici (à compléter au fil de l'eau)

- Endpoint pour récupérer le solde sans faire un search (probablement n'existe pas)
- Webhooks / batch / async
- Locations exhaustives supportées
- Comportement précis quand le quota est à 0
