import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "../../_ui";
import { NewBriefForm } from "./form";

export default async function NewBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { folder: defaultFolderId } = await searchParams;

  const db = getDb();
  const folders = await db
    .select({ id: client.id, name: client.name, website: client.website })
    .from(client)
    .orderBy(asc(client.name));

  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau brief<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Renseigne le mot-clé cible et le marché. Tu peux aussi mettre jusqu'à 5 mots-clés, un par ligne, pour lancer un batch d'analyses en file d'attente."
      />

      <NewBriefForm folders={folders} defaultFolderId={defaultFolderId} />
    </div>
  );
}
