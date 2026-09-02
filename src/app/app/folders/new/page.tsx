import { PageHeader } from "../../_ui";
import { FolderForm } from "../folder-form";

export default function NewPersonalFolderPage() {
  return (
    <div className="px-10 py-10 max-w-[720px]">
      <PageHeader
        title={<>Nouveau client<span className="df-accent">.</span></>}
        subtitle="Créez un client pour regrouper les briefs et suivre ses positions."
      />
      <FolderForm scope="personal" />
    </div>
  );
}
