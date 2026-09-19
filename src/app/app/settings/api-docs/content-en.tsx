import Link from "next/link";
import { Code, Err, H4, Pre, Section } from "./ui";

const BASE = "https://corpus.datashake.fr";

/**
 * API documentation, English version. Mirrors `content-fr.tsx` section for
 * section.
 *
 * The JSON and curl samples are deliberately left untranslated: they show what
 * the API actually returns, and the worker still answers in French on a few
 * `message` fields. Translating the samples would make the doc wrong.
 */
export function ApiDocsEn() {
  return (
    <>
      <Section title="Overview" dot="var(--accent)">
        <p className="mb-3">
          The corpus API exposes two families of endpoints to drive briefs from the outside
          (a script, N8N, Make, Postman, Zapier and so on). The model is asynchronous: you create a
          brief, poll its status until it is ready, then submit the content to get a score compared
          against the SERP competition.
        </p>
        <H4>API V1 (create and score)</H4>
        <ul className="list-disc pl-5 text-[var(--text-muted)] mb-3">
          <li><Code>POST /api/v1/briefs</Code>, creates a brief and starts the analysis (built-in duplicate guard)</li>
          <li><Code>GET /api/v1/briefs</Code>, lists briefs, filterable by <Code>keyword</Code> / <Code>folderId</Code> / <Code>status</Code></li>
          <li><Code>GET /api/v1/briefs/&#123;id&#125;</Code>, reads a brief, returns <Code>pending</Code> / <Code>ready</Code> / <Code>failed</Code></li>
          <li><Code>POST /api/v1/briefs/&#123;id&#125;/content</Code>, submits HTML content and returns the detailed score</li>
          <li><Code>GET /api/v1/folders</Code>, lists folders (clients) so you can find a <Code>folderId</Code></li>
          <li><Code>GET|POST|DELETE /api/v1/folders/&#123;id&#125;/share</Code>, public share link for a folder</li>
          <li><Code>GET|POST|DELETE /api/v1/briefs/&#123;id&#125;/share</Code>, public share link for a single brief</li>
        </ul>
        <H4>API V2 (extended, granular reads)</H4>
        <ul className="list-disc pl-5 text-[var(--text-muted)] mb-3">
          <li><Code>GET /api/v2/briefs/&#123;id&#125;</Code>, enriched summary (intent, SERP stats, Haloscan snapshot)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/serp</Code>, raw top 10 plus People Also Ask</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors</Code>, the 10 competitors enriched (headings, outline, score, word count)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;</Code>, one competitor in detail, with its raw text and rebuilt HTML</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/download?format=html|docx</Code>, downloads a competitor's content as HTML or Word</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/print</Code>, printable page for a competitor (Save as PDF in the browser)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/nlp</Code>, full NLP output (terms, clusters, sections, entities, opportunities, intent)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/paa</Code>, People Also Ask on their own</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/scoring</Code>, detailed score breakdown (8 SEO criteria plus semantics and GEO, scored relative to competitors)</li>
          <li><Code>POST /api/v2/briefs/&#123;id&#125;/semantic-paragraph</Code>, embeds a paragraph and returns its semantic proximity to the top 10 centroid</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/haloscan</Code>, raw Haloscan payload plus a summary</li>
        </ul>
        <p className="text-[var(--text-muted)]">
          Base URL: <Code>{BASE}</Code>. Authentication is the same for V1 and V2 (Bearer <Code>dfk_...</Code>).
        </p>
      </Section>

      <Section title="Authentication" dot="var(--brand-blue)">
        <p className="mb-3">
          Every request must carry an API key as a Bearer token in the
          <Code>Authorization</Code> header. Keys are generated from the <Link href="/app/settings" className="underline font-semibold">Settings → API keys</Link> page.
          A key is shown only once, when it is generated; only its SHA-256 hash is stored.
        </p>
        <Pre>{`Authorization: Bearer dfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Pre>
        <p className="text-[var(--text-muted)]">
          A revoked key returns <Code>401 unauthorized</Code> straight away. You can hold as many keys
          as you need; name them so you know who uses what (&laquo; N8N script &raquo;, &laquo; a teammate &raquo;,
          &laquo; Make integration &raquo;, and so on).
        </p>
      </Section>

      <Section title="1. Create a brief (asynchronous POST)" dot="var(--accent)">
        <p className="mb-3">
          Creates a brief and kicks off the analysis in the background (SERP, crawling the top 10,
          NLP, Haloscan). The response comes back immediately with <Code>status: &quot;pending&quot;</Code>.
        </p>
        <Pre>{`POST /api/v1/briefs`}</Pre>

        <H4>Body (JSON)</H4>
        <table className="w-full text-[12px] mb-4 border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)]">
              <th className="pb-2 pr-4 font-semibold">Field</th>
              <th className="pb-2 pr-4 font-semibold">Type</th>
              <th className="pb-2 pr-4 font-semibold">Required</th>
              <th className="pb-2 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-muted)]">
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">keyword</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2 pr-4">yes</td>
              <td className="py-2">The brief&apos;s target keyword (e.g. &laquo; cheap shoes &raquo;)</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">country</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2 pr-4">no</td>
              <td className="py-2">Lowercase ISO-2 country code (<Code>fr</Code>, <Code>us</Code>, <Code>uk</Code>…). Defaults to <Code>fr</Code></td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">folderId</td>
              <td className="py-2 pr-4">uuid</td>
              <td className="py-2 pr-4">no</td>
              <td className="py-2">Attaches the brief to a client folder (it must belong to the user, or be <Code>agency</Code> scoped)</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">myUrl</td>
              <td className="py-2 pr-4">url</td>
              <td className="py-2 pr-4">no</td>
              <td className="py-2">An existing URL to crawl. When given, its content is imported into the editor and an initial score is computed</td>
            </tr>
          </tbody>
        </table>

        <H4>Example (curl)</H4>
        <Pre>{`curl -X POST ${BASE}/api/v1/briefs \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keyword": "cheap running shoes",
    "country": "us",
    "myUrl": "https://my-site.com/category/shoes"
  }'`}</Pre>

        <H4>Immediate response (200)</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "message": "brief en cours d'analyse, interroger GET /api/v1/briefs/{id}"
}`}</Pre>
        <p className="text-[var(--text-muted)]">
          Store the <Code>id</Code> and move on to the next step to poll for the result.
        </p>

        <H4>Duplicate guard (response with duplicate: true)</H4>
        <p className="mb-3">
          If an identical brief (same <Code>keyword</Code> + <Code>country</Code> + <Code>folderId</Code>,
          case-insensitive) is already <Code>pending</Code>, or has been <Code>ready</Code> for less than
          10 minutes, the POST does NOT start another analysis: it returns the existing brief&apos;s id with
          <Code>duplicate: true</Code>.
        </p>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "duplicate": true,
  "keyword": "chaussure pas cher",
  "country": "fr",
  "folderId": null,
  "message": "un brief identique est déjà en cours d'analyse, interroger GET /api/v1/briefs/{id}"
}`}</Pre>
        <p className="text-[var(--text-muted)]">
          This matters for automated clients (scripts, AI agents): a POST that times out or returns a
          5xx has most likely created the brief anyway. Never blindly re-POST; the duplicate guard will
          hand you the existing one, or check first with <Code>GET /api/v1/briefs?keyword=…</Code> (section 2).
          Only a <Code>failed</Code> brief justifies a fresh POST.
        </p>
      </Section>

      <Section title="2. List and find your briefs (GET)" dot="var(--accent)">
        <p className="mb-3">
          Lists the account&apos;s briefs, newest first. Use it to check a brief does not already exist
          before creating one, or to recover the id of a brief whose POST response was lost.
        </p>
        <H4>Query params (all optional)</H4>
        <table className="w-full text-[12px] mb-4 border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)]">
              <th className="pb-2 pr-4 font-semibold">Param</th>
              <th className="pb-2 pr-4 font-semibold">Type</th>
              <th className="pb-2 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-muted)]">
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">keyword</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2">Exact, case-insensitive filter on the keyword</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">folderId</td>
              <td className="py-2 pr-4">uuid</td>
              <td className="py-2">Filter by folder</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">status</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2"><Code>pending</Code>, <Code>ready</Code> or <Code>failed</Code></td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">limit</td>
              <td className="py-2 pr-4">int</td>
              <td className="py-2">Maximum number of results, 20 by default, 100 max</td>
            </tr>
          </tbody>
        </table>
        <H4>Example (curl)</H4>
        <Pre>{`curl "${BASE}/api/v1/briefs?keyword=cheap%20running%20shoes&status=ready" \\
  -H "Authorization: Bearer dfk_xxxxxxxx"`}</Pre>
        <H4>Response (200)</H4>
        <Pre>{`{
  "briefs": [
    {
      "id": "a3c1b7e8-…",
      "keyword": "chaussure pas cher",
      "country": "fr",
      "status": "ready",
      "workflowStatus": "in_progress",
      "score": 26,
      "folderId": null,
      "createdAt": "2026-06-11T09:12:00.000Z",
      "updatedAt": "2026-06-11T09:13:21.000Z"
    }
  ]
}`}</Pre>
      </Section>

      <Section title="3. Read a brief (GET with polling)" dot="var(--accent)">
        <p className="mb-3">
          Call this endpoint every 3 to 5 seconds until you get <Code>status: &quot;ready&quot;</Code> or
          <Code>status: &quot;failed&quot;</Code>. Recommended client-side timeout: 90 seconds.
        </p>

        <H4>Example (curl)</H4>
        <Pre>{`curl ${BASE}/api/v1/briefs/a3c1b7e8-… \\
  -H "Authorization: Bearer dfk_xxxxxxxx"`}</Pre>

        <H4>Response — analysis running</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "keyword": "chaussure pas cher",
  "country": "fr",
  "message": "brief pas encore prêt, analyse en cours",
  "createdAt": "2026-04-25T09:12:00.000Z"
}`}</Pre>

        <H4>Response — brief ready</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "ready",
  "keyword": "chaussure pas cher",
  "country": "fr",
  "score": 26,
  "volume": 1400,
  "position": 34,
  "editorHtml": "<h1>…</h1><p>…</p>",
  "targetTerms": [
    { "term": "homme",  "avgCount": 14, "presence": 50 },
    { "term": "mules",  "avgCount":  7, "presence": 63 },
    { "term": "femme",  "avgCount": 15, "presence": 75 }
  ],
  "targetWordCount": 1091,
  "competitors": {
    "avg": 47,
    "best": 61,
    "bestUrl": "https://zalando-prive.fr/ventes-privees/chaussures/marque/",
    "count": 7
  },
  "createdAt": "2026-04-25T09:12:00.000Z",
  "updatedAt": "2026-04-25T09:12:38.000Z"
}`}</Pre>
        <p className="mb-3 text-[var(--text-muted)]">
          The fields that matter:
        </p>
        <ul className="list-disc pl-5 mb-3 text-[var(--text-muted)]">
          <li><Code>score</Code> — the current content&apos;s score out of 100 (0 when no content has been submitted)</li>
          <li><Code>competitors.avg</Code> — average SEO score across the crawled top 10 pages, computed with the same algorithm as yours. Your minimum target.</li>
          <li><Code>competitors.best</Code> — the best page&apos;s score on the SERP. Your stretch target.</li>
          <li><Code>competitors.bestUrl</Code> — the URL of that best page (worth a look)</li>
          <li><Code>targetTerms</Code> — keywords and phrases to work in, with how often competitors use them on average</li>
          <li><Code>targetWordCount</Code> — average content length in words</li>
          <li><Code>volume</Code> — monthly search volume (Haloscan)</li>
          <li><Code>position</Code> — where the folder&apos;s site currently ranks on this keyword (top 100)</li>
        </ul>

        <H4>Response — analysis failed</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "failed",
  "keyword": "chaussure pas cher",
  "country": "fr",
  "error": "no SERP results"
}`}</Pre>
      </Section>

      <Section title="4. Submit content and get the score" dot="var(--accent)">
        <p className="mb-3">
          Send the content as light HTML (<Code>&lt;h1&gt;</Code>, <Code>&lt;h2&gt;</Code>, <Code>&lt;h3&gt;</Code>, <Code>&lt;p&gt;</Code> tags).
          The text is stored on the brief and the score is recomputed server side, compared directly
          against the SERP competitors.
        </p>

        <H4>Example (curl)</H4>
        <Pre>{`curl -X POST ${BASE}/api/v1/briefs/a3c1b7e8-…/content \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "editorHtml": "<h1>Cheap running shoes for men and women</h1><p>…</p>"
  }'`}</Pre>

        <H4>Response (200)</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "score": 73,
  "breakdown": {
    "total": 73,
    "rawTotal": 78,
    "competitorMedian": 62,
    "keyword":      { "score": 12, "max": 15, "details": { "count": 6,  "density": 1.24 } },
    "nlpCoverage":  { "score": 22, "max": 27, "details": { "essentialsUsed": 14, "essentialsTotal": 14, "essentialsCoverage": 100, "essentialsScore": 17, "importantsUsed": 6, "importantsTotal": 18, "importantsScore": 5 } },
    "contentLength":{ "score":  6, "max":  7, "details": { "wc": 1083, "target": 1450 } },
    "headings":     { "score": 11, "max": 13, "details": { "h1": 1, "h2": 6, "h3": 3, "h1HasKw": true } },
    "placement":    { "score": 11, "max": 13, "details": { "distribution": "3/4 exact, 1/4 soft" } },
    "structure":    { "score":  4, "max":  6, "details": { "paragraphs": 12, "ratio": 0.85 } },
    "quality":      { "score":  4, "max":  5, "details": { "diversity": 52 } },
    "images":       { "score":  0, "max":  0, "details": { "count": 4, "target": 5 } },
    "semantic":     { "score":  7, "max": 10, "details": { "paragraphsScored": 12, "avgCosine": 0.74 } },
    "geo": { "total": 80, "table": {...}, "bulletList": {...}, "quickSummary": {...}, "faq": {...}, "statistics": {...} }
  },
  "competitors": {
    "avg": 47,
    "best": 61,
    "bestUrl": "https://zalando-prive.fr/ventes-privees/chaussures/marque/",
    "count": 7
  }
}`}</Pre>

        <H4>Reading the result (iteration 8, 2026-05-08)</H4>
        <ul className="list-disc pl-5 mb-3 text-[var(--text-muted)]">
          <li><Code>score</Code> and <Code>breakdown.total</Code>: the 0-100 score shown to users, <strong>relative to the top 10 median</strong>. Top 10 median = 50, median × 1.5 = 100. The median is floored at 60 (on weak competition, we calibrate as if it were 60).</li>
          <li><Code>rawTotal</Code>: the absolute score out of 100, with no relative calibration, for debugging or comparing across keywords.</li>
          <li><Code>competitorMedian</Code>: the median of the top 10 raw scores, the reference used for the relative calibration.</li>
          <li>Compare <Code>score</Code> with <Code>competitors.avg</Code>: above it, the content beats the SERP average.</li>
          <li>SEO weighting: keyword 15 + nlpCoverage 27 + contentLength 7 + headings 13 + placement 13 + structure 6 + quality 5 + semantic 10 = 96, normalised to 100. The images criterion has been neutralised (max 0) since iteration 9 but stays in the breakdown for compatibility. SEO_WEIGHT 0.92, GEO_WEIGHT 0.08.</li>
          <li><Code>breakdown.semantic</Code>: the paragraph semantic criterion (average cosine against the top 10 centroid via bge-m3). Computed on the editor side through <Code>POST /api/v2/briefs/&#123;id&#125;/semantic-paragraph</Code>. Neutralised (max=0) when no paragraph has been scored.</li>
          <li>Read <Code>breakdown</Code> to spot the weak areas (keyword, NLP coverage, structure…) and iterate.</li>
        </ul>
      </Section>

      <Section title="5. Generate a client share link" dot="var(--accent)">
        <p className="mb-3">
          The same links as the &laquo; Share &raquo; buttons in the UI, over the API. Two levels:
          the whole folder (the client sees all its briefs) and the single brief.
        </p>
        <ul className="list-disc pl-5 text-[var(--text-muted)] mb-3">
          <li>Folder: <Code>{BASE}/share/&#123;token&#125;</Code></li>
          <li>Brief: <Code>{BASE}/share-brief/&#123;token&#125;</Code></li>
        </ul>
        <p className="mb-3 text-[var(--text-muted)]">
          The link is read-only, needs no authentication, and <strong>never expires</strong>:
          only a <Code>DELETE</Code> (or the Revoke button in the UI) kills it.
          The <Code>POST</Code> is idempotent and returns the existing link when there is one,
          so you cannot accidentally invalidate a link already sent to a client. To rotate the
          token on purpose, pass <Code>&#123;&quot;regenerate&quot;: true&#125;</Code>: the old link 404s
          immediately.
        </p>

        <H4>Folder</H4>
        <Pre>{`# find the folder id
curl "${BASE}/api/v1/folders?q=quitoque" \\
  -H "Authorization: Bearer dfk_..."

# enable sharing (or get the existing link back)
curl -X POST ${BASE}/api/v1/folders/{folderId}/share \\
  -H "Authorization: Bearer dfk_..."

# sharing status
curl ${BASE}/api/v1/folders/{folderId}/share -H "Authorization: Bearer dfk_..."

# revoke
curl -X DELETE ${BASE}/api/v1/folders/{folderId}/share -H "Authorization: Bearer dfk_..."`}</Pre>

        <p className="mb-2 text-[var(--text-muted)]">POST response:</p>
        <Pre>{`{
  "folderId": "8f2c...",
  "name": "Quitoque",
  "shared": true,
  "created": true,
  "token": "kR3v...",
  "url": "${BASE}/share/kR3v..."
}`}</Pre>

        <H4>Brief</H4>
        <Pre>{`curl -X POST ${BASE}/api/v1/briefs/{briefId}/share \\
  -H "Authorization: Bearer dfk_..."

# rotate the token (invalidates the old link)
curl -X POST ${BASE}/api/v1/briefs/{briefId}/share \\
  -H "Authorization: Bearer dfk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"regenerate": true}'

curl -X DELETE ${BASE}/api/v1/briefs/{briefId}/share -H "Authorization: Bearer dfk_..."`}</Pre>

        <Pre>{`{
  "briefId": "a3c1b7e8-...",
  "keyword": "chaussures running",
  "shared": true,
  "created": false,
  "token": "9xQa...",
  "url": "${BASE}/share-brief/9xQa..."
}`}</Pre>
      </Section>

      <Section title="Node.js integration example" dot="var(--accent)">
        <Pre>{`import fetch from "node-fetch";

const API = "${BASE}/api/v1";
const KEY = process.env.CORPUS_API_KEY!;
const auth = { "Authorization": \`Bearer \${KEY}\`, "Content-Type": "application/json" };

async function run(keyword: string, editorHtml: string) {
  // 1. Create the brief
  const create = await fetch(\`\${API}/briefs\`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ keyword, country: "us" }),
  }).then(r => r.json());

  const id = create.id;

  // 2. Poll until ready
  let brief;
  for (let i = 0; i < 30; i++) {
    brief = await fetch(\`\${API}/briefs/\${id}\`, { headers: auth }).then(r => r.json());
    if (brief.status === "ready") break;
    if (brief.status === "failed") throw new Error(brief.error);
    await new Promise(r => setTimeout(r, 3000));
  }

  // 3. Submit the content and read the score
  const scored = await fetch(\`\${API}/briefs/\${id}/content\`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ editorHtml }),
  }).then(r => r.json());

  console.log(\`Score: \${scored.score}/100 (SERP average: \${scored.competitors?.avg}, best: \${scored.competitors?.best})\`);
}`}</Pre>
      </Section>

      <Section title="API V2, granular reads" dot="var(--accent-dark)">
        <p className="mb-3">
          V2 is read-only. It exposes the full depth of the corpus analysis
          (SERP, competitors, NLP, detailed scoring, Haloscan) across separate endpoints so you only
          load what you need. Same authentication as V1, same key.
        </p>
        <p className="mb-3 text-[var(--text-muted)]">
          V2 does not create briefs. For that, use <Code>POST /api/v1/briefs</Code> and wait for
          <Code>status</Code> to turn <Code>ready</Code>. Briefs still
          <Code>pending</Code> or <Code>failed</Code> return their status with no payload.
        </p>

        <H4>GET /api/v2/briefs/&#123;id&#125;</H4>
        <p className="mb-2 text-[var(--text-muted)]">Enriched summary of the brief.</p>
        <Pre>{`{
  "id": "...",
  "status": "ready",
  "keyword": "chaussures running",
  "country": "fr",
  "score": 78,
  "intent": "commercial",
  "targetWordCount": 1850,
  "minWordCount": 920, "maxWordCount": 3200,
  "avgHeadings": 24, "avgParagraphs": 42,
  "competitors": { "avg": 71, "best": 85, "bestUrl": "https://...", "count": 9 },
  "position": 4,
  "volume": 5400, "cpc": 0.42, "competition": 0.31,
  "kgr": 0.18, "allintitleCount": 980,
  "createdAt": "...", "updatedAt": "..."
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/serp</H4>
        <p className="mb-2 text-[var(--text-muted)]">Raw SERP top 10 plus People Also Ask.</p>
        <Pre>{`{
  "id": "...",
  "keyword": "...",
  "country": "fr",
  "results": [
    { "position": 1, "title": "...", "link": "https://...",
      "snippet": "...", "displayed_link": "..." },
    ...
  ],
  "paa": [
    { "question": "Comment ...", "snippet": "...", "link": "https://..." }
  ]
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          The 10 competitors enriched (headings, outline, score, word count). The body text is not
          included here, to keep the payload bounded; ask
          <Code>/competitors/&#123;n&#125;</Code> for it.
        </p>
        <Pre>{`{
  "id": "...",
  "keyword": "...",
  "stats": { "avg": 71, "best": 85, "bestUrl": "...", "count": 9 },
  "competitors": [
    {
      "position": 1,
      "title": "...", "link": "...", "displayed_link": "...", "snippet": "...",
      "wordCount": 2480, "headings": 28, "paragraphs": 47,
      "h1": ["..."], "h2": ["...", "..."], "h3": ["...", "..."],
      "outline": [
        { "level": 1, "text": "..." },
        { "level": 2, "text": "..." }
      ],
      "score": 85,
      "hasContent": true
    },
    ...
  ]
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          One competitor at position <Code>n</Code> (1 to 10) in detail, with its raw text and its
          HTML rebuilt in document order. Briefs created before content persistence was added return
          <Code>text</Code> and <Code>structuredHtml</Code> as <Code>null</Code>.
        </p>
        <Pre>{`{
  "id": "...",
  "keyword": "...",
  "competitor": {
    "position": 3,
    "title": "...", "link": "https://...",
    "displayed_link": "...", "snippet": "...",
    "wordCount": 2110, "headings": 22, "paragraphs": 38,
    "h1": ["..."], "h2": [...], "h3": [...],
    "outline": [...],
    "score": 79,
    "text": "Texte brut nettoyé, sans markup, séparé par des espaces ...",
    "structuredHtml": "<h1>...</h1><p>...</p><h2>...</h2><p>...</p>..."
  }
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/download</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Downloads a competitor&apos;s rebuilt HTML in a ready-to-publish format. Query param
          <Code>format=html|docx</Code>. Returns
          <Code>404 competitor content not available</Code> on briefs created before 2026-05-02
          (content was not stored before that date).
        </p>
        <Pre>{`GET /api/v2/briefs/{id}/competitors/3/download?format=html
→ Content-Type: text/html; charset=utf-8
→ Content-Disposition: attachment; filename="comparatif-scooter-3-cleanrider-com.html"

GET /api/v2/briefs/{id}/competitors/3/download?format=docx
→ Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
→ Content-Disposition: attachment; filename="comparatif-scooter-3-cleanrider-com.docx"`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/print</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Serves a standalone HTML page that triggers the browser print dialog by itself.
          The reader picks &quot;Save as PDF&quot; to get a PDF of the competitor&apos;s content.
          Same technique as the PDF export of your own draft.
          Open it straight in a tab (<Code>window.open</Code>), not through fetch.
        </p>
        <Pre>{`GET /api/v2/briefs/{id}/competitors/3/print
→ Content-Type: text/html; charset=utf-8
→ Body: <!doctype html>...<script>window.print()</script></html>`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/nlp</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          The complete NLP output: terms weighted by frequency and semantic embeddings,
          topic clusters, sections detected across the SERP, entities, PAA opportunities.
        </p>
        <Pre>{`{
  "id": "...", "keyword": "...", "intent": "commercial",
  "exactKeyword": {
    "keyword": "...", "variations": [...],
    "avgCount": 12, "avgDensity": 0.42,
    "idealDensityMin": 0.3, "idealDensityMax": 0.6,
    "inH1Pct": 80, "inH2Pct": 30, "inFirst100Pct": 90
  },
  "keywordTerms": [
    { "term": "...", "kind": "exact", "presence": 90, "inHeadings": true,
      "minCount": 4, "maxCount": 18, "avgCount": 11 }
  ],
  "nlpTerms": [
    { "term": "...", "variants": [...], "score": 0.84,
      "presence": 80, "df": 8, "inHeadings": true,
      "minCount": 1, "maxCount": 6, "avgCount": 3.2,
      "semanticScore": 0.71 }
  ],
  "semanticClusters": [
    { "label": "couleurs", "terms": ["rouge", "noir", "blanc", ...] }
  ],
  "sections": [
    { "label": "Comment choisir", "hits": 7, "total": 9,
      "sampleHeadings": [...], "keyTerms": [...] }
  ],
  "entities": [
    { "label": "Asics", "hits": 6, "total": 9, "totalOccurrences": 22 }
  ],
  "opportunities": [
    { "type": "paa", "text": "Quelle pointure choisir ?", "competitorCoverage": 11 }
  ],
  "stats": {
    "avgWordCount": 1850, "avgHeadings": 24, "avgParagraphs": 42,
    "minWordCount": 920, "maxWordCount": 3200
  }
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/paa</H4>
        <p className="mb-2 text-[var(--text-muted)]">People Also Ask on their own.</p>
        <Pre>{`{
  "id": "...",
  "keyword": "...",
  "paa": [
    { "question": "...", "snippet": "...", "link": "https://..." }
  ]
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/scoring</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          The detailed score breakdown, recomputed on the HTML currently stored on the brief
          (updated by every <Code>POST /content</Code>). 8 SEO criteria plus semantics and a GEO block.
          The <Code>total</Code> is <strong>relative to the top 10 median</strong>
          (median = 50, median × 1.5 = 100, median floored at 60).
        </p>
        <Pre>{`{
  "id": "...", "keyword": "...",
  "total": 78,
  "rawTotal": 76,
  "breakdownTotal": 73,
  "competitorMedian": 62,
  "seoTotal": 82, "geoTotal": 70,
  "breakdown": {
    "keyword":      { "score": 13, "max": 15, "details": { ... } },
    "nlpCoverage":  { "score": 22, "max": 27, "details": {
      "essentialsUsed": 14, "essentialsTotal": 14, "essentialsScore": 17,
      "importantsUsed": 7, "importantsTotal": 18, "importantsScore": 5
    } },
    "contentLength":{ "score":  6, "max":  7, "details": { "wc": 1840, "target": 2100 } },
    "headings":     { "score": 11, "max": 13, "details": { ... } },
    "placement":    { "score": 11, "max": 13, "details": { ... } },
    "structure":    { "score":  4, "max":  6, "details": { ... } },
    "quality":      { "score":  4, "max":  5, "details": { ... } },
    "images":       { "score":  0, "max":  0, "details": { "count": 4, "target": 5 } },
    "geo":          { "total": 70, ... }
  },
  "competitors": { "avg": 71, "best": 85, "bestUrl": "...", "count": 9 },
  "editorWordCount": 1840
}`}</Pre>
        <p className="text-[var(--text-muted)] mb-2 text-[12px]">
          <strong>Notes:</strong> <Code>total</Code> is the score shown to the user
          (it preserves the score persisted by the editor, which includes the semantic criterion
          computed live). <Code>breakdownTotal</Code> is the server-side total without the semantic
          criterion (that one is computed client side through the
          <Code>/semantic-paragraph</Code> endpoint). API consumers who want to include semantics
          programmatically should embed their paragraphs through that endpoint and apply the
          cosine → score mapping (0.85 → 10, 0.65 → 5, 0.45 → 2).
        </p>

        <H4>POST /api/v2/briefs/&#123;id&#125;/semantic-paragraph</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Embeds a paragraph through Workers AI bge-m3 and returns its cosine against the brief&apos;s
          top 10 semantic centroid. Use it to score paragraphs one by one and spot the ones drifting
          off topic. The corpus editor calls it live (2s debounce per edited paragraph).
        </p>
        <Pre>{`POST /api/v2/briefs/{id}/semantic-paragraph
Content-Type: application/json

{
  "paragraph": "Le thé matcha est riche en antioxydants et en catéchines..."
}`}</Pre>
        <H4>Response (200, centroid available)</H4>
        <Pre>{`{
  "centroidAvailable": true,
  "score": 0.903,
  "color": "green"
}`}</Pre>
        <H4>Response (200, brief older than iteration 8, no centroid)</H4>
        <Pre>{`{
  "centroidAvailable": false
}`}</Pre>
        <p className="text-[var(--text-muted)] mb-2 text-[12px]">
          <strong>Colours:</strong> green ≥ 0.75, amber 0.55-0.75, red &lt; 0.55. The
          paragraph must hold at least 5 meaningful words, otherwise the endpoint returns 400. The
          centroid only exists on briefs created after 2026-05-08 (the semantic iteration).
        </p>

        <H4>GET /api/v2/briefs/&#123;id&#125;/haloscan</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          A snapshot of the fields projected into columns, plus the raw Haloscan payload.
          Returns <Code>404 haloscan data unavailable</Code> when the brief has no Haloscan
          enrichment (missing key, or the keyword was not found).
        </p>
        <Pre>{`{
  "id": "...", "keyword": "...",
  "summary": {
    "volume": 5400, "cpc": 0.42, "competition": 0.31,
    "kgr": 0.18, "allintitleCount": 980
  },
  "raw": { /* payload Haloscan complet */ }
}`}</Pre>
      </Section>

      <Section title="Error codes" dot="var(--red)">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)]">
              <th className="pb-2 pr-4 font-semibold">Code</th>
              <th className="pb-2 pr-4 font-semibold">Message</th>
              <th className="pb-2 font-semibold">Cause</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-muted)]">
            <Err code="401" msg="unauthorized" cause="Key missing, invalid or revoked" />
            <Err code="400" msg="keyword required" cause="JSON body without a keyword (V1 POST)" />
            <Err code="400" msg="editorHtml required" cause="Body without editorHtml on POST /content" />
            <Err code="400" msg="invalid position" cause="V2 /competitors/{n} with a non-numeric n, or n < 1" />
            <Err code="403" msg="folder not accessible" cause="The folder does not exist, or does not belong to this user" />
            <Err code="404" msg="not found" cause="Brief not found" />
            <Err code="404" msg="competitor not found at position" cause="The requested position is not in the stored top 10" />
            <Err code="404" msg="nlp data unavailable" cause="V2 /nlp or /scoring on a brief with no usable NLP" />
            <Err code="404" msg="haloscan data unavailable" cause="V2 /haloscan on a brief with no Haloscan payload" />
            <Err code="409" msg="brief not ready yet" cause="Tried to score a brief still pending" />
            <Err code="409" msg="brief analysis failed" cause="The initial SERP analysis had failed" />
            <Err code="502" msg="no SERP results" cause="SerpAPI returned nothing (surfaced as status:failed)" />
            <Err code="500" msg="SERPAPI_KEY missing on server" cause="Secret not configured on the Worker" />
          </tbody>
        </table>
      </Section>

      <Section title="Limits and good practice" dot="var(--text-muted)">
        <ul className="list-disc pl-5 text-[var(--text-muted)]">
          <li>Every brief burns one SerpAPI call, one Haloscan call and 10 HTTP crawls. Avoid re-running the same keyword.</li>
          <li>On an error or a timed-out POST, do not re-POST in a loop: the brief was often created anyway. Check with <Code>GET /api/v1/briefs?keyword=…</Code>; the duplicate guard (section 1) is your safety net.</li>
          <li>Scoring is deterministic: same content, same brief, same score.</li>
          <li>Calls are attached to the calling user, and every colleague sees the brief in the interface (shared workspace).</li>
          <li>No rate limit for now (internal use). Be reasonable.</li>
          <li>Keys can be revoked at any time from <Link href="/app/settings" className="underline font-semibold">Settings</Link>, and it takes effect immediately.</li>
        </ul>
      </Section>
    </>
  );
}
