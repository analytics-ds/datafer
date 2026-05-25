/**
 * Envoi de mails transactionnels via Resend (REST API).
 *
 * Setup :
 * - Compte Resend (gratuit jusqu'à 100 mails/jour) → récupérer une clé API.
 * - `wrangler secret put RESEND_API_KEY` (et idem sur le worker consumer
 *   si on s'en sert ailleurs).
 * - Pour avoir un `from` personnalisé du type `feedback@rankshake.com`, il
 *   faut vérifier le domaine côté Resend. Tant que ce n'est pas fait, on
 *   utilise `onboarding@resend.dev` qui est utilisable hors prod.
 *
 * On évite délibérément le SDK officiel @resend/node pour rester compatible
 * Cloudflare Workers (fetch standard, pas de dépendance node:).
 */

type Attachment = {
  filename: string;
  /** Contenu encodé en base64 (sans le préfixe `data:image/...;base64,`). */
  content: string;
};

type SendEmailInput = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Attachment[];
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        attachments: input.attachments,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: data.message ?? `Resend HTTP ${res.status}` };
    }
    return { ok: true, id: data.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Resend" };
  }
}
