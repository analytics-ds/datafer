import { LogoDatashake, LogoMark } from "@/components/brand";

/**
 * Aperçu stylisé de l'outil affiché à gauche de l'écran de login.
 * Reproduit en HTML/CSS une "photo" de l'outil (score ring, éditeur,
 * sidebar NLP) pour donner envie avant la connexion.
 *
 * Charte : le fond reste une couleur principale (beige), la profondeur vient
 * du pattern dérivé du logo, jamais d'un halo coloré. Les couleurs secondaires
 * n'apparaissent que sur de tout petits éléments, et le graphique de score est
 * posé sur fond noir.
 */
export function LoginPreview() {
  return (
    <div className="relative hidden md:flex flex-col justify-between h-full bg-[var(--bg)] overflow-hidden p-10 lg:p-14 border-r border-[var(--border)]">
      {/* Pattern de marque : la charte le décrit comme quelques blocs issus du
          logo, posés à des positions différentes, en noir ou blanc et d'un
          usage minimaliste. Trois formes suffisent, sans motif répété. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden text-[var(--text)]">
        <LogoMark size={420} className="absolute -top-32 -right-40 opacity-[0.04]" />
        <LogoMark size={200} className="absolute bottom-24 -left-16 opacity-[0.03] rotate-180" />
        <LogoMark size={120} className="absolute top-1/2 right-24 opacity-[0.03]" />
      </div>

      {/* Header brand */}
      <div className="relative z-10 flex items-center gap-3 text-[var(--text)]">
        <LogoDatashake height={22} />
      </div>

      {/* Mock de l'interface */}
      <div className="relative z-10 flex-1 flex items-center justify-center py-10">
        <MockInterface />
      </div>

      {/* Tagline */}
      <div className="relative z-10 max-w-[480px]">
        <h2 className="df-title text-[44px] leading-[1.05] tracking-[-1.2px] mb-3">
          Analysez, optimisez,
          <br />
          <span className="df-accent">dominez.</span>
        </h2>
        <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] max-w-[380px]">
          Analyse les top résultats Google, extrait les patterns NLP et score
          ton contenu en temps réel. Au cœur de la stack SEO datashake.
        </p>
      </div>
    </div>
  );
}

function MockInterface() {
  const circumference = 2 * Math.PI * 26;
  const score = 78;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div
      className="w-full max-w-[560px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden transform -rotate-[0.4deg]"
      style={{ boxShadow: "0 20px 60px -20px rgba(16,16,16,0.15), 0 8px 24px -12px rgba(16,16,16,0.1)" }}
    >
      {/* Mini top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-[10px]">
          <span className="df-title text-[18px] leading-none">
            chaussures running homme
          </span>
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px]">
            FR
          </span>
        </div>
        <div className="flex items-center gap-[6px] px-3 py-1 border border-[var(--border)] text-[var(--text)] rounded-[var(--radius-pill)] text-[11px] font-semibold">
          <span className="w-[6px] h-[6px] rounded-full bg-[var(--brand-kaki)]" />
          Confiance haute
        </div>
      </div>

      {/* Score : bandeau noir, seul contexte où la charte autorise les couleurs
          secondaires pour représenter une donnée. */}
      <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-black)] text-[var(--text-inverse)]">
        <div className="flex items-center gap-3">
          <div className="relative w-[60px] h-[60px]">
            <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--score-track)" strokeWidth="4" />
              <circle
                cx="30"
                cy="30"
                r="26"
                fill="none"
                stroke="var(--score-high)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-[15px]">
              {score}
            </div>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[12px] font-semibold">Score SEO</span>
            <span className="text-[11px] text-[var(--text-inverse-muted)]">Bien optimisé</span>
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          <span className="font-mono text-[12px] text-[var(--text-inverse-secondary)]">
            <strong className="text-[var(--text-inverse)]">1 284</strong> mots
          </span>
          <div className="w-[90px] h-1 bg-[var(--score-track)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--score-high)] rounded-full" style={{ width: "82%" }} />
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-[1fr_180px] h-[200px]">
        {/* Fake editor */}
        <div className="p-5 overflow-hidden">
          <div className="df-title text-[20px] leading-[1.2] mb-3 pb-2 border-b border-[var(--border)]">
            Meilleures chaussures de running
          </div>
          <div className="space-y-[6px]">
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-full" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[92%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[85%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[96%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[78%]" />
          </div>
          <div className="text-[13px] font-semibold mt-4 mb-2 text-[var(--text)]">Amorti &amp; stabilité</div>
          <div className="space-y-[6px]">
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[88%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[72%]" />
          </div>
        </div>

        {/* Mini sidebar NLP */}
        <div className="p-4 bg-[var(--bg-warm)] border-l border-[var(--border)] overflow-hidden">
          <div className="text-[9px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-2 flex items-center gap-[5px]">
            <span className="w-[6px] h-[6px] rounded-full bg-[var(--accent)]" />
            Champ sémantique
          </div>
          <div className="flex flex-wrap gap-[4px]">
            <KwTag label="amorti" used />
            <KwTag label="foulée" used />
            <KwTag label="drop" />
            <KwTag label="asphalte" used />
            <KwTag label="pronation" missing="essential" />
            <KwTag label="mesh" />
            <KwTag label="outsole" missing="important" />
            <KwTag label="stack" used />
          </div>
        </div>
      </div>
    </div>
  );
}

function KwTag({
  label,
  used,
  missing,
}: {
  label: string;
  used?: boolean;
  missing?: "essential" | "important";
}) {
  /* Le texte du tag reste noir : seule la puce porte la couleur secondaire,
     conformément à la charte (petits éléments uniquement). */
  const dot =
    used ? "var(--brand-kaki)"
    : missing === "essential" ? "var(--brand-yellow)"
    : missing === "important" ? "var(--brand-blue)"
    : "transparent";

  return (
    <span className="inline-flex items-center gap-[4px] px-[7px] py-[2px] rounded-full text-[10px] font-medium border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]">
      <span
        className="w-[4px] h-[4px] rounded-full shrink-0"
        style={{
          background: dot,
          boxShadow: dot === "transparent" ? "inset 0 0 0 1px var(--border-strong)" : "none",
        }}
      />
      {label}
    </span>
  );
}
