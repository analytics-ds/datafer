import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { brief, client } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { NlpResult, SerpResult, Paa, HaloscanOverview } from "@/lib/analysis";
import { BriefEditor } from "./brief-editor";

export default async function BriefDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [row] = await db
    .select({ brief, folder: client })
    .from(brief)
    .leftJoin(client, eq(client.id, brief.clientId))
    .where(
      and(
        eq(brief.id, id),
        or(eq(brief.ownerId, session.user.id), eq(client.scope, "agency")),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const b = row.brief;
  const nlp = b.nlpJson ? (JSON.parse(b.nlpJson) as NlpResult) : null;
  const serp = b.serpJson ? (JSON.parse(b.serpJson) as SerpResult[]) : [];
  const paa = b.paaJson ? (JSON.parse(b.paaJson) as Paa[]) : [];
  const haloscan = b.haloscanJson ? (JSON.parse(b.haloscanJson) as HaloscanOverview) : null;

  return (
    <BriefEditor
      id={b.id}
      keyword={b.keyword}
      country={b.country}
      folder={
        row.folder
          ? {
              id: row.folder.id,
              name: row.folder.name,
              website: row.folder.website,
              scope: row.folder.scope,
            }
          : null
      }
      initialHtml={b.editorHtml ?? ""}
      nlp={nlp}
      serp={serp}
      paa={paa}
      haloscan={haloscan}
    />
  );
}
