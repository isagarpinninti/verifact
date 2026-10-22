import {
  buildLedgerRecord,
  buildRegistry,
  evaluateRequest,
  generateEpistemicCertificate,
  verifyEpistemicCertificate,
  verifyProvenanceLedger,
  type CertificateVerification,
  type ClaimValue,
  type Evaluated,
  type KeyMaterial,
  type LedgerVerification,
  type ProvenanceDossier,
  type ProvenanceEvaluationResult,
  type ProvenanceLedgerRecord,
  type AutoGroundResult,
} from "@verifact/core";
import { loadOrCreateLocalKey } from "./keyVault";
import { createPersistedStore } from "./persisted";
import { api } from "./serverApi";

export interface EvaluateOptions {
  claimOverrides?: Record<string, ClaimValue>;
  sourceOverrides?: Record<string, string>;
  autoGround?: boolean;
}

export interface CertifyView {
  certificateId: string;
  token: string;
  record: ProvenanceLedgerRecord;
  evaluation: ProvenanceEvaluationResult;
  grounding: AutoGroundResult | null;
}

/** What the Studio needs from a verifier, whether it is the CLI server or the in-browser demo engine. */
export interface EvidenceClient {
  mode: "server" | "local";
  issuerFingerprint: string;
  keyPersistent: boolean;
  evaluate(dossier: ProvenanceDossier, opts?: EvaluateOptions): Promise<Evaluated>;
  certify(dossier: ProvenanceDossier, opts?: EvaluateOptions): Promise<CertifyView>;
  ledger(): Promise<ProvenanceLedgerRecord[]>;
  verifyLedger(): Promise<LedgerVerification>;
  verifyToken(token: string, sources?: Record<string, string>): Promise<CertificateVerification>;
  clearLedger?(): void;
}

/* ───────────────────────── server mode ───────────────────────── */

export function serverClient(fingerprint: string): EvidenceClient {
  return {
    mode: "server",
    issuerFingerprint: fingerprint,
    keyPersistent: true,
    evaluate: (dossier, opts) => api("/api/evaluate", { method: "POST", body: { dossier, ...opts } }),
    certify: (dossier, opts) => api("/api/certify", { method: "POST", body: { dossier, ...opts } }),
    ledger: async () => (await api<{ records: ProvenanceLedgerRecord[] }>("/api/ledger")).records,
    verifyLedger: () => api("/api/ledger/verify"),
    verifyToken: (token, sources) => (sources ? verifyEpistemicCertificate(token, { sources }) : api<CertificateVerification>("/api/verify", { method: "POST", body: { token } })),
  };
}

/* ───────────────────────── local demo mode ───────────────────────── */

interface LocalLedger {
  /** Oldest first. */
  records: ProvenanceLedgerRecord[];
}
export const localLedgerStore = createPersistedStore<LocalLedger>("verifact-ledger", { records: [] });

/** Everything runs in this browser with real Web Crypto. Not a security boundary. */
export async function localClient(): Promise<EvidenceClient> {
  const issuer = await loadOrCreateLocalKey("issuer");
  const key: KeyMaterial = issuer;
  const registry = await buildRegistry([issuer.publicKeyJwk]);
  return {
    mode: "local",
    issuerFingerprint: issuer.fingerprint,
    keyPersistent: issuer.persistent,
    evaluate: (dossier, opts) => evaluateRequest({ dossier, ...opts }),
    certify: async (dossier, opts) => {
      const e = await evaluateRequest({ dossier, ...opts });
      if (e.evaluation.gateStatus === "HALLUCINATION_BLOCKED") throw new Error(e.evaluation.checks.find((c) => c.severity === "block")?.message ?? "Blocked by the hallucination gate");
      const cert = await generateEpistemicCertificate({ dossier: e.dossier, evaluation: e.evaluation, issuerKey: key });
      const current = localLedgerStore.getSnapshot().records;
      const record = await buildLedgerRecord(current.at(-1), cert);
      localLedgerStore.set({ records: [...current, record] });
      return { certificateId: cert.certificateId, token: cert.token, record, evaluation: e.evaluation, grounding: e.grounding };
    },
    ledger: async () => [...localLedgerStore.getSnapshot().records].reverse(),
    verifyLedger: () => verifyProvenanceLedger(localLedgerStore.getSnapshot().records),
    verifyToken: (token, sources) => verifyEpistemicCertificate(token, { issuerRegistry: registry, sources }),
    clearLedger: () => localLedgerStore.set({ records: [] }),
  };
}
