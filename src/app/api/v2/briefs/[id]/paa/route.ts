import { NextResponse } from "next/server";
import { authBrief, loadBrief, notReady } from "@/lib/api-v2";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await authBrief(req, id);
  if (!result.ok) return result.response;
  const { row } = result;

  const pending = notReady(row);
  if (pending) return pending;

  const { paa } = loadBrief(row);

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    paa: paa.map((p) => ({
      question: p.question,
      snippet: p.snippet,
      link: p.link,
    })),
  });
}
