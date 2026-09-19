import { PageHeader } from "../../_ui";
import { FolderForm } from "../folder-form";
import { getTranslator } from "@/lib/i18n/server";

export default async function NewPersonalFolderPage() {
  const t = await getTranslator();
  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>{t("newFolder.title")}<span className="df-accent">.</span></>}
        subtitle={t("newFolder.subtitle")}
      />
      <FolderForm scope="personal" />
    </div>
  );
}
