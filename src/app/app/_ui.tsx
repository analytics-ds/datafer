import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex items-end justify-between gap-6 flex-wrap">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.05] tracking-[-1.2px] mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[var(--text-secondary)] text-[14px] leading-[1.55] max-w-[560px]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
      <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
      {children}
    </h2>
  );
}

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius)] px-7 py-12 text-center">
      <div className="font-semibold text-[14px] mb-1">{title}</div>
      <p className="text-[var(--text-secondary)] text-[13px] mb-5 max-w-[380px] mx-auto">
        {description}
      </p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-5 py-[9px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] transition-colors"
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}

export function PrimaryButton({
  children,
  type = "button",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-sm)] px-5 py-[10px] text-[13px] font-semibold hover:bg-[var(--bg-dark)] disabled:opacity-50 transition-colors"
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--text-muted)] mb-[6px]">
      {children}
    </label>
  );
}

export const inputCls =
  "w-full px-4 py-[11px] border-2 border-[var(--border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--bg-black)] transition-colors text-[14px] bg-[var(--bg-card)] placeholder:text-[var(--text-muted)]";
