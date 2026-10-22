"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Fingerprint, Pencil, ShieldAlert, ShieldCheck } from "lucide-react";
import { sha256OfSource, utf8Length, type ClaimResult, type PrimarySource } from "@verifact/core";
import { Badge, Button, Card, CardHeader } from "../ui";
import { bytes, cn } from "../utils";

export interface PrimarySourceVaultProps {
  sources: readonly PrimarySource[];
  /** Claim results for the CURRENT source content; their spans are what gets highlighted. */
  claimResults: readonly ClaimResult[];
  /** Called with the edited content. Omit to make the vault read-only. */
  onChangeSource?: (sourceId: string, content: string) => void;
  selectedClaimId?: string | null;
  onSelectClaim?: (claimId: string) => void;
}

interface Segment {
  text: string;
  excerpt: boolean;
  value: boolean;
  claimId: string | null;
}

/** Splits `content` at every span boundary so excerpts (cyan) and exact values (amber) can be highlighted. */
function segments(content: string, results: readonly ClaimResult[]): Segment[] {
  const marks = results.flatMap((r) => [
    ...(r.span ? [{ s: r.span.startChar, e: r.span.endChar, kind: "excerpt" as const, id: r.claimId }] : []),
    ...(r.valueSpan ? [{ s: r.valueSpan.startChar, e: r.valueSpan.endChar, kind: "value" as const, id: r.claimId }] : []),
  ]);
  const cuts = [...new Set([0, content.length, ...marks.flatMap((m) => [m.s, m.e])])].filter((n) => n >= 0 && n <= content.length).sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const cover = marks.filter((m) => m.s <= a && m.e >= b);
    out.push({ text: content.slice(a, b), excerpt: cover.some((m) => m.kind === "excerpt"), value: cover.some((m) => m.kind === "value"), claimId: cover.find((m) => m.kind === "value")?.id ?? cover[0]?.id ?? null });
  }
  return out;
}

export function PrimarySourceVault({ sources, claimResults, onChangeSource, selectedClaimId = null, onSelectClaim }: PrimarySourceVaultProps) {
  const [activeId, setActiveId] = useState(sources[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [digests, setDigests] = useState<Record<string, string>>({});
  const active = sources.find((s) => s.id === activeId) ?? sources[0];

  const contentKey = sources.map((s) => `${s.id}:${s.content.length}:${s.content.slice(0, 64)}:${s.content.slice(-64)}`).join("|");
  useEffect(() => {
    let live = true;
    void Promise.all(sources.map(async (s) => [s.id, await sha256OfSource(s.content)] as const)).then((pairs) => {
      if (live) setDigests(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
    // `sources` content changes are tracked by contentKey so typing re-hashes without re-running on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const mine = useMemo(() => claimResults.filter((r) => r.sourceId === active?.id), [claimResults, active?.id]);
  const parts = useMemo(() => (active ? segments(active.content, mine) : []), [active, mine]);
  if (!active) return null;
  const digest = digests[active.id];
  const pinned = active.expectedSha256;
  const state = pinned === undefined ? "unpinned" : digest === undefined ? "hashing" : digest === pinned ? "match" : "mismatch";

  return (
    <Card>
      <CardHeader
        icon={<Database size={16} />}
        title="Primary Source Vault"
        subtitle="Immutable source bytes, SHA-256 digests and the spans each claim anchors to"
        right={
          onChangeSource ? (
            <Button variant="secondary" onClick={() => setEditing((e) => !e)}>
              <Pencil size={13} /> {editing ? "Done" : "Edit source"}
            </Button>
          ) : null
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        <div role="tablist" aria-label="Sources" className="flex gap-1 overflow-x-auto">
          {sources.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === active.id} onClick={() => setActiveId(s.id)} className={cn("cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50", s.id === active.id ? "border-slate-900 bg-slate-900 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-slate-950" : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800")}>
              {s.title}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate">{active.sourceType}</Badge>
          <Badge tone="slate">{bytes(utf8Length(active.content))} · {utf8Length(active.content)} bytes</Badge>
          <Badge tone={state === "match" ? "emerald" : state === "mismatch" ? "rose" : "slate"}>
            {state === "mismatch" ? <ShieldAlert size={11} /> : state === "match" ? <ShieldCheck size={11} /> : <Fingerprint size={11} />}
            {state === "match" ? "SHA-256 matches pin" : state === "mismatch" ? "SHA-256 differs from pin" : state === "unpinned" ? "Not pinned" : "Hashing…"}
          </Badge>
        </div>
        <p className="break-all rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-[10.5px] text-slate-500 dark:bg-slate-950 dark:text-slate-400" aria-label="SHA-256 digest">
          sha256 {digest ?? "…"}
          {state === "mismatch" ? <span className="block text-rose-600 dark:text-rose-400">pinned {pinned}</span> : null}
        </p>

        {editing && onChangeSource ? (
          <textarea value={active.content} onChange={(e) => onChangeSource(active.id, e.target.value)} spellCheck={false} rows={12} aria-label={`Edit ${active.title}`} className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            {parts.map((p, i) =>
              p.excerpt || p.value ? (
                <mark
                  key={i}
                  onClick={() => p.claimId && onSelectClaim?.(p.claimId)}
                  title={p.claimId ? `claim ${p.claimId}` : undefined}
                  className={cn("cursor-pointer rounded-sm px-px text-inherit", p.value ? "bg-amber-300/70 ring-1 ring-amber-500/60 dark:bg-amber-400/30" : "bg-cyan-200/70 dark:bg-cyan-400/20", p.claimId === selectedClaimId && "outline outline-2 outline-offset-1 outline-cyan-500")}
                >
                  {p.text}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </pre>
        )}

        <ul className="space-y-1" aria-label="Anchors in this source">
          {mine.length === 0 ? <li className="text-xs text-slate-400">No claim cites this source.</li> : null}
          {mine.map((r) => (
            <li key={r.claimId}>
              <button type="button" onClick={() => onSelectClaim?.(r.claimId)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:hover:bg-slate-800">
                <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{r.label}</span>
                <span className="font-mono text-[10.5px] text-slate-500">{r.span ? `[bytes ${r.span.startByte}..${r.span.endByte}]` : "no span"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
