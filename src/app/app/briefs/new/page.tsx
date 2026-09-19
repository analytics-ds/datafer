import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { client } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "../../_ui";
import { NewBriefForm } from "./form";
import { getTranslator } from "@/lib/i18n/server";

export default async function NewBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const t = await getTranslator();
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
        title={<>{t("newBrief.page.title")}<span className="df-accent">.</span></>}
        subtitle={t("newBrief.page.subtitle")}
      />

      <NewBriefForm folders={folders} defaultFolderId={defaultFolderId} />
    </div>
  );
}
