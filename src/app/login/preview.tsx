/**
 * Aperçu stylisé de Datafer affiché à gauche de l'écran de login.
 * Reproduit en HTML/CSS une "photo" de l'outil (score ring, éditeur,
 * sidebar NLP) pour donner envie avant la connexion.
 */
export function LoginPreview() {
  return (
    <div className="relative hidden md:flex flex-col justify-between h-full bg-[var(--bg-warm)] overflow-hidden p-10 lg:p-14 border-r border-[var(--border)]">
      {/* Halo décoratif olive en fond */}
      <div
        aria-hidden
        className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--bg-olive-light) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-48 -right-32 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--bg-olive) 0%, transparent 70%)" }}
      />

      {/* Header brand */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="ds-logo text-[var(--text)]">
          <div className="ds-logo-mark">
            <div className="sq sq1" />
            <div className="sq sq2" />
          </div>
          <span className="ds-logo-name">datashake</span>
        </div>
        <div className="w-px h-6 bg-[var(--border)]" />
        <span className="font-semibold text-[14px] tracking-[-0.2px]">Datafer</span>
      </div>

      {/* Mock de l'interface */}
      <div className="relative z-10 flex-1 flex items-center justify-center py-10">
        <MockInterface />
      </div>

      {/* Tagline */}
      <div className="relative z-10 max-w-[480px]">
        <h2 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.05] tracking-[-1.2px] mb-3">
          Analysez, optimisez,
          <br />
          <em className="italic text-[var(--accent-dark)]">dominez.</em>
        </h2>
        <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] max-w-[380px]">
          Analyse les top résultats Google, extrait les patterns NLP et score
          ton contenu en temps réel. Au cœur de la stack SEO Datashake.
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
      className="w-full max-w-[560px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden"
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      {/* Mini top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-[10px]">
          <span className="font-[family-name:var(--font-display)] text-[18px] leading-none">
            chaussures running homme
          </span>
          <span className="px-[10px] py-[3px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[10px] font-semibold tracking-[0.5px]">
            FR
          </span>
        </div>
        <div className="flex items-center gap-[5px] px-3 py-1 bg-[var(--green-bg)] text-[var(--green)] rounded-[var(--radius-pill)] text-[11px] font-semibold">
          <span className="w-[6px] h-[6px] rounded-full bg-[var(--green)]" />
          Confiance haute
        </div>
      </div>

      {/* Score bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="relative w-[60px] h-[60px]">
            <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--border)" strokeWidth="4" />
              <circle
                cx="30"
                cy="30"
                r="26"
                fill="none"
                stroke="var(--green)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-mono)] font-semibold text-[15px]">
              {score}
            </div>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[12px] font-semibold">Score SEO</span>
            <span className="text-[11px] text-[var(--text-muted)]">Bien optimisé</span>
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
            <strong className="text-[var(--text)]">1 284</strong> mots
          </span>
          <div className="w-[90px] h-1 bg-[var(--bg-warm)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--green)] rounded-full" style={{ width: "82%" }} />
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-[1fr_180px] h-[200px]">
        {/* Fake editor */}
        <div className="p-5 overflow-hidden">
          <div className="font-[family-name:var(--font-display)] text-[20px] leading-[1.2] mb-3 pb-2 border-b-2 border-[var(--bg-olive-light)]">
            Meilleures chaussures de running
          </div>
          <div className="space-y-[6px]">
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-full" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[92%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[85%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[96%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[78%]" />
          </div>
          <div className="text-[13px] font-semibold mt-4 mb-2">Amorti & stabilité</div>
          <div className="space-y-[6px]">
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[88%]" />
            <div className="h-2 bg-[var(--bg-warm)] rounded-full w-[72%]" />
          </div>
        </div>

        {/* Mini sidebar NLP */}
        <div className="p-4 bg-[var(--bg)] border-l border-[var(--border)] overflow-hidden">
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
  let cls = "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text)]";
  if (used) cls = "bg-[var(--green-bg)] border-[var(--green)] text-[var(--green)]";
  else if (missing === "essential")
    cls = "bg-[#FFF0F0] border-[#E8BCBC] text-[var(--red)]";
  else if (missing === "important")
    cls = "bg-[var(--orange-bg)] border-[#E8D6A0] text-[var(--orange)]";

  return (
    <span
      className={`inline-flex items-center px-[7px] py-[2px] rounded-full text-[10px] font-medium border ${cls}`}
    >
      {label}
    </span>
  );
}
