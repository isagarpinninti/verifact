"use client";

import { Download, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { cn } from "@verifact/react";
import { VerifactLogo } from "@/components/brand/VerifactLogo";
import type { ThemeMode } from "@/lib/theme";
import { VIEW_TITLES, type ViewId } from "./nav";

interface Props {
  view: ViewId;
  onView: (v: ViewId) => void;
  themeMode: ThemeMode;
  onCycleTheme: () => void;
  onPalette: () => void;
  onExport: () => void;
  ledgerCount: number;
}

const MAIN_TABS: ViewId[] = ["truth", "studio", "ledger", "bridge"];

const control =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 transition-colors " +
  "hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10";

/** 56px global bar. Follows the theme: black with hairline borders in dark mode, white in light. */
export function TopNav({ view, onView, themeMode, onCycleTheme, onPalette, onExport, ledgerCount }: Props) {
  const tabButton = (id: ViewId, mobile: boolean) => {
    const active = view === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onView(id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50",
          active ? "bg-slate-900/[0.06] text-slate-900 dark:bg-white/10 dark:text-white" : "text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
          mobile && "flex-1 justify-center",
        )}
      >
        {VIEW_TITLES[id]}
        {id === "ledger" && ledgerCount > 0 ? <span className="rounded-full bg-slate-900/10 px-1.5 font-mono text-[10px] font-semibold text-slate-700 dark:bg-white/15 dark:text-slate-200">{ledgerCount}</span> : null}
      </button>
    );
  };

  return (
    <>
      <header className="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/85 px-3 text-slate-900 backdrop-blur-xl sm:px-4 lg:px-6 dark:border-white/10 dark:bg-black/80 dark:text-white">
        <button type="button" onClick={() => onView("truth")} aria-label="Verifact home" className="shrink-0 cursor-pointer">
          <VerifactLogo size="sm" showBadge className="[&_span.font-mono]:hidden sm:[&_span.font-mono]:inline-block" />
        </button>
        <span className="hidden h-6 w-px bg-slate-200 lg:block dark:bg-white/10" aria-hidden />

        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex [scrollbar-width:none]" aria-label="Primary">
          {MAIN_TABS.map((id) => tabButton(id, false))}
        </nav>
        <span className="flex-1 lg:hidden" />

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={onPalette} aria-label="Open command palette" className={cn(control, "hidden md:inline-flex")}>
            <Search size={13} /> <span className="hidden xl:inline">Command bar</span> <kbd className="hidden rounded border border-slate-200 px-1 text-[10px] text-slate-500 xl:inline dark:border-white/15 dark:text-slate-400">⌘K</kbd>
          </button>

          <button type="button" onClick={onExport} title="Export Studio configuration as JSON" className={cn(control, "hidden border-transparent bg-slate-900 font-semibold text-white hover:bg-slate-700 md:inline-flex dark:border-transparent dark:bg-white dark:text-black dark:hover:bg-slate-200")}>
            <Download size={13} /> <span className="hidden xl:inline">Export</span>
          </button>

          <button type="button" onClick={() => onView("settings")} aria-label="Settings" title="Settings" className={cn(control, "w-8 px-0", view === "settings" && "bg-slate-900/[0.06] dark:bg-white/10")}>
            <Settings size={15} />
          </button>
          <button type="button" onClick={onCycleTheme} aria-label={`Theme: ${themeMode}. Click to change`} title={`Theme: ${themeMode}`} className={cn(control, "w-8 px-0")}>
            {themeMode === "dark" ? <Moon size={15} /> : themeMode === "system" ? <Monitor size={15} /> : <Sun size={15} />}
          </button>
        </div>
      </header>
      <nav className="z-40 flex shrink-0 gap-1 border-b border-slate-200 bg-white px-2 pb-2 lg:hidden dark:border-white/10 dark:bg-black" aria-label="Primary mobile">
        {MAIN_TABS.map((id) => tabButton(id, true))}
      </nav>
    </>
  );
}
