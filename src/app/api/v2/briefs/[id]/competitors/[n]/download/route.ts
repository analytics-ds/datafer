import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";
import { renderHtmlDocument, safeFilename } from "@/lib/export-content";
import { renderDocx } from "@/lib/export-docx";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await context.params;
  const position = Number.parseInt(n, 10);
  if (!Number.isFinite(position) || position < 1) {
    return NextResponse.json({ error: "invalid position" }, { status: 400 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "html" && format !== "docx") {
    return NextResponse.json({ error: "format must be html or docx" }, { status: 400 });
  }

  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { serp } = loadBrief(row);
  const competitor = serp.find((r) => r.position === position);
  if (!competitor) {
    return NextResponse.json({ error: "competitor not found at position" }, { status: 404 });
  }
  // Le contenu est uniquement persisté pour les briefs créés à partir du
  // 2026-05-02 (cf. swap Bright Data + persistance text/structuredHtml).
  // Avant cette date, il n'y a rien à exposer.
  const bodyHtml = competitor.structuredHtml ?? "";
  if (!bodyHtml) {
    return NextResponse.json(
      { error: "competitor content not available (brief created before content persistence)" },
      { status: 404 },
    );
  }

  let host = "";
  try {
    host = new URL(competitor.link).hostname.replace(/^www\./, "");
  } catch {}
  const slug = safeFilename(`${row.keyword}-${position}-${host || "concurrent"}`);
  const title = `${competitor.title || competitor.link} — Position ${position} (${host}) — ${row.keyword}`;

  if (format === "html") {
    return new Response(renderHtmlDocument(title, bodyHtml), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.html"`,
      },
    });
  }

  const buf = renderDocx(title, bodyHtml);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}.docx"`,
    },
  });
}
