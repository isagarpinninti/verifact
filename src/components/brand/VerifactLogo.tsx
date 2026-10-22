interface VerifactLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
}

const SIZES = {
  sm: { box: 22, text: "text-base", badge: "text-[10px] px-1.5 py-0.5" },
  md: { box: 28, text: "text-lg", badge: "text-[11px] px-2 py-0.5" },
  lg: { box: 38, text: "text-2xl", badge: "text-xs px-2.5 py-0.5" },
} as const;

/** One stroke: a "V" that is also a check mark, ending in a seal dot. Inherits the text colour. */
export function VerifactLogo({ className = "", iconOnly = false, size = "md", showBadge = true }: VerifactLogoProps) {
  const d = SIZES[size];
  return (
    <div className={`inline-flex select-none items-center gap-2.5 text-slate-900 dark:text-white ${className}`}>
      <svg width={d.box} height={d.box} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" role="img" aria-label="Verifact logo mark">
        <path d="M5.5 14L13.5 24L25 8" stroke="currentColor" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="27.5" cy="6" r="2.25" fill="currentColor" />
      </svg>
      {!iconOnly && (
        <div className="flex items-center gap-2">
          <span className={`font-semibold tracking-tight ${d.text}`}>Verifact</span>
          {showBadge && <span className={`rounded-md border border-slate-300 font-mono font-medium uppercase tracking-wider text-slate-500 dark:border-white/15 dark:text-slate-400 ${d.badge}`}>TRUTH</span>}
        </div>
      )}
    </div>
  );
}
