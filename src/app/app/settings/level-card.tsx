import type { Translator } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { formatNumber } from "@/lib/relative-date";

type Props = {
  /** Traducteur et locale passés par la page : ce composant est rendu côté
   *  serveur, il n'a pas accès au contexte client. */
  t: Translator;
  locale: Locale;
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
  t,
  locale,
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
            <span className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[var(--text)]">
              Lv
            </span>
            <span className="df-title text-[24px] text-[var(--text)] leading-none">
              {level}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[14px] font-semibold">
              {formatNumber(totalXp, locale)} XP
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {t("level.toNext", { xp: formatNumber(xpToNextLevel, locale), level: level + 1 })}
            </span>
          </div>
          <div className="h-2 bg-[var(--bg-warm)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--bg-black)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {formatNumber(currentLevelAt, locale)}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {formatNumber(nextLevelAt, locale)}
            </span>
          </div>
        </div>
      </div>

      {/* Règles + breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <RuleCard
          t={t}
          label={t("level.rule.created")}
          count={nCreated}
          unitXp={xpRules.created}
          totalXp={nCreated * xpRules.created}
          color="var(--blue)"
        />
        <RuleCard
          t={t}
          label={t("level.rule.median")}
          count={nAboveMedian}
          unitXp={xpRules.aboveMedian}
          totalXp={nAboveMedian * xpRules.aboveMedian}
          color="var(--brand-yellow)"
        />
        <RuleCard
          t={t}
          label={t("level.rule.best")}
          count={nAboveBest}
          unitXp={xpRules.aboveBest}
          totalXp={nAboveBest * xpRules.aboveBest}
          color="var(--brand-kaki)"
        />
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        {t("level.rules", {
          created: xpRules.created,
          median: xpRules.aboveMedian,
          best: xpRules.aboveBest,
        })}
      </p>

      {/* Top 5 lifetime */}
      {topUsers.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-2">
            {t("level.top5")}
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
                  <span className="w-5 text-[11px] text-[var(--text-muted)] font-mono">
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
                    <span className="w-5 h-5 rounded-full bg-[var(--bg-olive-light)] text-[var(--text)] flex items-center justify-center text-[9px] font-bold">
                      {(u.name || "").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 text-[12px] truncate">
                    {u.name} {isMe && <span className="text-[var(--text-muted)] font-normal">{t("home.leaderboard.you")}</span>}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    Lv {u.level}
                  </span>
                  <span className="text-[11px] font-mono font-semibold w-16 text-right">
                    {formatNumber(u.xp, locale)} XP
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
  t,
  label,
  count,
  unitXp,
  totalXp,
  color,
}: {
  t: Translator;
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
        <span className="text-[10px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[20px] df-title leading-none">
          {count}
        </span>
        {/* Charte : le compteur reste en noir, la puce du titre porte deja
            la couleur du palier. */}
        <span className="text-[11px] font-mono font-semibold text-[var(--text)]">
          {totalXp > 0 ? `+${totalXp}` : "—"} XP
        </span>
      </div>
      <span className="text-[10px] text-[var(--text-muted)]">{t("level.perUnit", { xp: unitXp })}</span>
    </div>
  );
}
