import { PageHeader } from "../../_ui";
import { FolderForm } from "../folder-form";

export default function NewPersonalFolderPage() {
  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau dossier<span className="italic text-[var(--accent-dark)]">.</span></>}
        subtitle="Un dossier perso visible par toi uniquement. Parfait pour tes projets PBN ou tests."
      />
      <FolderForm scope="personal" />
    </div>
  );
}
