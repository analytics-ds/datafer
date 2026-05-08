#!/bin/bash
# Dump des 5 briefs de référence depuis D1 prod vers JSON local.
# Compat bash 3.2 (macOS).

set -eo pipefail
cd "$(dirname "$0")/../.."

OUT=scripts/bench-data
mkdir -p "$OUT"

PAIRS=(
  "box-repas:806b3c86-2a1e-4f1f-a534-7152ad85cea4"
  "bijoux-de-corps:7eeb74ba-6f18-423b-8906-364ad8ab0400"
  "costume-homme-beige:e287823b-47e5-414d-adab-0cf2fd6edcba"
  "gerer-son-patrimoine:b8da61e8-3fa9-48b4-b954-fdb159d9ee51"
  "nike-x-patta:992e862a-e9d8-429c-8e7e-fd8bd2a82cd0"
)

for pair in "${PAIRS[@]}"; do
  slug="${pair%%:*}"
  id="${pair##*:}"
  echo "Dumping $slug ($id)..."
  npx wrangler d1 execute datafer --remote --json --command \
    "SELECT id, keyword, country, serp_json, nlp_json, paa_json, editor_html, score FROM brief WHERE id = '$id';" \
    > "$OUT/$slug.raw.json" 2>/dev/null

  node -e "
    const raw = require('./$OUT/$slug.raw.json');
    const row = raw[0].results[0];
    require('fs').writeFileSync('./$OUT/$slug.json', JSON.stringify(row, null, 2));
  "
  rm "$OUT/$slug.raw.json"
done

echo "Done."
ls -la "$OUT/"
