import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief } from "@/db/schema";
import {
  renderDocDocument,
  renderHtmlDocument,
  safeFilename,
} from "@/lib/export-content";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "html" && format !== "doc")
    return NextResponse.json({ error: "format must be html or doc" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({ keyword: brief.keyword, editorHtml: brief.editorHtml })
    .from(brief)
    .where(eq(brief.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return buildResponse(row.keyword, row.editorHtml ?? "", format);
}

function buildResponse(keyword: string, html: string, format: "html" | "doc") {
  const slug = safeFilename(keyword);
  if (format === "html") {
    return new Response(renderHtmlDocument(keyword, html), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.html"`,
      },
    });
  }
  return new Response(renderDocDocument(keyword, html), {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.doc"`,
    },
  });
}
