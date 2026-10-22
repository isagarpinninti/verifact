"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Copy, FlaskConical, Handshake, RotateCcw, Stamp, XCircle } from "lucide-react";
import { bridgeToAssentraPayload, bridgeToPactlineTelemetry, decodeEpistemicCertificate, tamperEpistemicCertificate, verifyEpistemicCertificate, type CertificateVerification, type TamperMode } from "@verifact/core";
import { Badge, Button, Card, CardHeader } from "../ui";
import { cn } from "../utils";

export interface EpistemicSealInspectorProps {
  /** The `epc_` token, or `null` before anything is sealed. */
  token: string | null;
  /** Raw sources (id → content) to re-hash against the certificate. */
  sources?: Readonly<Record<string, string>>;
}

function Row({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null;
  return (
    <li className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", ok ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-400/25 dark:bg-emerald-400/[0.04]" : "border-rose-200 bg-rose-50/60 dark:border-rose-400/25 dark:bg-rose-400/[0.05]")}>
      {ok ? <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" /> : <XCircle size={15} className="text-rose-600 dark:text-rose-400" />}
      <span className="font-medium text-slate-800 dark:text-slate-100">{label}</span>
      <span className={cn("ml-auto font-mono text-[10px] uppercase", ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{ok ? "verified" : "failed"}</span>
    </li>
  );
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            });
          }}
          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:hover:text-white"
        >
          {done ? <Check size={11} /> : <Copy size={11} />} {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-100 dark:bg-slate-950">{text}</pre>
    </div>
  );
}

/** Verifies an `epc_` certificate offline, lets you tamper with it, and hands the verified evidence to Assentra and Pactline. */
export function EpistemicSealInspector({ token, sources }: EpistemicSealInspectorProps) {
  const [tampered, setTampered] = useState<{ source: string; value: string } | null>(null);
  const active = token === null ? null : tampered && tampered.source === token ? tampered.value : token;
  const [state, setState] = useState<{ key: string; v: CertificateVerification } | null>(null);

  useEffect(() => {
    if (active === null) return;
    let live = true;
    void verifyEpistemicCertificate(active, { sources }).then((v) => {
      if (live) setState({ key: active, v });
    });
    return () => {
      live = false;
    };
  }, [active, sources]);

  const v = state && state.key === active ? state.v : null;
  const decoded = useMemo(() => {
    if (!active) return null;
    try {
      return decodeEpistemicCertificate(active);
    } catch {
      return null;
    }
  }, [active]);
  const isTampered = tampered !== null && tampered.source === token;
  const tamper = (mode: TamperMode): void => {
    if (token) setTampered({ source: token, value: tamperEpistemicCertificate(token, mode) });
  };

  const handoff = useMemo(() => {
    if (!decoded || !v?.ok) return null;
    const p = decoded.payload;
    const out: { assentra?: string; pactline?: string; tlCmd?: string; vpCmd?: string } = {};
    try {
      if (p.bridge.assentraWorkflowId) {
        const b = bridgeToAssentraPayload(p);
        out.assentra = JSON.stringify(b.workflow, null, 2);
        out.tlCmd = `verifact bridge assentra ${p.dossierId} --json   # → assentra compile ${b.workflowType} --payload -`;
      }
      if (p.bridge.pactlineContractId) {
        const b = bridgeToPactlineTelemetry(p);
        out.pactline = JSON.stringify(b.values, null, 2);
        out.vpCmd = `pactline meter ${b.contractId} ${Object.entries(b.values).map(([k, x]) => `--set ${k}=${x}`).join(" ")} --token approval.receipt.json`;
      }
    } catch {
      /* bridge is optional */
    }
    return out;
  }, [decoded, v?.ok]);

  return (
    <Card>
      <CardHeader icon={<Stamp size={16} />} title="Epistemic Seal Inspector" subtitle="Offline verification of an epc_ certificate" right={token === null ? <Badge tone="slate">No certificate yet</Badge> : v ? <Badge tone={v.ok ? "emerald" : "rose"}>{v.ok ? "Authentic" : "Tampered"}</Badge> : <Badge tone="slate">Verifying…</Badge>} />
      <div className="space-y-4 p-4 sm:p-5">
        {token === null || !decoded ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Seal a grounded dossier to inspect its certificate here.</p>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Certificate</p>
              <p className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-white">{v?.certificateId || "…"}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {decoded.payload.dossierId} · score {decoded.payload.epistemicScore} · {decoded.payload.gateStatus} · {decoded.payload.verifiedClaims.length} certified claims
              </p>
            </div>
            <ul className="space-y-2" aria-label="Verification">
              <Row ok={v ? v.signature : null} label="Issuer ECDSA signature" />
              <Row ok={v ? v.canonicalRoundTrip : null} label="Canonical payload" />
              <Row ok={v ? v.consistent : null} label="Claims, payload and gate status agree" />
              <Row ok={v ? v.sourcesMatch : null} label="Sources re-hash to the certified SHA-256" />
            </ul>
            {v && !v.ok ? (
              <ul role="alert" className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/5 dark:text-rose-200">
                {v.reasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {isTampered ? (
                <Button variant="secondary" onClick={() => setTampered(null)}>
                  <RotateCcw size={14} /> Restore original
                </Button>
              ) : (
                <>
                  <Button variant="danger" onClick={() => tamper("inject-hallucination")}>
                    <FlaskConical size={14} /> Tamper: inject post-seal hallucination
                  </Button>
                  <Button variant="danger" onClick={() => tamper("corrupt-source-hash")}>
                    <FlaskConical size={14} /> Tamper: alter source SHA-256
                  </Button>
                </>
              )}
            </div>

            <details className="rounded-lg border border-slate-200 dark:border-slate-800" open={Boolean(v?.ok)}>
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Handshake size={13} /> Trilogy handoff
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
                {!handoff ? <p className="text-xs text-rose-600 dark:text-rose-400">A certificate that does not verify cannot feed Assentra or Pactline.</p> : null}
                {handoff?.assentra ? <CopyBlock title="Assentra workflow payload" text={`${handoff.assentra}\n${handoff.tlCmd ? `\n# ${handoff.tlCmd}` : ""}`} /> : null}
                {handoff?.pactline ? <CopyBlock title="Pactline telemetry" text={`${handoff.pactline}\n\n# ${handoff.vpCmd ?? ""}`} /> : null}
                {handoff && !handoff.assentra && !handoff.pactline ? <p className="text-xs text-slate-500">This dossier declares no Assentra workflow or Pactline contract.</p> : null}
              </div>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
