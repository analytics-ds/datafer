import { PageHeader } from "../../_ui";
import { FolderForm } from "../../folders/folder-form";

export default function NewAgencyFolderPage() {
  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau dossier <span className="italic text-[var(--accent-dark)]">datashake</span></>}
        subtitle="Dossier client partagé avec toute l'équipe. Visible par tous les consultants authentifiés."
      />
      <FolderForm scope="agency" />
    </div>
  );
}
