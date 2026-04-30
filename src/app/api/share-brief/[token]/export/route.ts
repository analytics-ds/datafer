import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import {
  renderDocDocument,
  renderHtmlDocument,
  safeFilename,
} from "@/lib/export-content";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "html" && format !== "doc")
    return NextResponse.json({ error: "format must be html or doc" }, { status: 400 });

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
  return new Response(renderDocDocument(row.keyword, row.editorHtml ?? ""), {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.doc"`,
    },
  });
}
