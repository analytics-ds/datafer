"use client";

import Link from "next/link";
import type { NlpResult, SerpResult, Paa } from "@/lib/analysis";

type Folder = { id: string; name: string; scope: "personal" | "agency" };

type HaloscanData = {
  search_volume?: number;
  cpc?: number;
  difficulty?: number;
  kgr?: number;
  allintitleCount?: number;
  visibilityIndex?: number;
  resultCount?: number | null;
};

export function BriefView({
  keyword,
  country,
  folder,
  nlp,
  serp,
  paa,
  haloscan,
}: {
  keyword: string;
  country: string;
  folder: Folder | null;
  nlp: NlpResult | null;
  serp: SerpResult[];
  paa: Paa[];
  haloscan: HaloscanData | null;
}) {
  const halo = haloscan;
  const volume = halo?.search_volume ?? null;
  const cpc = halo?.cpc ?? null;
  const difficulty = halo?.difficulty ?? null;
  const kgr = halo?.kgr ?? null;
  const allintitleCount = halo?.allintitleCount ?? null;

  const crawledCount = serp.filter((s) => (s.wordCount ?? 0) > 0).length;

  // Tiers NLP
  const essential: typeof nlp extends null ? never : NlpResult["nlpTerms"] = [];
  const important: typeof essential = [];
  const opportunity: typeof essential = [];
  nlp?.nlpTerms.slice(0, 40).forEach((k) => {
    if (k.presence >= 70) essential.push(k);
    else if (k.presence >= 40) important.push(k);
    else opportunity.push(k);
  });

  return (
    <div className="px-10 py-10 max-w-[1200px]">
      {/* En-tête */}
      <header className="mb-10">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase">
            {country}
          </span>
          {nlp?.intent && (
            <span
              className="px-[10px] py-[3px] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase"
              style={getIntentStyle(nlp.intent)}
              title={getIntentDescription(nlp.intent)}
            >
              {getIntentLabel(nlp.intent)}
            </span>
          )}
          {folder && (
            <Link
              href={folder.scope === "agency" ? `/app/agency/${folder.id}` : `/app/folders/${folder.id}`}
              className="text-[11px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] hover:text-[var(--text)]"
            >
              · {folder.name}
            </Link>
          )}
          <span className="px-2 py-[3px] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px] uppercase bg-[var(--green-bg)] text-[var(--green)]">
            {crawledCount}/{serp.length} pages crawlées
          </span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.05] tracking-[-1.2px] mb-2">
          {keyword}<span className="italic text-[var(--accent-dark)]">.</span>
        </h1>
      </header>

      {/* Stats Haloscan */}
      {halo && (
        <section className="mb-10">
          <SectionTitle>Données mot-clé</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Volume" value={volume != null ? fmtNum(volume) : "N/A"} />
            <StatCard label="KGR" value={kgr != null ? kgr.toFixed(2) : "N/A"} />
            <StatCard label="Allintitle" value={allintitleCount != null ? fmtNum(allintitleCount) : "N/A"} />
            <StatCard label="CPC" value={cpc != null ? `${cpc.toFixed(2)} €` : "N/A"} />
            <StatCard label="Difficulté" value={difficulty != null ? `${difficulty}/100` : "N/A"} />
          </div>
        </section>
      )}

      {/* Benchmarks + mot-clé exact */}
      {nlp && (
        <section className="mb-10 grid md:grid-cols-2 gap-6">
          <div>
            <SectionTitle>Benchmarks SERP</SectionTitle>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden">
              <BenchRow label="Plage de mots recommandée" value={`${nlp.minWordCount} à ${nlp.maxWordCount}`} />
              <BenchRow label="Moyenne mots" value={String(nlp.avgWordCount)} />
              <BenchRow label="Titres (H1+H2+H3)" value={String(nlp.avgHeadings)} />
              <BenchRow label="Paragraphes" value={String(nlp.avgParagraphs)} last />
            </div>
          </div>

          <div>
            <SectionTitle>Mot-clé exact dans la SERP</SectionTitle>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden">
              <BenchRow
                label="Occurrences moyennes"
                value={`~${nlp.exactKeyword.avgCount} · densité ~${nlp.exactKeyword.avgDensity.toFixed(2)}%`}
              />
              <BenchRow label="Densité idéale" value={`${nlp.exactKeyword.idealDensityMin.toFixed(1)} à ${nlp.exactKeyword.idealDensityMax.toFixed(1)}%`} />
              <BenchRow label="Dans le H1" value={`${nlp.exactKeyword.inH1Pct}% des concurrents`} />
              <BenchRow label="Dans un H2" value={`${nlp.exactKeyword.inH2Pct}% des concurrents`} last />
            </div>
          </div>
        </section>
      )}

      {/* Mot-clé principal et sous-parties à placer */}
      {nlp?.keywordTerms && nlp.keywordTerms.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Mot-clé principal — à placer absolument</SectionTitle>
          <p className="text-[12px] text-[var(--text-muted)] mb-3 -mt-2">
            Le keyword exact, ses mots constitutifs et ses bigrammes, avec la
            fourchette d&apos;occurrences observée chez les concurrents qui les
            emploient.
          </p>
          <div className="flex flex-wrap gap-[5px]">
            {nlp.keywordTerms.map((t) => {
              const style =
                t.kind === "exact"
                  ? { background: "var(--bg-black)", borderColor: "var(--bg-black)", color: "var(--text-inverse)" }
                  : t.kind === "extension"
                    ? { background: "var(--blue-bg)", borderColor: "var(--blue)", color: "var(--blue)" }
                    : { background: "var(--bg-olive-light)", borderColor: "var(--accent-dark)", color: "var(--accent-dark)" };
              return (
                <span
                  key={t.term}
                  className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-full text-[12px] font-medium border"
                  style={style}
                  title={
                    t.kind === "extension"
                      ? `Extension du keyword détectée chez ${t.presence}% des concurrents`
                      : t.kind === "exact"
                        ? "Keyword exact"
                        : "Sous-partie du keyword"
                  }
                >
                  {t.term}
                  {t.maxCount > 0 && (
                    <span
                      className="text-[9px] opacity-80 font-[family-name:var(--font-mono)]"
                      title={`Présent chez ${t.presence}% des concurrents (moyenne ${t.avgCount})`}
                    >
                      {t.minCount === t.maxCount
                        ? `×${t.maxCount}`
                        : `${t.minCount}-${t.maxCount}`}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Clusters thématiques (embeddings) */}
      {nlp?.semanticClusters && nlp.semanticClusters.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Clusters thématiques (IA)</SectionTitle>
          <p className="text-[12px] text-[var(--text-muted)] mb-3 -mt-2">
            Termes regroupés par champ lexical, détectés via embeddings
            sémantiques (Cloudflare bge-m3).
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {nlp.semanticClusters.map((c) => (
              <div
                key={c.label}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-2">
                  {c.label}
                  <span className="ml-2 font-[family-name:var(--font-mono)] font-normal opacity-70">
                    {c.terms.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-[4px]">
                  {c.terms.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] bg-[var(--bg-warm)] border border-[var(--border)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Champ sémantique NLP */}
      {nlp && (
        <section className="mb-10">
          <SectionTitle>Champ sémantique NLP</SectionTitle>
          {essential.length > 0 && (
            <KwTier color="var(--red)" label="Essentiels" bg="#FFF0F0" terms={essential} />
          )}
          {important.length > 0 && (
            <KwTier color="var(--orange)" label="Importants" bg="var(--orange-bg)" terms={important} />
          )}
          {opportunity.length > 0 && (
            <KwTier color="var(--blue)" label="Opportunité" bg="var(--blue-bg)" terms={opportunity} />
          )}
          {essential.length + important.length + opportunity.length === 0 && (
            <p className="text-[13px] text-[var(--text-muted)]">
              Pas de termes détectés (contenu SERP insuffisant).
            </p>
          )}
        </section>
      )}

      {/* Opportunités de différentiation */}
      {nlp?.opportunities && nlp.opportunities.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Opportunités de différentiation</SectionTitle>
          <p className="text-[12px] text-[var(--text-muted)] mb-3 -mt-2">
            Questions PAA peu couvertes par les concurrents — angles d&apos;attaque
            uniques pour ton article.
          </p>
          <div className="grid gap-2">
            {nlp.opportunities.map((o, i) => (
              <div
                key={i}
                className="bg-[var(--green-bg)] border border-[var(--green)] rounded-[var(--radius-sm)] px-4 py-3 text-[13px] flex items-start gap-3"
                title={`Couvert par seulement ${o.competitorCoverage}% des concurrents`}
              >
                <span className="text-[var(--green)] font-bold shrink-0">+</span>
                <span className="flex-1">{o.text}</span>
                <span className="text-[10px] font-semibold text-[var(--green)] font-[family-name:var(--font-mono)] shrink-0">
                  {o.competitorCoverage}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* People Also Ask */}
      {paa.length > 0 && (
        <section className="mb-10">
          <SectionTitle>People Also Ask</SectionTitle>
          <div className="grid gap-2">
            {paa.slice(0, 5).map((q, i) => (
              <div
                key={i}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3 text-[13px] flex items-start gap-3"
              >
                <span className="text-[var(--text-muted)]">?</span>
                <span>{q.question}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Liste SERP */}
      <section className="mb-10">
        <SectionTitle>Top 10 Google</SectionTitle>
        <div className="grid gap-2">
          {serp.map((r) => (
            <a
              key={r.position}
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              className="grid grid-cols-[44px_1fr_auto] gap-4 items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3 hover:border-[var(--border-strong)] transition-colors"
            >
              <span
                className={`w-9 h-9 flex items-center justify-center font-[family-name:var(--font-mono)] font-semibold text-[14px] rounded-[var(--radius-xs)] ${
                  r.position <= 3
                    ? "bg-[var(--bg-olive-light)] text-[var(--accent-dark)]"
                    : "bg-[var(--bg-warm)] text-[var(--text-secondary)]"
                }`}
              >
                {r.position}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[13px] truncate">{r.title}</div>
                <div className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)] truncate">
                  {r.displayed_link}
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
                    {r.wordCount ? fmtNum(r.wordCount) : "N/A"}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                    mots
                  </div>
                </div>
                <div>
                  <div className="font-[family-name:var(--font-mono)] text-[13px] font-semibold">
                    {r.headings ?? "N/A"}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-muted)] font-semibold">
                    titres
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <div className="bg-[var(--bg-warm)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-8 text-center">
        <div className="font-semibold text-[14px] mb-1">Éditeur WYSIWYG à venir</div>
        <p className="text-[var(--text-secondary)] text-[13px] max-w-[480px] mx-auto">
          La prochaine itération branche l&apos;éditeur temps réel avec scoring /100
          sur les 7 critères et insertion guidée des termes sémantiques.
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
      <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
      {children}
    </h2>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-sm)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-1">
        {label}
      </div>
      <div className="font-[family-name:var(--font-display)] text-[24px] tracking-[-0.5px]">
        {value}
      </div>
    </div>
  );
}

function BenchRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 text-[13px] ${
        last ? "" : "border-b border-[var(--border)]"
      }`}
    >
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] font-semibold">{value}</span>
    </div>
  );
}

function KwTier({
  label,
  color,
  bg,
  terms,
}: {
  label: string;
  color: string;
  bg: string;
  terms: NlpResult["nlpTerms"];
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-[6px] h-[6px] rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.8px]">{label}</span>
        <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
          {terms.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-[5px]">
        {terms.map((t) => (
          <span
            key={t.term}
            className="inline-flex items-center gap-1 px-[10px] py-[5px] rounded-full text-[12px] font-medium border"
            style={{ background: bg, borderColor: color, color }}
          >
            {t.term}
            {t.maxCount > 0 && (
              <span
                className="text-[9px] opacity-80 font-[family-name:var(--font-mono)]"
                title={`Fourchette concurrents (moyenne ${t.avgCount})`}
              >
                {t.minCount === t.maxCount
                  ? `×${t.maxCount}`
                  : `${t.minCount}-${t.maxCount}`}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR");
}

function getIntentLabel(intent: string): string {
  switch (intent) {
    case "transactional": return "Transactionnel";
    case "informational": return "Informationnel";
    case "commercial":    return "Comparatif";
    case "navigational":  return "Marque/Produit";
    case "local":         return "Local";
    default:              return intent;
  }
}

function getIntentDescription(intent: string): string {
  switch (intent) {
    case "transactional": return "Intention d'achat — fiche produit, e-commerce, prix, promo";
    case "informational": return "Intention d'apprendre — guide, tutoriel, définition, explication";
    case "commercial":    return "Comparaison avant achat — top, meilleur, vs, avis, test";
    case "navigational":  return "Recherche d'une marque ou produit spécifique";
    case "local":         return "Intent géolocalisé — ville, région, près de";
    default:              return "";
  }
}

function getIntentStyle(intent: string): React.CSSProperties {
  switch (intent) {
    case "transactional": return { background: "var(--orange-bg)", color: "var(--orange)" };
    case "informational": return { background: "var(--blue-bg)", color: "var(--blue)" };
    case "commercial":    return { background: "var(--bg-olive-light)", color: "var(--accent-dark)" };
    case "navigational":  return { background: "#FFF0F0", color: "var(--red)" };
    case "local":         return { background: "var(--green-bg)", color: "var(--green)" };
    default:              return {};
  }
}
