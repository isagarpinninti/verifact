"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, Eraser, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { pinSources, type AutoGroundResult, type ClaimValue, type Evaluated, type ProvenanceDossier } from "@verifact/core";
import { Button, ClaimSpanWeaveInspector, EpistemicSealInspector, HallucinationGateCard, PrimarySourceVault } from "@verifact/react";
import type { EvidenceClient } from "@/lib/client";
import type { LogFn } from "../log";
import { PageHeader, Select } from "../ui";

interface Props {
  client: EvidenceClient | null;
  dossiers: ProvenanceDossier[];
  dossier: ProvenanceDossier | null;
  onDossier: (id: string) => void;
  log: LogFn;
  onSealed: () => void;
}

export function TruthView({ client, dossiers, dossier, onDossier, log, onSealed }: Props) {
  const [base, setBase] = useState<ProvenanceDossier | null>(null);
  const [claimOverrides, setClaimOverrides] = useState<Record<string, ClaimValue>>({});
  const [sourceOverrides, setSourceOverrides] = useState<Record<string, string>>({});
  const [lastId, setLastId] = useState<string | null>(null);
  const [result, setResult] = useState<Evaluated | null>(null);
  const [grounding, setGrounding] = useState<AutoGroundResult | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching dossier resets the what-if state (adjust state while rendering, not in an effect).
  if (dossier && dossier.id !== lastId) {
    setLastId(dossier.id);
    setClaimOverrides({});
    setSourceOverrides({});
    setGrounding(null);
    setToken(null);
    setBase(null);
    setResult(null);
  }

  // The working baseline: the dossier with every source pinned, so one changed byte trips EC-105.
  useEffect(() => {
    if (!dossier) return;
    let live = true;
    void (dossier.sources.every((s) => s.expectedSha256) ? Promise.resolve(dossier) : pinSources(dossier)).then((d) => {
      if (live) setBase(d);
    });
    return () => {
      live = false;
    };
  }, [dossier]);

  useEffect(() => {
    if (!client || !base) return;
    let live = true;
    const t = setTimeout(() => {
      client
        .evaluate(base, { claimOverrides, sourceOverrides })
        .then((e) => {
          if (live) {
            setResult(e);
            setError(null);
          }
        })
        .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Evaluation failed"));
    }, 60);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [client, base, claimOverrides, sourceOverrides]);

  const sources = useMemo(() => (base ? base.sources.map((s) => ({ ...s, content: sourceOverrides[s.id] ?? s.content })) : []), [base, sourceOverrides]);
  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s.content])), [sources]);

  if (!dossier) return <p className="text-sm text-slate-500">No dossiers defined. Create one in Dossier Studio.</p>;
  const touch = (): void => {
    setToken(null);
    setGrounding(null);
  };
  const setClaim = (id: string, v: ClaimValue): void => {
    touch();
    setClaimOverrides((o) => ({ ...o, [id]: v }));
  };

  const numeric = base?.claims.filter((c) => c.valueType === "number") ?? [];
  const inject = (): void => {
    const c = numeric.find((x) => /amount|total|price|spend/i.test(`${x.fieldKey} ${x.label}`)) ?? numeric[0];
    const r = result?.evaluation.claimResults.find((x) => x.claimId === c?.id);
    if (!c || !r || r.sourceValue === null) return;
    setClaim(c.id, Math.round(Number(r.sourceValue) / 10));
    log("warn", `Injected a simulated AI hallucination into “${c.label}”: ${String(r.sourceValue)} → ${Math.round(Number(r.sourceValue) / 10)}`);
  };
  const corrupt = (): void => {
    const s = sources.find((x) => /\d/.test(x.content));
    if (!s) return;
    const i = s.content.search(/\d/);
    const d = s.content[i];
    touch();
    setSourceOverrides((o) => ({ ...o, [s.id]: `${s.content.slice(0, i)}${d === "9" ? "0" : String(Number(d) + 1)}${s.content.slice(i + 1)}` }));
    log("warn", `Corrupted one byte of “${s.title}” (offset ${i})`);
  };
  const reset = (): void => {
    touch();
    setClaimOverrides({});
    setSourceOverrides({});
  };
  const autoGround = async (): Promise<void> => {
    if (!client || !base) return;
    try {
      const e = await client.evaluate(base, { claimOverrides, sourceOverrides, autoGround: true });
      setGrounding(e.grounding);
      setToken(null);
      setClaimOverrides((o) => ({ ...o, ...Object.fromEntries((e.grounding?.changes ?? []).map((c) => [c.claimId, c.to])) }));
      log(e.grounding?.changes.length ? "ok" : "info", e.grounding?.changes.length ? `Auto-grounded ${e.grounding.changes.length} claim(s) from primary-source bytes` : "Nothing to auto-ground");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-ground failed");
    }
  };
  const seal = async (): Promise<void> => {
    if (!client || !base) return;
    setSealing(true);
    try {
      const c = await client.certify(base, { claimOverrides, sourceOverrides });
      setToken(c.token);
      setError(null);
      log("ok", `Sealed ${c.certificateId} · score ${c.evaluation.epistemicScore} · ledger #${c.record.seq}`);
      onSealed();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Sealing failed";
      setError(m);
      log("err", `Seal refused: ${m}`);
    } finally {
      setSealing(false);
    }
  };

  const ev = result?.evaluation;
  return (
    <>
      <PageHeader
        title="Live Truth Workbench"
        description="Edit a claim or a source byte and watch the hallucination gate react. Only grounded dossiers can be sealed and handed to Assentra or Pactline."
        actions={
          <div className="min-w-[260px] flex-1 sm:flex-none">
            <Select value={dossier.id} onChange={(e) => onDossier(e.target.value)} aria-label="Dossier">
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Sparkles size={13} /> Scenarios</span>
        <Button variant="secondary" disabled={numeric.length === 0} onClick={inject}><Bug size={13} /> Inject 10x invoice hallucination</Button>
        <Button variant="secondary" onClick={corrupt}><Eraser size={13} /> Corrupt source log byte</Button>
        <Button variant="secondary" onClick={() => void autoGround()}><Wand2 size={13} /> Auto-ground all claims</Button>
        <Button variant="ghost" onClick={reset}><RotateCcw size={13} /> Reset</Button>
      </div>
      {error ? <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">{error}</p> : null}

      {ev && base ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <PrimarySourceVault sources={sources} claimResults={ev.claimResults} selectedClaimId={selectedClaim} onSelectClaim={setSelectedClaim} onChangeSource={(id, content) => { touch(); setSourceOverrides((o) => ({ ...o, [id]: content })); }} />
            <ClaimSpanWeaveInspector results={ev.claimResults} onChangeClaim={setClaim} selectedClaimId={selectedClaim} onSelectClaim={setSelectedClaim} />
          </div>
          <div className="space-y-5">
            <HallucinationGateCard evaluation={ev} grounding={grounding} onAutoGround={() => void autoGround()} onSeal={() => void seal()} sealing={sealing} />
            <EpistemicSealInspector token={token} sources={sourceMap} />
          </div>
        </div>
      ) : null}
    </>
  );
}
