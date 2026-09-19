import type React from "react";

/** Primitives de mise en page partagées par les deux versions de la doc. */
export function Section({ title, children, dot }: { title: string; children: React.ReactNode; dot: string }) {
  return (
    <section className="mb-10">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2px] text-[var(--text-muted)] mb-4 flex items-center gap-2">
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: dot }} />
        {title}
      </h2>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-sm)] text-[13px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[13px] font-semibold mt-4 mb-2">{children}</h4>;
}

export function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="font-code text-[12px] bg-[var(--bg-black)] text-[var(--text-inverse)] rounded-[var(--radius-xs)] p-3 mb-3 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-code text-[12px] bg-[var(--bg-dark)]/10 rounded px-1 py-[1px]">
      {children}
    </code>
  );
}

export function Err({ code, msg, cause }: { code: string; msg: string; cause: string }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 pr-4 font-code text-[var(--text)]">{code}</td>
      <td className="py-2 pr-4 font-code">{msg}</td>
      <td className="py-2">{cause}</td>
    </tr>
  );
}
