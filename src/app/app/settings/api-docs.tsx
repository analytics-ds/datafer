const BASE = "https://datafer.analytics-e0d.workers.dev";

export function ApiDocs() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] text-[13px] leading-relaxed">
      <p className="mb-4">
        L'API permet de créer un brief, de récupérer son score et de soumettre du contenu à scorer, depuis n'importe quel
        outil (script, N8N, Make, Postman…). Toutes les requêtes doivent inclure ta clé API dans l'en-tête <Code>Authorization</Code>.
      </p>

      <H3>Authentification</H3>
      <Pre>{`Authorization: Bearer dfk_xxxxxxxxxxxxxxxxxxxxxx`}</Pre>

      <H3>1. Créer un brief (asynchrone)</H3>
      <p className="mb-2 text-[var(--text-muted)]">
        Le POST renvoie immédiatement l'id avec <Code>status: "pending"</Code>. L'analyse SERP + Haloscan + crawl tourne
        en background (30-60s). Il faut ensuite <b>poller le GET</b> jusqu'à ce que <Code>status</Code> passe à{" "}
        <Code>ready</Code> (ou <Code>failed</Code>). <Code>folderId</Code> et <Code>myUrl</Code> sont optionnels.
      </p>
      <Pre>{`curl -X POST ${BASE}/api/v1/briefs \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keyword": "rideau thermique",
    "country": "fr",
    "myUrl": "https://monsite.com/ma-page"
  }'`}</Pre>
      <p className="mb-2 text-[var(--text-muted)]">Réponse immédiate :</p>
      <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "message": "brief en cours d'analyse, interroger GET /api/v1/briefs/{id}"
}`}</Pre>

      <H3>2. Lire un brief (polling)</H3>
      <Pre>{`curl ${BASE}/api/v1/briefs/<id> \\
  -H "Authorization: Bearer dfk_xxxxxxxx"`}</Pre>
      <p className="mb-2 text-[var(--text-muted)]">Tant que l'analyse tourne :</p>
      <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "keyword": "rideau thermique",
  "country": "fr",
  "message": "brief pas encore prêt, analyse en cours"
}`}</Pre>
      <p className="mb-2 text-[var(--text-muted)]">Une fois prêt :</p>
      <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "ready",
  "keyword": "rideau thermique",
  "country": "fr",
  "score": 42,
  "volume": 1200,
  "position": 34,
  "editorHtml": "<h1>…</h1><p>…</p>",
  "targetTerms": [
    { "term": "isolation", "avgCount": 14, "presence": 0.9 },
    { "term": "occultant",  "avgCount": 6,  "presence": 0.7 }
  ],
  "targetWordCount": 1420
}`}</Pre>
      <p className="mb-2 text-[var(--text-muted)]">En cas d'échec :</p>
      <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "failed",
  "error": "no SERP results"
}`}</Pre>

      <H3>3. Soumettre du contenu et récupérer le score</H3>
      <p className="mb-2 text-[var(--text-muted)]">
        Le contenu doit être du HTML léger avec les balises <Code>h1</Code>, <Code>h2</Code>, <Code>h3</Code>, <Code>p</Code>.
        Le texte est stocké sur le brief et le score est recalculé côté serveur.
      </p>
      <Pre>{`curl -X POST ${BASE}/api/v1/briefs/<id>/content \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "editorHtml": "<h1>Rideau thermique</h1><p>Texte optimisé…</p>"
  }'`}</Pre>
      <p className="mb-2 text-[var(--text-muted)]">Réponse :</p>
      <Pre>{`{
  "id": "a3c1b7e8-…",
  "score": 73,
  "breakdown": {
    "total": 73,
    "keyword":      { "score": 12, "max": 15, "details": { … } },
    "nlpCoverage":  { "score": 14, "max": 20, "details": { … } },
    "contentLength":{ "score": 10, "max": 12, "details": { … } },
    "headings":     { "score": 15, "max": 18, "details": { … } },
    "placement":    { "score": 11, "max": 15, "details": { … } },
    "structure":    { "score":  6, "max": 10, "details": { … } },
    "quality":      { "score":  5, "max": 10, "details": { … } }
  }
}`}</Pre>

      <H3>Erreurs</H3>
      <ul className="list-disc pl-5 mb-2 text-[var(--text-muted)]">
        <li><Code>401 unauthorized</Code> : clé absente, invalide ou révoquée</li>
        <li><Code>400 keyword required</Code> / <Code>editorHtml required</Code> : body mal formé</li>
        <li><Code>403 folder not accessible</Code> : dossier inaccessible pour ce user</li>
        <li><Code>404 not found</Code> : brief introuvable</li>
        <li><Code>409 brief not ready yet</Code> : tentative de scorer un brief pas encore analysé</li>
        <li><Code>502 no SERP results</Code> : échec SerpAPI (remonté en <Code>status:"failed"</Code>)</li>
      </ul>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-semibold mt-6 mb-2">{children}</h3>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="font-mono text-[12px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] p-3 mb-3 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] bg-[var(--bg-dark)]/10 rounded px-1 py-[1px]">
      {children}
    </code>
  );
}
