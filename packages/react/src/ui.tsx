import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

/* ───────────── Root scope (resets + theme hook for host apps) ───────────── */

export function SurfaceRoot({
  theme,
  className,
  children,
}: {
  /** Force a theme. Omit to inherit a `.dark` class from an ancestor. */
  theme?: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("ec-root", theme === "dark" && "dark", className)}>{children}</div>;
}

/* ───────────── Surfaces ───────────── */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "ec-animate-in @container overflow-hidden rounded-xl border border-slate-200 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.12)]",
        "dark:border-slate-800 dark:bg-slate-900 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  right,
  accent = "brand",
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  accent?: "brand" | "amber";
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3.5 sm:px-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            accent === "brand"
              ? "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20"
              : "bg-slate-100 text-slate-900 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/15",
          )}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {right}
    </header>
  );
}

/* ───────────── Badges ───────────── */

export type BadgeTone = "brand" | "cyan" | "emerald" | "amber" | "rose" | "slate";

const TONES: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/25",
  cyan: "bg-cyan-50 text-cyan-800 ring-cyan-200/70 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/25",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

export function Badge({ tone = "slate", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: BadgeTone }) {
  const color: Record<BadgeTone, string> = {
    brand: "bg-brand-500",
    cyan: "bg-cyan-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-slate-400",
  };
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color[tone])} />;
}

/* ───────────── Buttons ───────────── */

type ButtonVariant = "primary" | "secondary" | "amber" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-700 dark:bg-white dark:text-black dark:hover:bg-slate-200 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600",
  amber:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-700 dark:bg-white dark:text-black dark:hover:bg-slate-200",
  danger:
    "border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-400/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-400/10",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
};

export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
        "disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ───────────── Form controls ───────────── */

export function FieldLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</span>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const move = (dir: 1 | -1): void => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
      className="inline-flex w-full flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/80 dark:ring-slate-700/60"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50",
            value === o.value
              ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.1)] ring-1 ring-slate-200 dark:bg-slate-950 dark:text-brand-300 dark:ring-slate-700"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  locked,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  locked?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={locked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed",
        checked ? "bg-brand-600 dark:bg-brand-400" : "bg-slate-300 dark:bg-slate-700",
        locked && "opacity-80",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-slate-950",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ───────────── Data viz ───────────── */

const METER_COLOR: Record<BadgeTone, string> = {
  brand: "from-brand-500 to-brand-400",
  cyan: "from-cyan-500 to-cyan-400",
  emerald: "from-emerald-500 to-emerald-400",
  amber: "from-amber-500 to-amber-400",
  rose: "from-rose-500 to-rose-400",
  slate: "from-slate-400 to-slate-300",
};

export function Meter({ value, max, tone, label }: { value: number; max: number; tone: BadgeTone; label?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(3, (value / max) * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
    >
      <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out", METER_COLOR[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 0–100 risk gauge rendered as a 180° arc. */
export function RiskGauge({ score, size = 72 }: { score: number; size?: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const r = 40;
  const c = Math.PI * r;
  const tone = clamped >= 60 ? "stroke-rose-500" : clamped >= 35 ? "stroke-amber-500" : "stroke-emerald-500";
  return (
    <svg width={size} height={size / 1.6} viewBox="0 0 100 62" role="img" aria-label={`Risk score ${clamped} of 100`}>
      <path d="M10 52 A40 40 0 0 1 90 52" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-slate-200 dark:stroke-slate-800" />
      <path
        d="M10 52 A40 40 0 0 1 90 52"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * c} ${c}`}
        className={cn("transition-all duration-500 ease-out", tone)}
      />
      <text x="50" y="50" textAnchor="middle" className="fill-slate-900 text-[22px] font-semibold dark:fill-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
        {clamped}
      </text>
    </svg>
  );
}
