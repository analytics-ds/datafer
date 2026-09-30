/**
 * Verrou par mot de passe devant le worker Next (cf. worker.ts à la racine).
 *
 * Deux modes, choisis par la variable GATE_MODE du wrangler.toml :
 * - "all" (preprod) : tout l'environnement est derrière le mot de passe.
 * - "direct" (prod) : seul l'accès direct à l'URL workers.dev est verrouillé.
 *   corpus.datashake.fr passe par le relais corpus-proxy, qui signe chaque
 *   requête avec l'en-tête x-corpus-proxy (secret PROXY_SECRET partagé).
 *
 * Le mot de passe (secret GATE_PASSWORD) ne vit jamais dans le repo, qui est
 * public. Page de saisie + cookie plutôt qu'une authentification HTTP Basic :
 * l'API et les crons s'authentifient déjà via `Authorization: Bearer`, un
 * en-tête Basic l'écraserait. Les requêtes Bearer passent donc le verrou et
 * restent contrôlées par leur propre clé.
 */

export type GateEnv = {
  GATE_MODE?: string;
  GATE_PASSWORD?: string;
  PROXY_SECRET?: string;
};

const COOKIE = "corpus_gate";
const GATE_PATH = "/__gate";

async function token(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("corpus-gate-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function page(error: boolean, next: string): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>corpus · accès restreint</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F3EDE8;color:#101010;font-family:Inter,system-ui,sans-serif}form{background:#fff;padding:32px;border-radius:12px;width:min(340px,90vw)}h1{font-size:20px;font-weight:500;margin:0 0 6px}p{margin:0 0 18px;font-size:14px;color:rgba(16,16,16,.7)}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d8d2cc;border-radius:8px;font-size:15px}button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#101010;color:#fff;font-size:15px;cursor:pointer}.err{color:#b42318;font-size:13px;margin-top:10px}</style></head>
<body><form method="post" action="${GATE_PATH}"><h1>corpus</h1><p>Environnement protégé. Saisissez le mot de passe.</p>
<input type="hidden" name="next" value="${esc(next)}"><input type="password" name="password" autofocus autocomplete="current-password" aria-label="Mot de passe">
<button type="submit">Entrer</button>${error ? '<div class="err">Mot de passe incorrect.</div>' : ""}</form></body></html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

/**
 * Renvoie une Response quand le verrou intercepte la requête (page de mot de
 * passe, redirection après saisie), null quand la requête peut passer.
 */
export async function gate(req: Request, env: GateEnv): Promise<Response | null> {
  const mode = env.GATE_MODE;
  if (mode !== "all" && mode !== "direct") return null;

  if (mode === "direct") {
    const url = new URL(req.url);
    const direct = url.hostname.endsWith(".workers.dev");
    const proxied = !!env.PROXY_SECRET && safeEqual(req.headers.get("x-corpus-proxy") ?? "", env.PROXY_SECRET);
    if (!direct || proxied) return null;
  }

  // Sans mot de passe configuré, on ferme plutôt que d'ouvrir.
  if (!env.GATE_PASSWORD) return new Response("Accès fermé", { status: 403 });

  // API v1/v2 et crons : déjà authentifiés par leur clé Bearer.
  if ((req.headers.get("authorization") ?? "").startsWith("Bearer ")) return null;

  const expected = await token(env.GATE_PASSWORD);
  const url = new URL(req.url);

  if (url.pathname === GATE_PATH && req.method === "POST") {
    const form = await req.formData().catch(() => null);
    const password = String(form?.get("password") ?? "");
    const nextRaw = String(form?.get("next") ?? "/");
    const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
    if (!safeEqual(await token(password), expected)) return page(true, next);
    return new Response(null, {
      status: 303,
      headers: {
        location: next,
        "set-cookie": `${COOKIE}=${expected}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const cookie = readCookie(req, COOKIE);
  if (cookie && safeEqual(cookie, expected)) return null;

  return page(false, url.pathname + url.search);
}
