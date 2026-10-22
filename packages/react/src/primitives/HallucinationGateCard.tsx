"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Stamp, Wand2, XCircle } from "lucide-react";
import type { AutoGroundResult, GateStatus, ProvenanceCheck, ProvenanceEvaluationResult } from "@verifact/core";
import { Badge, Button, Card, CardHeader, type BadgeTone } from "../ui";
import { cn } from "../utils";

export interface HallucinationGateCardProps {
  evaluation: ProvenanceEvaluationResult;
  /** Rewrite hallucinated claims to the source bytes. */
  onAutoGround: () => void;
  /** Seal an `epc_` certificate. Disabled while the gate is blocked. Omit to hide the button (simulators). */
  onSeal?: () => void;
  sealing?: boolean;
  /** Result of the last auto-ground, if any. */
  grounding?: AutoGroundResult | null;
  sealLabel?: string;
}

const GATE: Record<GateStatus, { tone: BadgeTone; label: string; blurb: string; icon: ReactNode; ring: string }> = {
  VERIFIED_GROUNDED: { tone: "emerald", label: "Verified · Grounded", blurb: "Every claim is anchored to primary-source bytes.", icon: <ShieldCheck size={18} />, ring: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/25 dark:bg-emerald-400/[0.05]" },
  DRIFT_WARNING: { tone: "amber", label: "Drift · Warning", blurb: "Claims are grounded, but some drift within tolerance. The payload carries the source values.", icon: <AlertTriangle size={18} />, ring: "border-amber-200 bg-amber-50/70 dark:border-amber-400/25 dark:bg-amber-400/[0.05]" },
  HALLUCINATION_BLOCKED: { tone: "rose", label: "Hallucination · Blocked", blurb: "At least one claim is not backed by its source. Nothing downstream may use this dossier.", icon: <ShieldAlert size={18} />, ring: "border-rose-200 bg-rose-50/70 dark:border-rose-400/25 dark:bg-rose-400/[0.05]" },
};

const SEVERITY = { ok: <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />, warn: <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />, block: <XCircle size={15} className="text-rose-600 dark:text-rose-400" /> } as const;

/** 180° gauge, 0–100, higher is better. */
function TruthGauge({ score, tone }: { score: number; tone: BadgeTone }) {
  const v = Math.min(100, Math.max(0, score));
  const c = Math.PI * 40;
  const stroke = tone === "emerald" ? "stroke-emerald-500" : tone === "amber" ? "stroke-amber-500" : "stroke-rose-500";
  return (
    <svg width="120" height="76" viewBox="0 0 100 62" role="img" aria-label={`Epistemic score ${v} of 100`}>
      <path d="M10 52 A40 40 0 0 1 90 52" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-slate-200 dark:stroke-slate-800" />
      <path d="M10 52 A40 40 0 0 1 90 52" fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} className={cn("transition-all duration-500 ease-out", stroke)} />
      <text x="50" y="50" textAnchor="middle" className="fill-slate-900 text-[22px] font-semibold dark:fill-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>
    </svg>
  );
}

function CheckRow({ c }: { c: ProvenanceCheck }) {
  return (
    <li className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs", c.severity === "ok" ? "border-slate-200 dark:border-slate-800" : c.severity === "warn" ? "border-amber-200 bg-amber-50/50 dark:border-amber-400/25 dark:bg-amber-400/[0.04]" : "border-rose-200 bg-rose-50/50 dark:border-rose-400/25 dark:bg-rose-400/[0.04]")}>
      <span className="mt-px">{SEVERITY[c.severity]}</span>
      <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{c.message}</span>
      <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
    </li>
  );
}

export function HallucinationGateCard({ evaluation, onAutoGround, onSeal, sealing = false, grounding = null, sealLabel = "Seal epistemic certificate (epc_)" }: HallucinationGateCardProps) {
  const g = GATE[evaluation.gateStatus];
  const blocked = evaluation.gateStatus === "HALLUCINATION_BLOCKED";
  const fixable = evaluation.claimResults.some((c) => (c.status === "HALLUCINATED_VALUE" || c.status === "TOLERANCE_DRIFT") && c.sourceValue !== null && !c.ambiguous);
  return (
    <Card>
      <CardHeader icon={<ShieldAlert size={16} />} title="Hallucination Gate" subtitle="Epistemic truth gauge and checks EC-101 to EC-106" right={<Badge tone={g.tone}>{g.label}</Badge>} />
      <div className="space-y-4 p-4 sm:p-5">
        <div role="status" className={cn("flex items-center gap-4 rounded-lg border p-3.5", g.ring)}>
          <TruthGauge score={evaluation.epistemicScore} tone={g.tone} />
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{evaluation.gateStatus}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{g.blurb}</p>
          </div>
        </div>

        <ul className="space-y-2" aria-label="Provenance checks">
          {evaluation.checks.map((c) => (
            <CheckRow key={c.code} c={c} />
          ))}
        </ul>

        {grounding && grounding.changes.length > 0 ? (
          <div role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
            <p className="font-semibold">Auto-grounded from the primary source</p>
            <ul className="mt-1 space-y-0.5 font-mono">
              {grounding.changes.map((c) => (
                <li key={c.claimId}>{c.label}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {grounding && grounding.skipped.length > 0 ? (
          <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
            {grounding.skipped.map((s) => (
              <li key={s.claimId}>▲ {s.label}: {s.reason}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!fixable} onClick={onAutoGround} className="flex-1">
            <Wand2 size={14} /> Auto-ground from primary source
          </Button>
          {onSeal ? (
            <Button variant="amber" disabled={blocked || sealing} onClick={onSeal} className="flex-1">
              <Stamp size={14} /> {sealing ? "Sealing…" : sealLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
