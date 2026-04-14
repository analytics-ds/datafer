export default function AppHome() {
  return (
    <main className="flex flex-col items-center justify-center px-8 py-20 text-center min-h-[calc(100vh-56px)]">
      <span className="inline-flex items-center gap-[6px] px-4 py-[6px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-pill)] text-[11px] font-semibold tracking-[0.6px] uppercase mb-8">
        Content Optimizer
      </span>

      <h1 className="font-[family-name:var(--font-display)] text-[clamp(38px,5.5vw,68px)] font-normal leading-[1.05] tracking-[-1.5px] max-w-[680px] mb-4">
        Analysez, optimisez,
        <br />
        <em className="italic text-[var(--accent-dark)]">dominez.</em>
      </h1>
      <p className="text-[var(--text-secondary)] text-[16px] leading-[1.6] max-w-[440px] mb-11">
        Analysez les top résultats Google, extrayez les patterns NLP et optimisez votre
        contenu en temps réel.
      </p>

      <div className="flex items-stretch w-full max-w-[560px] bg-[var(--bg-card)] border-2 border-[var(--border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow)] opacity-60">
        <input
          disabled
          type="text"
          placeholder="Entrez votre mot-clé cible…"
          className="flex-1 px-[18px] py-[15px] outline-none text-[15px] bg-transparent cursor-not-allowed"
        />
        <select
          disabled
          className="px-[14px] border-l border-[var(--border)] bg-[var(--bg)] text-[13px] font-medium cursor-not-allowed"
        >
          <option>FR</option>
        </select>
        <button
          disabled
          className="px-[26px] py-[14px] bg-[var(--bg-black)] text-[var(--text-inverse)] text-[14px] font-semibold cursor-not-allowed"
        >
          Analyser →
        </button>
      </div>

      <p className="mt-10 text-[12px] text-[var(--text-muted)]">
        L&apos;éditeur et l&apos;analyse SERP arrivent dans la prochaine itération.
      </p>
    </main>
  );
}
