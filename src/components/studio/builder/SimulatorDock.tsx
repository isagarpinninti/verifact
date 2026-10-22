"use client";

import { useEffect, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import type { ClaimValue, Evaluated, ProvenanceDossier } from "@verifact/core";
import { Badge, HallucinationGateCard, cn } from "@verifact/react";
import type { EvidenceClient } from "@/lib/client";
import type { TerminalEvent } from "../log";

interface Props {
  dossier: ProvenanceDossier;
  client: EvidenceClient | null;
  events: TerminalEvent[];
  onClear: () => void;
}

const TONE = { info: "text-slate-300", ok: "text-emerald-400", warn: "text-amber-300", err: "text-rose-400" } as const;
const MARK = { info: "·", ok: "✔", warn: "▲", err: "✖" } as const;

/** 420px dock: a live provenance simulator against the dossier being edited, plus the verifier terminal. */
export function SimulatorDock({ dossier, client, events, onClear }: Props) {
  const [overrides, setOverrides] = useState<Record<string, ClaimValue>>({});
  const [lastId, setLastId] = useState(dossier.id);
  const [result, setResult] = useState<Evaluated | null>(null);
  const [open, setOpen] = useState(true);
  const term = useRef<HTMLDivElement>(null);
  if (dossier.id !== lastId) {
    setLastId(dossier.id);
    setOverrides({});
  }

  useEffect(() => {
    if (!client) return;
    let live = true;
    const t = setTimeout(() => {
      void client.evaluate(dossier, { claimOverrides: overrides }).then((e) => {
        if (live) setResult(e);
      });
    }, 60);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [client, dossier, overrides]);

  useEffect(() => {
    if (open && term.current) term.current.scrollTop = term.current.scrollHeight;
  }, [events, open]);

  const ev = result?.evaluation;
  const tone = !ev ? "slate" : ev.gateStatus === "VERIFIED_GROUNDED" ? "emerald" : ev.gateStatus === "DRIFT_WARNING" ? "amber" : "rose";
  const claimed = (id: string, fallback: ClaimValue): ClaimValue => (id in overrides ? overrides[id] : fallback);

  return (
    <aside className="dark flex h-full min-h-0 flex-col border-l border-white/10 bg-slate-900 text-slate-100" aria-label="Simulator">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Provenance simulator</p>
          <p className="truncate text-sm font-semibold">{dossier.name}</p>
        </div>
        <Badge tone={tone}>{ev ? ev.gateStatus : "…"}</Badge>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <ul className="space-y-1.5" aria-label="Claims">
          {dossier.claims.map((c) => {
            const r = ev?.claimResults.find((x) => x.claimId === c.id);
            const bad = r && r.status !== "EXACT_GROUNDED";
            const value = claimed(c.id, c.claimedValue);
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-xs">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", !r ? "bg-slate-500" : r.status === "EXACT_GROUNDED" ? "bg-emerald-500" : r.status === "TOLERANCE_DRIFT" ? "bg-amber-500" : "bg-rose-500")} />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.valueType === "boolean" ? (
                  <select aria-label={`${c.label} simulated value`} value={String(value)} onChange={(e) => setOverrides((o) => ({ ...o, [c.id]: e.target.value === "true" }))} className="w-20 rounded border border-white/15 bg-transparent px-1 py-0.5 font-mono">
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    aria-label={`${c.label} simulated value`}
                    type={c.valueType === "number" ? "number" : "text"}
                    step="any"
                    value={String(value)}
                    onChange={(e) => {
                      const v = c.valueType === "number" ? Number(e.target.value) : e.target.value;
                      if (c.valueType !== "number" || Number.isFinite(v as number)) setOverrides((o) => ({ ...o, [c.id]: v }));
                    }}
                    className={cn("w-28 rounded border bg-transparent px-1.5 py-0.5 text-right font-mono", bad ? "border-rose-400/50" : "border-white/15")}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {ev ? (
          <HallucinationGateCard
            evaluation={ev}
            grounding={null}
            onAutoGround={() => {
              if (client) void client.evaluate(dossier, { claimOverrides: overrides, autoGround: true }).then((e) => setOverrides((o) => ({ ...o, ...Object.fromEntries((e.grounding?.changes ?? []).map((c) => [c.claimId, c.to])) })));
            }}
          />
        ) : null}
      </div>

      <div className={cn("flex flex-col border-t border-white/10 bg-slate-950", open ? "h-52" : "h-9")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-9 shrink-0 cursor-pointer items-center gap-2 px-4 text-left font-mono text-[11px] uppercase tracking-wider text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60">
          <TerminalSquare size={13} /> Verifier terminal <span className="text-slate-500">{events.length}</span>
          <span className="ml-auto flex items-center gap-3">
            {events.length > 0 ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onClear();
                  }
                }}
                className="text-slate-400 hover:text-white"
              >
                clear
              </span>
            ) : null}
            <span aria-hidden>{open ? "▾" : "▴"}</span>
          </span>
        </button>
        {open ? (
          <div ref={term} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-5" role="log" aria-live="polite">
            {events.length === 0 ? <p className="text-slate-500">$ waiting for verifier activity…</p> : null}
            {events.map((e) => (
              <p key={e.id} className={TONE[e.kind]}>
                <span className="text-slate-500">{e.at}</span> {MARK[e.kind]} {e.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
