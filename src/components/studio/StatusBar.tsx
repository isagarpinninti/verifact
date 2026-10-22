import { cn } from "@verifact/react";

interface Props {
  synced: boolean;
  issues: number;
  keyFingerprint: string | null;
  keyPersistent: boolean;
  mode: "connecting" | "server" | "local";
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="hidden items-center gap-1 whitespace-nowrap lg:inline-flex">
      <kbd className="rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{k}</kbd> {label}
    </span>
  );
}

/** 28px persistent footer: engine status, provider key fingerprint, shortcut hints. */
export function StatusBar({ synced, issues, keyFingerprint, keyPersistent, mode }: Props) {
  return (
    <footer className="z-40 flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-slate-200 bg-slate-100 px-4 font-mono text-[11px] text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", synced ? "bg-emerald-500" : "bg-amber-500")} />
        {synced ? "Engine Synchronized" : `${issues} issue${issues === 1 ? "" : "s"} — changes not applied`}
        <span className="rounded border border-slate-300 px-1 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-700">{mode === "server" ? "server" : mode === "local" ? "local demo" : "connecting"}</span>
      </span>
      <span title={keyPersistent ? "Persistent issuer signing key" : "Session-only signing key"}>PK: {keyFingerprint ? `ecdsa_p256_${keyFingerprint.slice(0, 6)}…${keyFingerprint.slice(-3)}` : "generating…"}</span>
      <span className="ml-auto flex items-center gap-4">
        <Hint k="⌘K" label="Command bar" />
        <Hint k="N" label="New dossier" />
        <Hint k="/" label="Filter" />
        <Hint k="⌘S" label="Export JSON" />
      </span>
    </footer>
  );
}
