/**
 * Diagnostic du parsing : re-crawle (fetch direct) les concurrents des
 * briefs de référence et compare le wordCount obtenu par parseHTML au
 * wordCount stocké dans le dump (crawl prod). Flague récupérations et
 * régressions. Lancement : npx tsx scripts/crawl-debug.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parseHTML, extractJsonPayloadText } from "../src/lib/analysis";

const UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BENCH_DIR = path.join(process.cwd(), "scripts/bench-data");

type Ref = { url: string; benchWc: number };

function loadRefs(): Ref[] {
  const refs: Ref[] = [];
  const seen = new Set<string>();
  for (const f of fs.readdirSync(BENCH_DIR)) {
    if (!f.endsWith(".json")) continue;
    const d = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, f), "utf8"));
    const serp = JSON.parse(d.serp_json);
    const items: Record<string, unknown>[] = Array.isArray(serp)
      ? serp
      : Object.keys(serp)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => serp[k]);
    for (const r of items) {
      const url = r.link as string;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      refs.push({ url, benchWc: (r.wordCount as number) ?? 0 });
    }
  }
  return refs.sort((a, b) => a.benchWc - b.benchWc);
}

async function diag(ref: Ref) {
  let html = "";
  let status = 0;
  try {
    const r = await fetch(ref.url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    status = r.status;
    html = await r.text();
  } catch {
    return { ...ref, status: 0, newWc: 0, jsonWc: 0, verdict: "FETCH KO" };
  }
  if (status !== 200) {
    return { ...ref, status, newWc: 0, jsonWc: 0, verdict: `HTTP ${status}` };
  }
  const jsonWc = extractJsonPayloadText(html)
    .split(/\s+/)
    .filter(Boolean).length;
  const newWc = parseHTML(html).wordCount;
  // Verdict : on compare au bench. Régression = un site qui était correct
  // (>= 300 mots) et qui tombe sous la moitié. Récupération = un site faible
  // (< 200) qui repasse au-dessus de 200.
  let verdict = "stable";
  if (ref.benchWc >= 300 && newWc < ref.benchWc * 0.5) verdict = "⚠ REGRESSION";
  else if (ref.benchWc < 200 && newWc >= 200) verdict = "✓ RECUPERE";
  else if (newWc > ref.benchWc * 1.3) verdict = "+ enrichi";
  return { ...ref, status, newWc, jsonWc, verdict };
}

(async () => {
  const refs = loadRefs();
  console.log(`Test de ${refs.length} concurrents (fetch direct depuis cette machine)\n`);
  console.log(
    "benchWc".padStart(8) +
      " " +
      "newWc".padStart(7) +
      " " +
      "jsonWc".padStart(7) +
      "  verdict        url",
  );
  console.log("-".repeat(100));
  const results = [];
  for (const ref of refs) {
    const res = await diag(ref);
    results.push(res);
    console.log(
      String(res.benchWc).padStart(8) +
        " " +
        String(res.newWc).padStart(7) +
        " " +
        String(res.jsonWc).padStart(7) +
        "  " +
        res.verdict.padEnd(14) +
        " " +
        res.url.slice(0, 60),
    );
  }
  // Synthèse
  const n = (v: string) => results.filter((r) => r.verdict === v).length;
  console.log("\n=== SYNTHESE ===");
  console.log(`✓ RECUPERE   : ${n("✓ RECUPERE")}`);
  console.log(`+ enrichi    : ${n("+ enrichi")}`);
  console.log(`stable       : ${n("stable")}`);
  console.log(`⚠ REGRESSION : ${n("⚠ REGRESSION")}`);
  console.log(
    `bloqué/KO    : ${results.filter((r) => r.status !== 200).length} (fetch direct refusé, non concluant)`,
  );
})();
