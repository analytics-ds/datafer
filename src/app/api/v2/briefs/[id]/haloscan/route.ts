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

  const { haloscan } = loadBrief(row);
  if (!haloscan) {
    return NextResponse.json({ error: "haloscan data unavailable" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    keyword: row.keyword,
    // Snapshot des champs utiles déjà projetés en colonnes (rapides à lire).
    summary: {
      volume: row.volume,
      cpc: row.cpc,
      competition: row.competition,
      kgr: row.kgr,
      allintitleCount: row.allintitleCount,
    },
    // Payload brut pour l'utilisateur qui veut le full Haloscan (questions
    // associées, suggestions, related, etc. selon ce que renvoie l'API).
    raw: haloscan,
  });
}
