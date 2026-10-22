"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Handshake, Stamp, Terminal } from "lucide-react";
import { bridgeToAssentraPayload, bridgeToPactlineTelemetry, decodeEpistemicCertificate, type ProvenanceDossier } from "@verifact/core";
import { Badge, Button, Card, CardHeader, cn } from "@verifact/react";
import type { EvidenceClient } from "@/lib/client";
import { buildSdkSnippets, type SdkSnippets } from "@/lib/sdkCode";
import { Label, PageHeader, Select, Tabs, TextArea } from "../ui";

interface Props {
  client: EvidenceClient | null;
  dossiers: ProvenanceDossier[];
  dossier: ProvenanceDossier | null;
  onDossier: (id: string) => void;
}

type Tab = keyof SdkSnippets;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "install", label: "Install" },
  { id: "core", label: "Core" },
  { id: "assentra", label: "Assentra" },
  { id: "pactline", label: "Pactline" },
  { id: "cli", label: "CLI" },
  { id: "curl", label: "cURL" },
  { id: "dossier", label: "Dossier JSON" },
];

function Layer({ n, name, pkg, token, children, tone }: { n: number; name: string; pkg: string; token: string; children: React.ReactNode; tone: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl border p-4", tone)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Layer {n}</p>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{name}</h3>
      <p className="mb-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">{pkg} · <span className="text-slate-900 dark:text-white">{token}</span></p>
      <div className="min-h-0 flex-1 space-y-2 text-xs">{children}</div>
    </div>
  );
}

export function BridgeView({ client, dossiers, dossier, onDossier }: Props) {
  const [pasted, setPasted] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("assentra");
  const [copied, setCopied] = useState(false);
  const snippets = useMemo(() => (dossier ? buildSdkSnippets(dossier) : null), [dossier]);

  const flow = useMemo(() => {
    if (!token) return null;
    try {
      const p = decodeEpistemicCertificate(token).payload;
      let tl: ReturnType<typeof bridgeToAssentraPayload> | null = null;
      let vp: ReturnType<typeof bridgeToPactlineTelemetry> | null = null;
      try {
        tl = bridgeToAssentraPayload(p);
      } catch {
        tl = null;
      }
      try {
        vp = bridgeToPactlineTelemetry(p);
      } catch {
        vp = null;
      }
      return { p, tl, vp };
    } catch {
      return null;
    }
  }, [token]);

  const seal = async (): Promise<void> => {
    if (!client || !dossier) return;
    setBusy(true);
    setError(null);
    try {
      setToken((await client.certify(dossier, {})).token);
    } catch (e) {
      setToken(null);
      setError(e instanceof Error ? e.message : "Could not seal the dossier");
    } finally {
      setBusy(false);
    }
  };
  const useToken = (): void => {
    if (!client) return;
    setError(null);
    void client.verifyToken(pasted.trim()).then((v) => {
      if (v.ok) setToken(pasted.trim());
      else {
        setToken(null);
        setError(`The certificate does not verify: ${v.reasons.join(" ")}`);
      }
    });
  };
  const copy = async (): Promise<void> => {
    if (!snippets) return;
    try {
      await navigator.clipboard.writeText(snippets[tab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div>
      <PageHeader title="Trilogy Bridge" description="Layer 1 proves the evidence, Layer 2 (Assentra) lets a human approve it, Layer 3 (Pactline) settles it. Verified claims flow downstream; hallucinations cannot." />
      <Card className="mb-5">
        <CardHeader icon={<Handshake size={16} />} title="Evidence → approval → settlement" subtitle="Seal a grounded dossier, or paste an epc_ token" right={flow ? <Badge tone="emerald">{flow.p.gateStatus}</Badge> : <Badge tone="slate">Not sealed</Badge>} />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <Label>Dossier</Label>
              {dossier ? <Select value={dossier.id} onChange={(e) => { setToken(null); onDossier(e.target.value); }} aria-label="Dossier">{dossiers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select> : null}
            </div>
            <Button variant="primary" disabled={!client || !dossier || busy} onClick={() => void seal()}><Stamp size={14} /> {busy ? "Sealing…" : "Verify, seal and bridge"}</Button>
          </div>
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Or paste an existing epc_ certificate</summary>
            <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <TextArea rows={4} spellCheck={false} aria-label="epc_ certificate" placeholder="epc_…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <Button variant="secondary" disabled={pasted.trim() === ""} onClick={useToken}>Verify and bridge</Button>
            </div>
          </details>
          {error ? <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200">{error}</p> : null}

          {flow ? (
            <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <Layer n={1} name="Verifact" pkg="@verifact/core" token={`epc_ ${flow.p.epistemicScore}/100`} tone="border-slate-200 dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-300">{flow.p.verifiedClaims.length} claims bound to {Object.keys(flow.p.sourceHashes).length} SHA-256 sources.</p>
                <ul className="space-y-0.5 font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                  {Object.entries(flow.p.verifiedPayload).slice(0, 6).map(([k, v]) => <li key={k}>{k} = {JSON.stringify(v)}</li>)}
                </ul>
              </Layer>
              <ArrowRight className="hidden self-center text-slate-400 lg:block" size={20} />
              <Layer n={2} name="Assentra" pkg="@assentra/server" token="tlm_ approval" tone="border-slate-200 dark:border-slate-800">
                {flow.tl ? (
                  <>
                    <p className="text-slate-600 dark:text-slate-300">Workflow <span className="font-mono">{flow.tl.workflowType}</span>: a human approves this payload.</p>
                    <pre className="max-h-40 overflow-auto rounded-md bg-slate-900 p-2 font-mono text-[10.5px] text-slate-100 dark:bg-slate-950">{JSON.stringify(flow.tl.workflow, null, 2)}</pre>
                  </>
                ) : <p className="text-slate-500">No Assentra workflow declared for this dossier.</p>}
              </Layer>
              <ArrowRight className="hidden self-center text-slate-400 lg:block" size={20} />
              <Layer n={3} name="Pactline" pkg="@pactline/core" token="vpt_ settlement" tone="border-slate-200 dark:border-slate-800">
                {flow.vp ? (
                  <>
                    <p className="text-slate-600 dark:text-slate-300">Telemetry for <span className="font-mono">{flow.vp.contractId}</span>:</p>
                    <pre className="max-h-40 overflow-auto rounded-md bg-slate-900 p-2 font-mono text-[10.5px] text-slate-100 dark:bg-slate-950">{JSON.stringify(flow.vp.values, null, 2)}</pre>
                  </>
                ) : <p className="text-slate-500">No Pactline contract declared for this dossier.</p>}
              </Layer>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Terminal size={16} />} title="SDK & CLI" subtitle="Snippets generated from the selected dossier" />
        <div className="p-4 sm:p-5">
          <Tabs value={tab} onChange={setTab} tabs={TABS} />
          <div className="relative mt-3">
            <Button variant="secondary" onClick={() => void copy()} className="absolute right-2 top-2 z-10" aria-label="Copy snippet">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</Button>
            <pre className="max-h-[460px] overflow-auto rounded-lg bg-slate-900 p-4 pt-12 font-mono text-[11.5px] leading-relaxed text-slate-100 dark:bg-slate-950">{snippets ? snippets[tab] : ""}</pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
