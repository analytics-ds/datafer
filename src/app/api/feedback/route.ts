import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import type { DataferEnv } from "@/lib/datafer-env";

export const dynamic = "force-dynamic";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 2_000_000; // 2 Mo par image (encodée base64 ≈ 2.7 Mo de string)
const MAX_MESSAGE_LEN = 4000;
const ALLOWED_CATEGORIES = ["bug", "suggestion", "question"] as const;

type Category = (typeof ALLOWED_CATEGORIES)[number];

type Body = {
  category?: Category;
  message?: string;
  url?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  screenshots?: string[];
};

const DEFAULT_TO = "pierre@datashake.fr";
const DEFAULT_FROM = "Content Optimizer Feedback <onboarding@resend.dev>";

export async function POST(req: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const category = body.category;
  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (message.length < 5) {
    return NextResponse.json({ error: "message too short" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  const url = body.url?.slice(0, 500) ?? "";
  const userAgent = body.userAgent?.slice(0, 500) ?? null;

  const screenshots = Array.isArray(body.screenshots) ? body.screenshots : [];
  if (screenshots.length > MAX_SCREENSHOTS) {
    return NextResponse.json({ error: "too many screenshots" }, { status: 400 });
  }
  for (const s of screenshots) {
    if (typeof s !== "string" || !s.startsWith("data:image/")) {
      return NextResponse.json({ error: "invalid screenshot" }, { status: 400 });
    }
    // length d'un data URL en chars ≈ 4/3 fois la taille en octets après
    // décodage base64. On compare avec une marge.
    if (s.length > MAX_SCREENSHOT_BYTES * 1.4) {
      return NextResponse.json({ error: "screenshot too large" }, { status: 400 });
    }
  }

  const { env } = getCloudflareContext();
  const e = env as DataferEnv;
  const db = drizzle(e.DB, { schema });

  const id = crypto.randomUUID();
  await db.insert(schema.feedback).values({
    id,
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    category,
    message,
    url,
    userAgent,
    viewportWidth: typeof body.viewportWidth === "number" ? body.viewportWidth : null,
    viewportHeight: typeof body.viewportHeight === "number" ? body.viewportHeight : null,
    screenshotsJson: screenshots.length > 0 ? JSON.stringify(screenshots) : null,
    status: "new",
  });

  // Envoi email best-effort : si Resend n'est pas configuré ou échoue, on
  // n'échoue pas la requête (le feedback est en DB, Pierre pourra toujours
  // le voir via /app/admin/feedback). On log juste pour debug worker.
  if (e.RESEND_API_KEY) {
    const attachments = screenshots.map((s, i) => {
      const comma = s.indexOf(",");
      const content = comma >= 0 ? s.slice(comma + 1) : s;
      const mimeMatch = /^data:([^;]+)/.exec(s.slice(0, 50));
      const ext = mimeMatch?.[1]?.split("/")[1] ?? "png";
      return { filename: `screenshot-${i + 1}.${ext}`, content };
    });

    const html = renderFeedbackEmail({
      category,
      message,
      url,
      userName: session.user.name,
      userEmail: session.user.email,
      userAgent: userAgent ?? "",
      viewport: body.viewportWidth && body.viewportHeight
        ? `${body.viewportWidth} × ${body.viewportHeight}`
        : "",
      screenshotsCount: screenshots.length,
    });

    const subject = `${categoryTag(category)} Content Optimizer feedback de ${session.user.name}`;

    const result = await sendEmail({
      apiKey: e.RESEND_API_KEY,
      from: DEFAULT_FROM,
      to: e.FEEDBACK_TO ?? DEFAULT_TO,
      replyTo: session.user.email,
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    if (!result.ok) {
      console.warn(`[feedback] Resend send failed for ${id}: ${result.error}`);
    }
  } else {
    console.warn(`[feedback] RESEND_API_KEY missing, skipping email for ${id}`);
  }

  return NextResponse.json({ ok: true, id });
}

function categoryTag(c: Category): string {
  return c === "bug" ? "🐛 [BUG]" : c === "suggestion" ? "💡 [IDEA]" : "❓ [Q]";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFeedbackEmail(p: {
  category: Category;
  message: string;
  url: string;
  userName: string;
  userEmail: string;
  userAgent: string;
  viewport: string;
  screenshotsCount: number;
}): string {
  const label = p.category === "bug" ? "Bug" : p.category === "suggestion" ? "Suggestion" : "Question";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F3EDE8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;color:#101010;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E2DC;border-radius:14px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #E8E2DC;background:#FAF6F2;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8A8A8A;margin-bottom:4px">
        Content Optimizer · Nouveau feedback
      </div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px">${categoryTag(p.category)} ${label}</div>
    </div>
    <div style="padding:20px 24px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <tr><td style="color:#8A8A8A;padding:4px 0;width:90px">De</td><td style="padding:4px 0"><strong>${escapeHtml(p.userName)}</strong> &lt;${escapeHtml(p.userEmail)}&gt;</td></tr>
        <tr><td style="color:#8A8A8A;padding:4px 0">Page</td><td style="padding:4px 0"><a href="${escapeHtml(p.url)}" style="color:#7E7D22">${escapeHtml(p.url)}</a></td></tr>
        ${p.viewport ? `<tr><td style="color:#8A8A8A;padding:4px 0">Viewport</td><td style="padding:4px 0;font-family:ui-monospace,monospace">${escapeHtml(p.viewport)}</td></tr>` : ""}
        ${p.userAgent ? `<tr><td style="color:#8A8A8A;padding:4px 0;vertical-align:top">User-Agent</td><td style="padding:4px 0;font-family:ui-monospace,monospace;font-size:11px;color:#5C5C5C;word-break:break-all">${escapeHtml(p.userAgent)}</td></tr>` : ""}
      </table>
      <div style="background:#FAF6F2;border:1px solid #E8E2DC;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(p.message)}</div>
      ${p.screenshotsCount > 0 ? `<div style="margin-top:14px;font-size:12px;color:#5C5C5C">📎 ${p.screenshotsCount} capture${p.screenshotsCount > 1 ? "s" : ""} d'écran en pièce jointe.</div>` : ""}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #E8E2DC;background:#FAF6F2;font-size:11px;color:#8A8A8A;text-align:center">
      Tu peux répondre à cet email pour échanger directement avec ${escapeHtml(p.userName.split(" ")[0])}.
    </div>
  </div>
</body></html>`;
}
