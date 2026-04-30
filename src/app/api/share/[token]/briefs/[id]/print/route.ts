import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { renderPrintDocument } from "@/lib/export-content";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;

  const db = getDb();
  const [row] = await db
    .select({ keyword: brief.keyword, editorHtml: brief.editorHtml })
    .from(brief)
    .innerJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.id, id), eq(client.shareToken, token)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new Response(renderPrintDocument(row.keyword, row.editorHtml ?? ""), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
