"use client";

import { Bug, Link2 } from "lucide-react";
import type { ClaimResult, ClaimStatus, ClaimValue } from "@verifact/core";
import { Badge, Button, Card, CardHeader, type BadgeTone } from "../ui";
import { cn } from "../utils";

export interface ClaimSpanWeaveInspectorProps {
  results: readonly ClaimResult[];
  onChangeClaim: (claimId: string, value: ClaimValue) => void;
  selectedClaimId?: string | null;
  onSelectClaim?: (claimId: string) => void;
  disabled?: boolean;
}

const STATUS: Record<ClaimStatus, { tone: BadgeTone; label: string; code: string }> = {
  EXACT_GROUNDED: { tone: "emerald", label: "EXACT_GROUNDED", code: "EC-101" },
  TOLERANCE_DRIFT: { tone: "amber", label: "TOLERANCE_DRIFT", code: "EC-102" },
  HALLUCINATED_VALUE: { tone: "rose", label: "HALLUCINATED_VALUE", code: "EC-103" },
  BROKEN_CITATION_SPAN: { tone: "rose", label: "BROKEN_CITATION_SPAN", code: "EC-104" },
  SOURCE_HASH_MISMATCH: { tone: "rose", label: "SOURCE_HASH_MISMATCH", code: "EC-105" },
};

const show = (v: ClaimValue | null): string => (v === null ? "—" : typeof v === "string" ? `"${v}"` : String(v));

function ClaimInput({ r, onChange, disabled }: { r: ClaimResult; onChange: (v: ClaimValue) => void; disabled?: boolean }) {
  const cls = "w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  if (r.valueType === "boolean") {
    return (
      <select aria-label={`${r.label} claimed value`} disabled={disabled} value={String(r.claimedValue)} onChange={(e) => onChange(e.target.value === "true")} className={cls}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (r.valueType === "number") {
    return (
      <input
        type="number"
        step="any"
        aria-label={`${r.label} claimed value`}
        disabled={disabled}
        value={Number.isFinite(Number(r.claimedValue)) ? Number(r.claimedValue) : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={cls}
      />
    );
  }
  return <input type="text" aria-label={`${r.label} claimed value`} disabled={disabled} value={String(r.claimedValue)} onChange={(e) => onChange(e.target.value)} className={cls} />;
}

export function ClaimSpanWeaveInspector({ results, onChangeClaim, selectedClaimId = null, onSelectClaim, disabled = false }: ClaimSpanWeaveInspectorProps) {
  const target = results.find((r) => r.valueType === "number" && r.sourceValue !== null && Number(r.sourceValue) !== 0 && r.status === "EXACT_GROUNDED");
  return (
    <Card>
      <CardHeader
        icon={<Link2 size={16} />}
        title="Claim Span Weave"
        subtitle="Every claim, woven back to the exact bytes of its source"
        right={
          <Button variant="secondary" disabled={disabled || !target} onClick={() => target && onChangeClaim(target.claimId, Math.round(Number(target.sourceValue) / 10))}>
            <Bug size={13} /> Inject simulated AI hallucination
          </Button>
        }
      />
      <div className="@container overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
              {["Claim", "Claimed value", "Source ground truth", "Byte span", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.claimId} onClick={() => onSelectClaim?.(r.claimId)} className={cn("cursor-pointer border-b border-slate-100 align-top transition-colors hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-white/5", r.claimId === selectedClaimId && "bg-cyan-50/60 dark:bg-cyan-400/5")}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.label}</div>
                    <div className="font-mono text-[10.5px] text-slate-400">{r.fieldKey}{r.required ? "" : " · optional"}</div>
                  </td>
                  <td className="w-44 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <ClaimInput r={r} onChange={(v) => onChangeClaim(r.claimId, v)} disabled={disabled} />
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">
                    <span className={cn(r.status === "HALLUCINATED_VALUE" && "font-semibold text-emerald-700 dark:text-emerald-300")}>{show(r.sourceValue)}</span>
                    {r.ambiguous ? <div className="text-[10px] text-amber-600">several values in span</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10.5px] text-cyan-700 dark:text-cyan-300">{r.span ? `[bytes ${r.span.startByte}..${r.span.endByte}]` : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <div className="mt-1 max-w-[260px] text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">{s.code} · {r.detail}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
