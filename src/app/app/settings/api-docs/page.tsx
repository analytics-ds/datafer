import Link from "next/link";
import { PageHeader } from "../../_ui";
import { getTranslator, resolveLocale } from "@/lib/i18n/server";
import { ApiDocsFr } from "./content-fr";
import { ApiDocsEn } from "./content-en";

export default async function ApiDocsPage() {
  const locale = await resolveLocale();
  const t = await getTranslator();

  return (
    <div className="px-10 py-10 max-w-[920px]">
      <div className="mb-4">
        <Link
          href="/app/settings"
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] font-semibold uppercase tracking-[0.2px]"
        >
          {t("apiDocs.back")}
        </Link>
      </div>

      <PageHeader
        title={<>{t("apiDocs.title")}<span className="df-accent">.</span></>}
        subtitle={t("apiDocs.subtitle")}
      />

      {locale === "en" ? <ApiDocsEn /> : <ApiDocsFr />}
    </div>
  );
}
