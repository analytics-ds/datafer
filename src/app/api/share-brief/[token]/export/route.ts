import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { renderHtmlDocument, safeFilename } from "@/lib/export-content";
import { renderDocx } from "@/lib/export-docx";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "html" && format !== "docx")
    return NextResponse.json({ error: "format must be html or docx" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ keyword: brief.keyword, editorHtml: brief.editorHtml })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const slug = safeFilename(row.keyword);
  if (format === "html") {
    return new Response(renderHtmlDocument(row.keyword, row.editorHtml ?? ""), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.html"`,
      },
    });
  }
  const buf = renderDocx(row.keyword, row.editorHtml ?? "");
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}.docx"`,
    },
  });
}
