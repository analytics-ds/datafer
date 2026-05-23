type Props = {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
  currentLevelAt: number;
  nextLevelAt: number;
  nCreated: number;
  nAboveMedian: number;
  nAboveBest: number;
  xpRules: {
    created: number;
    aboveMedian: number;
    aboveBest: number;
  };
  topUsers: Array<{
    id: string;
    name: string;
    image: string | null;
    xp: number;
    level: number;
  }>;
  meId: string;
};

export function LevelCard({
  totalXp,
  level,
  xpInLevel,
  xpToNextLevel,
  currentLevelAt,
  nextLevelAt,
  nCreated,
  nAboveMedian,
  nAboveBest,
  xpRules,
  topUsers,
  meId,
}: Props) {
  const levelSpan = Math.max(1, nextLevelAt - currentLevelAt);
  const pct = Math.min(100, Math.round((xpInLevel / levelSpan) * 100));

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-5 flex flex-col gap-5">
      {/* Header : badge Lv + total XP + progression */}
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-16 h-16 rounded-full bg-[var(--bg-olive-light)] flex items-center justify-center border-2 border-[var(--accent-dark)]">
          <div className="flex flex-col items-center leading-none">
            <span className="text-[8px] font-semibold uppercase tracking-[0.5px] text-[var(--accent-dark)]">
              Lv
            </span>
            <span className="font-[family-name:var(--font-display)] text-[24px] text-[var(--accent-dark)] leading-none">
              {level}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[14px] font-semibold">
              {totalXp.toLocaleString("fr-FR")} XP
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
              {xpToNextLevel.toLocaleString("fr-FR")} XP avant Lv {level + 1}
            </span>
          </div>
          <div className="h-2 bg-[var(--bg-warm)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-dark)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
              {currentLevelAt.toLocaleString("fr-FR")}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
              {nextLevelAt.toLocaleString("fr-FR")}
            </span>
          </div>
        </div>
      </div>

      {/* Règles + breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <RuleCard
          label="Briefs créés"
          count={nCreated}
          unitXp={xpRules.created}
          totalXp={nCreated * xpRules.created}
          color="var(--blue)"
        />
        <RuleCard
          label="Score ≥ médiane"
          count={nAboveMedian}
          unitXp={xpRules.aboveMedian}
          totalXp={nAboveMedian * xpRules.aboveMedian}
          color="var(--orange)"
        />
        <RuleCard
          label="Score > best"
          count={nAboveBest}
          unitXp={xpRules.aboveBest}
          totalXp={nAboveBest * xpRules.aboveBest}
          color="var(--green)"
        />
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        +{xpRules.created} XP par brief créé, +{xpRules.aboveMedian} XP quand le
        score atteint la médiane des concurrents top 10, +{xpRules.aboveBest} XP
        s&apos;il dépasse le meilleur concurrent. Chaque palier ne se gagne
        qu&apos;une fois par brief.
      </p>

      {/* Top 5 lifetime */}
      {topUsers.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)] mb-2">
            Top 5 de l&apos;équipe (cumul lifetime)
          </div>
          <div className="flex flex-col">
            {topUsers.map((u, i) => {
              const isMe = u.id === meId;
              return (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 py-1.5 ${
                    isMe ? "font-semibold" : ""
                  }`}
                >
                  <span className="w-5 text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                    {i + 1}.
                  </span>
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.image}
                      alt=""
                      width={20}
                      height={20}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-[var(--bg-olive-light)] text-[var(--accent-dark)] flex items-center justify-center text-[9px] font-bold">
                      {(u.name || "").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 text-[12px] truncate">
                    {u.name} {isMe && <span className="text-[var(--text-muted)] font-normal">(toi)</span>}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
                    Lv {u.level}
                  </span>
                  <span className="text-[11px] font-[family-name:var(--font-mono)] font-semibold w-16 text-right">
                    {u.xp.toLocaleString("fr-FR")} XP
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({
  label,
  count,
  unitXp,
  totalXp,
  color,
}: {
  label: string;
  count: number;
  unitXp: number;
  totalXp: number;
  color: string;
}) {
  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-xs)] p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[20px] font-[family-name:var(--font-display)] leading-none">
          {count}
        </span>
        <span
          className="text-[11px] font-[family-name:var(--font-mono)] font-semibold"
          style={{ color }}
        >
          {totalXp > 0 ? `+${totalXp}` : "—"} XP
        </span>
      </div>
      <span className="text-[10px] text-[var(--text-muted)]">+{unitXp} XP / unité</span>
    </div>
  );
}
