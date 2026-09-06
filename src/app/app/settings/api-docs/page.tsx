import Link from "next/link";
import { PageHeader } from "../../_ui";

const BASE = "https://datafer.analytics-e0d.workers.dev";

export default function ApiDocsPage() {
  return (
    <div className="px-10 py-10 max-w-[920px]">
      <div className="mb-4">
        <Link
          href="/app/settings"
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] font-semibold uppercase tracking-[0.2px]"
        >
          ← Retour aux paramètres
        </Link>
      </div>

      <PageHeader
        title={<>Documentation API<span className="df-accent">.</span></>}
        subtitle="Intègre corpus dans ta stack pour créer un brief, récupérer le score et envoyer du contenu à scorer."
      />

      <Section title="Vue d'ensemble" dot="var(--accent)">
        <p className="mb-3">
          L&apos;API corpus expose deux familles d&apos;endpoints pour piloter les briefs depuis l&apos;extérieur
          (script, N8N, Make, Postman, Zapier, etc.). Le modèle est asynchrone : on crée un brief,
          on interroge son statut jusqu&apos;à ce qu&apos;il soit prêt, puis on soumet le contenu
          pour récupérer un score comparé à celui de la concurrence SERP.
        </p>
        <H4>API V1 (création + scoring)</H4>
        <ul className="list-disc pl-5 text-[var(--text-muted)] mb-3">
          <li><Code>POST /api/v1/briefs</Code>, crée un brief et lance l&apos;analyse (anti-doublon intégré)</li>
          <li><Code>GET /api/v1/briefs</Code>, liste les briefs, filtrable par <Code>keyword</Code> / <Code>folderId</Code> / <Code>status</Code></li>
          <li><Code>GET /api/v1/briefs/&#123;id&#125;</Code>, lit le brief, renvoie <Code>pending</Code> / <Code>ready</Code> / <Code>failed</Code></li>
          <li><Code>POST /api/v1/briefs/&#123;id&#125;/content</Code>, soumet du contenu HTML et reçoit le score détaillé</li>
          <li><Code>GET /api/v1/folders</Code>, liste les dossiers clients, filtrable par <Code>name</Code> / <Code>q</Code></li>
          <li><Code>POST /api/v1/folders</Code>, crée un dossier client (anti-doublon sur le nom)</li>
          <li><Code>GET /api/v1/folders/&#123;id&#125;</Code>, détail d&apos;un dossier</li>
          <li><Code>PATCH /api/v1/folders/&#123;id&#125;</Code>, renomme un dossier ou met à jour son site / ses notes / son sitemap</li>
        </ul>
        <H4>API V2 (lecture étendue, granulaire)</H4>
        <ul className="list-disc pl-5 text-[var(--text-muted)] mb-3">
          <li><Code>GET /api/v2/briefs/&#123;id&#125;</Code>, résumé enrichi (intent, stats SERP, snapshot Haloscan)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/serp</Code>, top 10 brut + People Also Ask</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors?content=text|html|markdown|all</Code>, les 10 concurrents enrichis (Hn, outline, score, wordCount) <strong>et leur contenu en un seul appel</strong></li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;</Code>, détail d&apos;un concurrent avec son texte brut, son HTML reconstitué et son Markdown</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/content?format=text|html|markdown</Code>, le contenu brut d&apos;un concurrent, sans enveloppe JSON</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/download?format=html|markdown|docx</Code>, télécharge le contenu d&apos;un concurrent en HTML, Markdown ou Word</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/print</Code>, page imprimable d&apos;un concurrent (Save as PDF côté navigateur)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/nlp</Code>, NLP complet (termes, clusters, sections, entités, opportunités, intent)</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/paa</Code>, People Also Ask seuls</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/scoring</Code>, breakdown détaillé du score (10 critères SEO dont sémantique et saillance, + bloc GEO)</li>
          <li><Code>POST /api/v2/briefs/&#123;id&#125;/semantic-paragraph</Code>, embed un paragraphe et retourne sa proximité sémantique vs le centroïde top 10</li>
          <li><Code>GET /api/v2/briefs/&#123;id&#125;/haloscan</Code>, payload Haloscan brut + summary</li>
        </ul>
        <p className="text-[var(--text-muted)]">
          Base URL : <Code>{BASE}</Code>. Auth identique pour V1 et V2 (Bearer <Code>dfk_...</Code>).
        </p>
      </Section>

      <Section title="Authentification" dot="var(--brand-blue)">
        <p className="mb-3">
          Toutes les requêtes doivent inclure une clé API au format Bearer dans l'en-tête
          <Code>Authorization</Code>. Les clés sont générées depuis la page <Link href="/app/settings" className="underline font-semibold">Paramètres → Clés API</Link>.
          Une clé n'est affichée qu'au moment de sa génération, seul son hash SHA-256 est stocké en base.
        </p>
        <Pre>{`Authorization: Bearer dfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Pre>
        <p className="text-[var(--text-muted)]">
          Une clé révoquée renvoie <Code>401 unauthorized</Code> immédiatement. On peut en avoir autant que
          nécessaire, à nommer pour savoir qui utilise quoi (« script N8N », « collègue X »,
          « intégration Make », etc.).
        </p>
      </Section>

      <Section title="1. Créer un brief (POST asynchrone)" dot="var(--accent)">
        <p className="mb-3">
          Le POST renvoie immédiatement un identifiant avec <Code>status: &quot;pending&quot;</Code>. L'analyse lourde
          (SERP, crawl des 10 premiers résultats, Haloscan, NLP, scoring des concurrents) tourne en tâche
          de fond pendant 20 à 60 secondes selon la complexité de la requête.
        </p>
        <H4>Paramètres du body (JSON)</H4>
        <table className="w-full text-[12px] mb-4 border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)]">
              <th className="pb-2 pr-4 font-semibold">Champ</th>
              <th className="pb-2 pr-4 font-semibold">Type</th>
              <th className="pb-2 pr-4 font-semibold">Requis</th>
              <th className="pb-2 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-muted)]">
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">keyword</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2 pr-4">oui</td>
              <td className="py-2">Mot-clé cible du brief (ex : « chaussure pas cher »)</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">country</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2 pr-4">non</td>
              <td className="py-2">Code pays ISO-2 en minuscule (<Code>fr</Code>, <Code>be</Code>, <Code>ca</Code>…). Défaut : <Code>fr</Code></td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">folderId</td>
              <td className="py-2 pr-4">uuid</td>
              <td className="py-2 pr-4">non</td>
              <td className="py-2">Rattachement à un dossier client (doit appartenir au user ou être de scope <Code>agency</Code>)</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">myUrl</td>
              <td className="py-2 pr-4">url</td>
              <td className="py-2 pr-4">non</td>
              <td className="py-2">URL existante à crawler. Si fournie, son contenu est importé dans l'éditeur et un score initial est calculé</td>
            </tr>
          </tbody>
        </table>

        <H4>Exemple (curl)</H4>
        <Pre>{`curl -X POST ${BASE}/api/v1/briefs \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keyword": "chaussure pas cher",
    "country": "fr",
    "myUrl": "https://mon-site.fr/categorie/chaussures"
  }'`}</Pre>

        <H4>Réponse immédiate (200)</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "message": "brief en cours d'analyse, interroger GET /api/v1/briefs/{id}"
}`}</Pre>
        <p className="text-[var(--text-muted)]">
          Stocke l'<Code>id</Code> et passe à l'étape suivante pour poller le résultat.
        </p>

        <H4>Anti-doublon (réponse avec duplicate: true)</H4>
        <p className="mb-3">
          Si un brief identique (même <Code>keyword</Code> + <Code>country</Code> + <Code>folderId</Code>,
          insensible à la casse) est déjà en <Code>pending</Code>, ou en <Code>ready</Code> depuis moins de
          10 minutes, le POST ne relance PAS d&apos;analyse : il renvoie l&apos;id du brief existant avec
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
          Important pour les clients automatisés (scripts, agents IA) : un POST qui timeout ou renvoie une
          erreur 5xx a probablement quand même créé le brief. Ne re-POST jamais à l&apos;aveugle, l&apos;anti-doublon
          te renverra l&apos;existant, ou vérifie d&apos;abord via <Code>GET /api/v1/briefs?keyword=…</Code> (section 2).
          Seul un brief <Code>failed</Code> justifie un nouveau POST.
        </p>
      </Section>

      <Section title="2. Lister / retrouver ses briefs (GET)" dot="var(--accent)">
        <p className="mb-3">
          Liste les briefs du compte, du plus récent au plus ancien. Sert à vérifier qu&apos;un brief
          n&apos;existe pas déjà avant d&apos;en créer un, ou à retrouver l&apos;id d&apos;un brief dont la réponse
          du POST s&apos;est perdue.
        </p>
        <H4>Query params (tous optionnels)</H4>
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
              <td className="py-2">Filtre exact (insensible à la casse) sur le mot-clé</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">folderId</td>
              <td className="py-2 pr-4">uuid</td>
              <td className="py-2">Filtre par dossier</td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">status</td>
              <td className="py-2 pr-4">string</td>
              <td className="py-2"><Code>pending</Code>, <Code>ready</Code> ou <Code>failed</Code></td>
            </tr>
            <tr className="border-t border-[var(--border)]">
              <td className="py-2 pr-4 font-code text-[var(--text)]">limit</td>
              <td className="py-2 pr-4">int</td>
              <td className="py-2">Nombre max de résultats, défaut 20, max 100</td>
            </tr>
          </tbody>
        </table>
        <H4>Exemple (curl)</H4>
        <Pre>{`curl "${BASE}/api/v1/briefs?keyword=chaussure%20pas%20cher&status=ready" \\
  -H "Authorization: Bearer dfk_xxxxxxxx"`}</Pre>
        <H4>Réponse (200)</H4>
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

      <Section title="3. Lire un brief (GET avec polling)" dot="var(--accent)">
        <p className="mb-3">
          Appelle cet endpoint toutes les 3 à 5 secondes jusqu'à obtenir <Code>status: &quot;ready&quot;</Code> ou
          <Code>status: &quot;failed&quot;</Code>. Timeout conseillé côté client : 90 secondes.
        </p>

        <H4>Exemple (curl)</H4>
        <Pre>{`curl ${BASE}/api/v1/briefs/a3c1b7e8-… \\
  -H "Authorization: Bearer dfk_xxxxxxxx"`}</Pre>

        <H4>Réponse — analyse en cours</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "pending",
  "keyword": "chaussure pas cher",
  "country": "fr",
  "message": "brief pas encore prêt, analyse en cours",
  "createdAt": "2026-04-25T09:12:00.000Z"
}`}</Pre>

        <H4>Réponse — brief prêt</H4>
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
          Les champs clés :
        </p>
        <ul className="list-disc pl-5 mb-3 text-[var(--text-muted)]">
          <li><Code>score</Code> — note /100 du contenu actuel (ou 0 si pas de contenu soumis)</li>
          <li><Code>competitors.avg</Code> — moyenne du score SEO calculée sur les pages du top 10 crawlées, avec le même algorithme que le tien. Objectif minimum.</li>
          <li><Code>competitors.best</Code> — score de la meilleure page de la SERP. Objectif haut.</li>
          <li><Code>competitors.bestUrl</Code> — URL de cette meilleure page (pour inspiration)</li>
          <li><Code>targetTerms</Code> — mots-clés et expressions à intégrer, avec le nombre moyen d'occurrences chez les concurrents</li>
          <li><Code>targetWordCount</Code> — longueur moyenne du contenu en mots</li>
          <li><Code>volume</Code> — volume de recherche mensuel (Haloscan)</li>
          <li><Code>position</Code> — position actuelle du site du dossier sur ce mot-clé (top 100)</li>
        </ul>

        <H4>Réponse — analyse échouée</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "status": "failed",
  "keyword": "chaussure pas cher",
  "country": "fr",
  "error": "no SERP results"
}`}</Pre>
      </Section>

      <Section title="4. Soumettre du contenu et récupérer le score" dot="var(--accent)">
        <p className="mb-3">
          Envoie le contenu en HTML léger (balises <Code>&lt;h1&gt;</Code>, <Code>&lt;h2&gt;</Code>, <Code>&lt;h3&gt;</Code>, <Code>&lt;p&gt;</Code>).
          Le texte est stocké sur le brief et le score est recalculé côté serveur, avec comparaison directe
          aux concurrents SERP.
        </p>

        <H4>Exemple (curl)</H4>
        <Pre>{`curl -X POST ${BASE}/api/v1/briefs/a3c1b7e8-…/content \\
  -H "Authorization: Bearer dfk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "editorHtml": "<h1>Chaussures pas cher pour homme et femme</h1><p>…</p>"
  }'`}</Pre>

        <H4>Réponse (200)</H4>
        <Pre>{`{
  "id": "a3c1b7e8-…",
  "score": 73,
  "breakdown": {
    "total": 73,
    "rawTotal": 78,
    "competitorMedian": 62,
    "keyword":      { "score": 12, "max": 15, "details": { "count": 6,  "density": 1.24 } },
    "nlpCoverage":  { "score": 18, "max": 22, "details": { "essentialsUsed": 14, "essentialsTotal": 14, "essentialsCoverage": 100, "essentialsScore": 14, "importantsUsed": 6, "importantsTotal": 18, "importantsScore": 4 } },
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

        <H4>Lecture du résultat (formule 13, 2026-09-06)</H4>
        <ul className="list-disc pl-5 mb-3 text-[var(--text-muted)]">
          <li><Code>score</Code>, <Code>breakdown.total</Code> et <Code>rawTotal</Code> : le même score absolu 0-100. La relativisation à la médiane des concurrents n&apos;est plus appliquée depuis le 2026-05-16, le score du contenu rédigé est directement comparable aux scores des concurrents. <Code>competitorMedian</Code> reste donc à 0 sur ce chemin.</li>
          <li>Compare <Code>score</Code> à <Code>competitors.avg</Code> et <Code>competitors.best</Code> : c&apos;est <Code>best</Code> qui sert d&apos;objectif.</li>
          <li>Pondération SEO : keyword 15 + nlpCoverage 22 + differentiation 4 + contentLength 7 + headings 13 + placement 13 + structure 6 + quality 5 + salience 4 + semantic 15 = 104, renormalisé sur 100. SEO_WEIGHT 0.92, GEO_WEIGHT 0.08.</li>
          <li><strong>Critères neutralisables</strong> : un critère non applicable passe à <Code>max: 0</Code> et sort de la renormalisation, il ne coûte ni ne rapporte rien. C&apos;est le cas d&apos;<Code>images</Code> (retiré depuis l&apos;itération 9, conservé pour compatibilité), de <Code>differentiation</Code> quand le mot-clé n&apos;a aucune opportunité, de <Code>semantic</Code> sans centroïde, et de <Code>nlpCoverage</Code> quand un palier est vide : <Code>max</Code> tombe à 14 s&apos;il n&apos;y a aucun terme important, à 8 s&apos;il n&apos;y a aucun essentiel, à 0 si le mot-clé n&apos;a que des opportunités. Lis toujours <Code>score</Code> rapporté à <Code>max</Code>, jamais le score seul.</li>
          <li><Code>breakdown.semantic</Code> : cosinus moyen des paragraphes rédigés vs le centroïde du top 10 (bge-m3). Depuis le 2026-09-06 il est calculé aussi côté serveur, sur les mêmes blocs que l&apos;éditeur (p / ul / ol d&apos;au moins 5 mots, 40 blocs au maximum) : le score renvoyé par l&apos;API est donc celui qu&apos;affiche l&apos;éditeur. Neutralisé sur les briefs analysés avant l&apos;introduction du centroïde.</li>
          <li><Code>breakdown.salience</Code> : la première mention du mot-clé dans le corps est-elle en gras ou en emphase. Détectée côté serveur depuis le HTML transmis, plus besoin de passer par l&apos;éditeur.</li>
          <li><Code>breakdown.structure.target</Code> : nombre moyen de blocs de contenu chez les concurrents (titres, paragraphes, items de liste, lignes de tableau). Le ratio visé est entre 0,7 et 1,4 fois cette référence.</li>
          <li>Regarde <Code>breakdown</Code> pour identifier les axes faibles (mot-clé, couverture NLP, structure…) et itérer.</li>
        </ul>
      </Section>

      <Section title="Dossiers clients (folders)" dot="var(--brand-blue)">
        <p className="mb-3">
          Un brief se range dans un dossier client via son <Code>folderId</Code>. Ces endpoints
          permettent de créer le dossier depuis un script, sans passer par l&apos;interface, puis
          d&apos;enchaîner directement sur la création des briefs.
        </p>

        <H4>GET /api/v1/folders</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Liste les dossiers visibles (tous les dossiers d&apos;agence + les dossiers personnels du
          compte), triés par nom. Params : <Code>name</Code> (égalité insensible à la casse),
          <Code>q</Code> (recherche partielle), <Code>limit</Code> (défaut 100, max 500).
        </p>
        <Pre>{`curl "${BASE}/api/v1/folders?q=celio" \\
  -H "Authorization: Bearer dfk_..."

{
  "folders": [
    {
      "id": "f1a2b3c4-…",
      "name": "Celio",
      "website": "https://www.celio.com",
      "scope": "agency",
      "notes": null,
      "sitemapUrl": null,
      "shared": false,
      "createdAt": "2026-09-06T09:12:04.000Z",
      "updatedAt": "2026-09-06T09:12:04.000Z"
    }
  ]
}`}</Pre>

        <H4>POST /api/v1/folders</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Crée un dossier. Seul <Code>name</Code> est obligatoire. Champs optionnels :
          <Code>website</Code>, <Code>notes</Code>, <Code>sitemapUrl</Code>, <Code>scope</Code>
          (<Code>agency</Code> par défaut, comme dans l&apos;interface).
        </p>
        <p className="mb-2 text-[var(--text-muted)]">
          Anti-doublon : si un dossier visible porte déjà ce nom (à la casse près), il est renvoyé
          tel quel avec <Code>created: false</Code> en HTTP 200. Rejouer le même POST ne crée donc
          jamais deux dossiers identiques. Une création réelle renvoie un HTTP 201 avec
          <Code>created: true</Code>.
        </p>
        <Pre>{`curl -X POST ${BASE}/api/v1/folders \\
  -H "Authorization: Bearer dfk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Celio","website":"https://www.celio.com"}'

{
  "folder": { "id": "f1a2b3c4-…", "name": "Celio", … },
  "created": true
}`}</Pre>

        <H4>PATCH /api/v1/folders/&#123;id&#125;</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Met à jour un dossier. Tous les champs sont optionnels, seuls ceux présents dans le body
          sont écrits : <Code>name</Code>, <Code>website</Code>, <Code>notes</Code>,
          <Code>sitemapUrl</Code>. Passer <Code>null</Code> vide le champ. Un nom déjà utilisé par
          un autre dossier renvoie un HTTP 409.
        </p>
        <Pre>{`curl -X PATCH ${BASE}/api/v1/folders/f1a2b3c4-… \\
  -H "Authorization: Bearer dfk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Celio FR"}'

{ "folder": { "id": "f1a2b3c4-…", "name": "Celio FR", … } }`}</Pre>
        <p className="text-[var(--text-muted)]">
          Pas de <Code>DELETE</Code> : supprimer un dossier détruit en cascade tous les briefs
          qu&apos;il contient. Ce geste reste dans l&apos;interface, derrière la confirmation à
          retaper. Le renommage, lui, est aussi disponible sur la fiche client (bouton
          <strong> Renommer</strong>).
        </p>
      </Section>

      <Section title="Exemple d'intégration Node.js" dot="var(--accent)">
        <Pre>{`import fetch from "node-fetch";

const API = "${BASE}/api/v1";
const KEY = process.env.CORPUS_API_KEY!;
const auth = { "Authorization": \`Bearer \${KEY}\`, "Content-Type": "application/json" };

async function run(keyword: string, editorHtml: string) {
  // 1. Créer le brief
  const create = await fetch(\`\${API}/briefs\`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ keyword, country: "fr" }),
  }).then(r => r.json());

  const id = create.id;

  // 2. Poller jusqu'à ready
  let brief;
  for (let i = 0; i < 30; i++) {
    brief = await fetch(\`\${API}/briefs/\${id}\`, { headers: auth }).then(r => r.json());
    if (brief.status === "ready") break;
    if (brief.status === "failed") throw new Error(brief.error);
    await new Promise(r => setTimeout(r, 3000));
  }

  // 3. Envoyer le contenu et lire le score
  const scored = await fetch(\`\${API}/briefs/\${id}/content\`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ editorHtml }),
  }).then(r => r.json());

  console.log(\`Score : \${scored.score}/100 (moyenne SERP : \${scored.competitors?.avg}, meilleur : \${scored.competitors?.best})\`);
}`}</Pre>
      </Section>

      <Section title="API V2, lecture granulaire" dot="var(--accent-dark)">
        <p className="mb-3">
          La V2 est en lecture seule. Elle expose toute la richesse de l&apos;analyse corpus
          (SERP, concurrents, NLP, scoring détaillé, Haloscan) sur des endpoints séparés
          pour ne charger que le nécessaire. Auth identique à la V1, même clé.
        </p>
        <p className="mb-3 text-[var(--text-muted)]">
          La V2 ne crée pas de brief. Pour ça, utilise <Code>POST /api/v1/briefs</Code> puis
          attends que <Code>status</Code> passe à <Code>ready</Code>. Les briefs en
          <Code>pending</Code> ou <Code>failed</Code> renvoient leur statut sans payload métier.
        </p>

        <H4>GET /api/v2/briefs/&#123;id&#125;</H4>
        <p className="mb-2 text-[var(--text-muted)]">Résumé enrichi du brief.</p>
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
        <p className="mb-2 text-[var(--text-muted)]">Top 10 SERP brut + People Also Ask.</p>
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
          Les 10 concurrents enrichis (Hn, outline, score, wordCount). Par défaut sans le
          contenu, pour borner le payload : chaque concurrent porte quand même
          <Code>hasContent</Code>, <Code>chars</Code> et <Code>truncated</Code>.
        </p>
        <p className="mb-2 text-[var(--text-muted)]">
          <Code>?content=text|html|markdown|all</Code> joint le contenu crawlé de
          <strong> chaque</strong> concurrent à la réponse : un seul appel au lieu de dix.
          Alias acceptés : <Code>md</Code>, <Code>structuredHtml</Code>, <Code>1</Code>.
          <Code>?position=1,2,5</Code> restreint la réponse à certaines positions, pratique
          pour ne tirer le contenu que des concurrents qui t&apos;intéressent.
        </p>
        <Pre>{`# les 10 concurrents avec leur contenu en Markdown, en un appel
curl "${BASE}/api/v2/briefs/{id}/competitors?content=markdown" \\
  -H "Authorization: Bearer dfk_..."

# seulement les positions 1 et 2, contenu brut + HTML + Markdown
curl "${BASE}/api/v2/briefs/{id}/competitors?content=all&position=1,2" \\
  -H "Authorization: Bearer dfk_..."`}</Pre>
        <p className="mb-2 text-[var(--text-muted)]">
          Le contenu persisté est capé à 30 000 caractères par champ et par concurrent
          (limite de taille de row D1). <Code>truncated: true</Code> signale un contenu qui
          a atteint ce cap, donc probablement coupé. Le cap en vigueur est renvoyé dans
          <Code>contentCapChars</Code>.
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
      "hasContent": true,
      "chars": 14820,
      "truncated": false,
      // présents selon ?content=
      "text": "...", "structuredHtml": "<h1>…", "markdown": "# …"
    },
    ...
  ]
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Détail d&apos;un concurrent à la position <Code>n</Code> (1 à 10), avec son texte brut
          et son HTML reconstitué dans l&apos;ordre du document. Les briefs créés avant la mise
          en place de la persistance contenu renvoient <Code>text</Code> et
          <Code>structuredHtml</Code> à <Code>null</Code>.
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
    "structuredHtml": "<h1>...</h1><p>...</p><h2>...</h2><p>...</p>...",
    "markdown": "# Titre\\n\\nParagraphe...\\n\\n## Sous-titre...",
    "truncated": false,
    "breakdown": { ... }
  }
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/content</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Le contenu d&apos;un concurrent <strong>brut, sans enveloppe JSON</strong> : de quoi
          l&apos;écrire directement dans un fichier ou le passer à un modèle.
          <Code>format=text|html|markdown</Code> (Markdown par défaut, alias <Code>md</Code> et
          <Code>txt</Code>). La réponse porte l&apos;URL et la position du concurrent dans les
          en-têtes <Code>X-Competitor-Url</Code> et <Code>X-Competitor-Position</Code>.
        </p>
        <Pre>{`curl "${BASE}/api/v2/briefs/{id}/competitors/3/content?format=markdown" \\
  -H "Authorization: Bearer dfk_..." > concurrent-3.md

# le texte brut, pour compter les mots ou diffé deux versions
curl "${BASE}/api/v2/briefs/{id}/competitors/1/content?format=text" \\
  -H "Authorization: Bearer dfk_..."`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/download</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Même contenu, mais servi en pièce jointe (<Code>Content-Disposition</Code>) dans un
          format prêt à publier. Query param <Code>format=html|markdown|docx</Code>. Renvoie
          <Code>404 competitor content not available</Code> sur les briefs
          créés avant le 2026-05-02 (le contenu n&apos;était pas persisté avant cette date).
        </p>
        <Pre>{`GET /api/v2/briefs/{id}/competitors/3/download?format=html
→ Content-Type: text/html; charset=utf-8
→ Content-Disposition: attachment; filename="comparatif-scooter-3-cleanrider-com.html"

GET /api/v2/briefs/{id}/competitors/3/download?format=markdown
→ Content-Type: text/markdown; charset=utf-8
→ Content-Disposition: attachment; filename="comparatif-scooter-3-cleanrider-com.md"
→ front matter YAML (keyword, position, source, title) puis le contenu

GET /api/v2/briefs/{id}/competitors/3/download?format=docx
→ Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
→ Content-Disposition: attachment; filename="comparatif-scooter-3-cleanrider-com.docx"`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/competitors/&#123;n&#125;/print</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Sert une page HTML autonome qui auto-déclenche le print dialog du navigateur.
          L&apos;utilisateur choisit "Enregistrer en PDF" pour générer un PDF
          du contenu du concurrent. Même technique que l&apos;export PDF du brief rédigé.
          À ouvrir directement dans un onglet (<Code>window.open</Code>), pas via fetch.
        </p>
        <Pre>{`GET /api/v2/briefs/{id}/competitors/3/print
→ Content-Type: text/html; charset=utf-8
→ Body: <!doctype html>...<script>window.print()</script></html>`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/nlp</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Sortie NLP complète : termes pondérés par fréquence et embeddings sémantiques,
          clusters thématiques, sections détectées dans la SERP, entités, opportunités PAA.
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
        <p className="mb-2 text-[var(--text-muted)]">People Also Ask isolés.</p>
        <Pre>{`{
  "id": "...",
  "keyword": "...",
  "paa": [
    { "question": "...", "snippet": "...", "link": "https://..." }
  ]
}`}</Pre>

        <H4>GET /api/v2/briefs/&#123;id&#125;/scoring</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Breakdown détaillé du score, recalculé sur le HTML actuellement stocké dans le brief
          (mis à jour par chaque <Code>POST /content</Code>). 10 critères SEO, dont sémantique et saillance, plus le bloc GEO.
          Le <Code>total</Code> est le score persisté du brief, <Code>breakdownTotal</Code> le
          recalcul de la requête : les deux doivent coïncider, un écart signale un score
          enregistré par une formule antérieure.
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
    "nlpCoverage":  { "score": 18, "max": 22, "details": {
      "essentialsUsed": 14, "essentialsTotal": 14, "essentialsScore": 14,
      "importantsUsed": 7, "importantsTotal": 18, "importantsScore": 4
    } },
    "contentLength":{ "score":  6, "max":  7, "details": { "wc": 1840, "target": 2100 } },
    "headings":     { "score": 11, "max": 13, "details": { ... } },
    "placement":    { "score": 11, "max": 13, "details": { ... } },
    "structure":    { "score":  4, "max":  6, "details": { ... } },
    "quality":      { "score":  4, "max":  5, "details": { ... } },
    "images":       { "score":  0, "max":  0, "details": { "count": 4, "target": 5 } },
    "differentiation": { "score": 3, "max": 4, "details": { ... } },
    "semantic":     { "score": 11, "max": 15, "details": { "paragraphsScored": 12, "avgCosine": 0.712 } },
    "salience":     { "score":  4, "max":  4, "details": { "emphasized": true } },
    "geo":          { "total": 70, ... }
  },
  "competitors": { "avg": 71, "best": 85, "bestUrl": "...", "count": 9 },
  "editorWordCount": 1840
}`}</Pre>
        <p className="text-[var(--text-muted)] mb-2 text-[12px]">
          <strong>Notes :</strong> depuis le 2026-09-06, le serveur calcule lui-même la
          sémantique (embeddings des paragraphes) et la saillance : plus besoin d&apos;appeler
          <Code>/semantic-paragraph</Code> paragraphe par paragraphe ni de rejouer la formule
          cosinus à la main pour obtenir un score complet. <Code>total</Code> reste le score
          persisté, <Code>breakdownTotal</Code> le recalcul de la requête.
        </p>

        <H4>POST /api/v2/briefs/&#123;id&#125;/semantic-paragraph</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Embed un paragraphe via Workers AI bge-m3 et retourne le cosinus vs le centroïde
          sémantique top 10 du brief. Sert à scorer chaque paragraphe individuellement et
          identifier ceux qui dévient du sujet. Utilisé en live par l&apos;éditeur corpus
          (debounce 2s par paragraphe modifié).
        </p>
        <Pre>{`POST /api/v2/briefs/{id}/semantic-paragraph
Content-Type: application/json

{
  "paragraph": "Le thé matcha est riche en antioxydants et en catéchines..."
}`}</Pre>
        <H4>Réponse (200, centroïde présent)</H4>
        <Pre>{`{
  "centroidAvailable": true,
  "score": 0.903,
  "color": "green"
}`}</Pre>
        <H4>Réponse (200, brief antérieur à l&apos;iter 8 sans centroïde)</H4>
        <Pre>{`{
  "centroidAvailable": false
}`}</Pre>
        <p className="text-[var(--text-muted)] mb-2 text-[12px]">
          <strong>Couleurs :</strong> vert ≥ 0.75, jaune 0.55-0.75, rouge &lt; 0.55. Le
          paragraphe doit faire au moins 5 mots significatifs sinon retour 400. Centroïde
          disponible uniquement pour les briefs créés après le 2026-05-08 (iter sémantique).
        </p>

        <H4>GET /api/v2/briefs/&#123;id&#125;/haloscan</H4>
        <p className="mb-2 text-[var(--text-muted)]">
          Snapshot des champs projetés en colonnes + payload Haloscan brut.
          Renvoie <Code>404 haloscan data unavailable</Code> si le brief n&apos;a pas
          d&apos;enrichissement Haloscan (clé absente ou KW introuvable).
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

      <Section title="Codes d'erreur" dot="var(--red)">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.2px] text-[var(--text-muted)]">
              <th className="pb-2 pr-4 font-semibold">Code</th>
              <th className="pb-2 pr-4 font-semibold">Message</th>
              <th className="pb-2 font-semibold">Cause</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-muted)]">
            <Err code="401" msg="unauthorized" cause="Clé absente, invalide ou révoquée" />
            <Err code="400" msg="keyword required" cause="Body JSON sans keyword (POST V1)" />
            <Err code="400" msg="editorHtml required" cause="Body sans editorHtml dans POST /content" />
            <Err code="400" msg="invalid position" cause="V2 /competitors/{n} avec n non numérique ou < 1" />
            <Err code="403" msg="folder not accessible" cause="Le dossier n'existe pas ou n'appartient pas à ce user" />
            <Err code="404" msg="not found" cause="Brief introuvable" />
            <Err code="404" msg="competitor not found at position" cause="Position demandée absente du top 10 stocké" />
            <Err code="404" msg="nlp data unavailable" cause="V2 /nlp ou /scoring sur un brief sans NLP exploitable" />
            <Err code="404" msg="haloscan data unavailable" cause="V2 /haloscan sur un brief sans payload Haloscan" />
            <Err code="409" msg="brief not ready yet" cause="Tentative de scorer un brief encore en status pending" />
            <Err code="409" msg="brief analysis failed" cause="L'analyse SERP initiale avait échoué" />
            <Err code="502" msg="no SERP results" cause="SerpAPI n'a rien renvoyé (remonté en status:failed)" />
            <Err code="500" msg="SERPAPI_KEY missing on server" cause="Secret non configuré côté Worker" />
          </tbody>
        </table>
      </Section>

      <Section title="Limites et bonnes pratiques" dot="var(--text-muted)">
        <ul className="list-disc pl-5 text-[var(--text-muted)]">
          <li>Chaque brief consomme un appel SerpAPI + un appel Haloscan + 10 crawls HTTP. Évite de relancer le même mot-clé plusieurs fois.</li>
          <li>Sur erreur ou timeout d&apos;un POST, ne re-POST pas en boucle : le brief a souvent été créé quand même. Vérifie via <Code>GET /api/v1/briefs?keyword=…</Code>, l&apos;anti-doublon (section 1) sert de filet de sécurité.</li>
          <li>Le scoring est déterministe : même contenu, même brief → même score.</li>
          <li>Les appels sont rattachés au user appelant ; tous les collègues voient le brief dans l'interface (workspace partagé).</li>
          <li>Pas de rate limit pour l'instant (usage interne). Sois raisonnable.</li>
          <li>Les clés peuvent être révoquées à tout moment depuis <Link href="/app/settings" className="underline font-semibold">Paramètres</Link>, l'effet est immédiat.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children, dot }: { title: string; children: React.ReactNode; dot: string }) {
  return (
    <section className="mb-10">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: dot }} />
        {title}
      </h2>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] text-[13px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[13px] font-semibold mt-4 mb-2">{children}</h4>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="font-code text-[12px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] p-3 mb-3 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-code text-[12px] bg-[var(--bg-dark)]/10 rounded px-1 py-[1px]">
      {children}
    </code>
  );
}

function Err({ code, msg, cause }: { code: string; msg: string; cause: string }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 pr-4 font-code text-[var(--text)]">{code}</td>
      <td className="py-2 pr-4 font-code">{msg}</td>
      <td className="py-2">{cause}</td>
    </tr>
  );
}
