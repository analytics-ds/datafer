import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { and, asc, eq, or } from "drizzle-orm";
import { PageHeader } from "../../_ui";
import { NewBriefForm } from "./form";

export default async function NewBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const { folder: defaultFolderId } = await searchParams;

  const db = getDb();
  const folders = await db
    .select({ id: client.id, name: client.name, scope: client.scope })
    .from(client)
    .where(
      or(
        and(eq(client.ownerId, session.user.id), eq(client.scope, "personal")),
        eq(client.scope, "agency"),
      ),
    )
    .orderBy(asc(client.scope), asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau brief<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Renseigne le mot-clé cible et le marché. On analyse les top 10 Google, on extrait le champ sémantique et on te rend un éditeur optimisé en temps réel."
      />

      <NewBriefForm folders={folders} defaultFolderId={defaultFolderId} />
    </div>
  );
}
