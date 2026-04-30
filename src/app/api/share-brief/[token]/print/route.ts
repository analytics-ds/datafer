import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import { renderPrintDocument } from "@/lib/export-content";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = getDb();
  const [row] = await db
    .select({ keyword: brief.keyword, editorHtml: brief.editorHtml })
    .from(brief)
    .where(eq(brief.shareToken, token))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new Response(renderPrintDocument(row.keyword, row.editorHtml ?? ""), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
