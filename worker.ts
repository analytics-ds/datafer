/**
 * Point d'entrée du worker Next (wrangler.toml → main). Enveloppe le worker
 * généré par OpenNext avec le verrou par mot de passe de src/lib/gate.ts :
 * preprod entièrement protégée, accès direct à l'URL workers.dev de la prod
 * protégé. Voir la doc OpenNext « Custom Worker ».
 */
import { gate, type GateEnv } from "./src/lib/gate";
// @ts-ignore généré par `opennextjs-cloudflare build`, absent avant le build
import { default as handler } from "./.open-next/worker.js";

export default {
  async fetch(request: Request, env: GateEnv, ctx: ExecutionContext): Promise<Response> {
    const blocked = await gate(request, env);
    if (blocked) return blocked;
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<GateEnv>;
