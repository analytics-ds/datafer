import { PageHeader } from "../../_ui";
import { FolderForm } from "../folder-form";

export default function NewPersonalFolderPage() {
  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau client<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Crée un client pour regrouper tes briefs et suivre ses positions."
      />
      <FolderForm scope="personal" />
    </div>
  );
}
