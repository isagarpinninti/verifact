import type { ClaimStatus, GateStatus, ProvenanceEvaluationResult } from "../engine/compiler";
import { sha256OfSource } from "../engine/spanMatcher";
import type { ClaimValue, ProvenanceDossier } from "../schemas/dossier";
import { base64UrlToBytes, bytesToBase64Url, bytesToHex, fromUtf8, hexToBytes, utf8 } from "../util/encoding";
import { canonicalize, type JsonValue } from "./canonical";
import { fingerprintJwk, importPublicKeyJwk, sha256Hex, signBytes, verifySignature, type KeyMaterial, type KeyRegistry } from "./keys";

export const CERT_PREFIX = "epc_";

export interface CertifiedClaim {
  claimId: string;
  label: string;
  fieldKey: string;
  claimedValue: ClaimValue;
  sourceValue: ClaimValue;
  status: ClaimStatus;
  sourceId: string;
  startByte: number;
  endByte: number;
}

export interface CertificateBridge {
  assentraWorkflowId?: string;
  pactlineContractId?: string;
  fieldMappings: Record<string, string>;
  telemetryMappings?: Record<string, string>;
}

export interface CertificatePayload {
  v: 1;
  dossierId: string;
  dossierVersion: string;
  /** SHA-256 of the canonical dossier (claims, citations, policies) that was evaluated. */
  dossierHash: string;
  sourceHashes: Record<string, string>;
  verifiedClaims: CertifiedClaim[];
  verifiedPayload: Record<string, ClaimValue>;
  bridge: CertificateBridge;
  epistemicScore: number;
  gateStatus: GateStatus;
  issuedAtIso: string;
  issuerFingerprint: string;
  issuerPublicKeyJwk: JsonWebKey;
  nonce: string;
}

export interface EpistemicCertificate {
  token: string;
  certificateId: string;
  stateHashSha256: string;
  signatureHex: string;
  payload: CertificatePayload;
}

export async function hashDossier(dossier: ProvenanceDossier): Promise<string> {
  // Contents are bound through sourceHashes; the dossier hash binds claims, citations, bridge and policies.
  const { sources, ...rest } = dossier;
  return sha256Hex(canonicalize({ ...rest, sources: sources.map((s) => ({ id: s.id, title: s.title, sourceType: s.sourceType, capturedAtIso: s.capturedAtIso })) } as unknown as JsonValue));
}

export interface GenerateCertificateInput {
  dossier: ProvenanceDossier;
  evaluation: ProvenanceEvaluationResult;
  issuerKey: KeyMaterial;
  nowIso?: string;
}

/** Seals a verified evaluation. A blocked dossier is never sealed: there is nothing true to certify. */
export async function generateEpistemicCertificate(input: GenerateCertificateInput): Promise<EpistemicCertificate> {
  const { dossier, evaluation, issuerKey } = input;
  if (evaluation.gateStatus === "HALLUCINATION_BLOCKED") throw new Error("Cannot seal a dossier that the hallucination gate blocked");
  const verifiedClaims: CertifiedClaim[] = evaluation.claimResults
    .filter((c) => c.sourceValue !== null && c.span !== null && (c.status === "EXACT_GROUNDED" || c.status === "TOLERANCE_DRIFT"))
    .map((c) => ({ claimId: c.claimId, label: c.label, fieldKey: c.fieldKey, claimedValue: c.claimedValue, sourceValue: c.sourceValue as ClaimValue, status: c.status, sourceId: c.sourceId, startByte: c.span?.startByte ?? 0, endByte: c.span?.endByte ?? 0 }));
  const b = dossier.targetBridge;
  const payload: CertificatePayload = {
    v: 1,
    dossierId: dossier.id,
    dossierVersion: dossier.version,
    dossierHash: await hashDossier(dossier),
    sourceHashes: Object.fromEntries(evaluation.sourceResults.map((s) => [s.sourceId, s.sha256])),
    verifiedClaims,
    verifiedPayload: evaluation.verifiedPayload,
    bridge: { ...(b.assentraWorkflowId ? { assentraWorkflowId: b.assentraWorkflowId } : {}), ...(b.pactlineContractId ? { pactlineContractId: b.pactlineContractId } : {}), fieldMappings: b.fieldMappings, ...(b.telemetryMappings ? { telemetryMappings: b.telemetryMappings } : {}) },
    epistemicScore: evaluation.epistemicScore,
    gateStatus: evaluation.gateStatus,
    issuedAtIso: input.nowIso ?? new Date().toISOString(),
    issuerFingerprint: issuerKey.fingerprint,
    issuerPublicKeyJwk: issuerKey.publicKeyJwk,
    nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(8))),
  };
  const canonical = canonicalize(payload as unknown as JsonValue);
  const stateHashSha256 = await sha256Hex(canonical);
  const signature = await signBytes(issuerKey, canonical);
  const signatureHex = bytesToHex(signature);
  return { token: `${CERT_PREFIX}${bytesToBase64Url(utf8(canonical))}.${bytesToBase64Url(signature)}`, certificateId: `${CERT_PREFIX}${stateHashSha256.slice(0, 8)}${signatureHex.slice(0, 8)}`, stateHashSha256, signatureHex, payload };
}

export interface DecodedCertificate {
  payload: CertificatePayload;
  canonical: string;
  signatureHex: string;
}

export function decodeEpistemicCertificate(token: string): DecodedCertificate {
  if (!token.startsWith(CERT_PREFIX)) throw new Error("Not an epc_ certificate");
  const [p, s, extra] = token.slice(CERT_PREFIX.length).split(".");
  if (!p || !s || extra !== undefined) throw new Error("Malformed certificate: expected epc_<payload>.<signature>");
  const canonical = fromUtf8(base64UrlToBytes(p));
  const payload = JSON.parse(canonical) as CertificatePayload;
  if (payload?.v !== 1 || typeof payload.dossierId !== "string" || !Array.isArray(payload.verifiedClaims) || typeof payload.sourceHashes !== "object" || payload.sourceHashes === null) throw new Error("Certificate payload is not an Verifact provenance certificate");
  return { payload, canonical, signatureHex: bytesToHex(base64UrlToBytes(s)) };
}

export interface CertificateVerification {
  ok: boolean;
  certificateId: string;
  signature: boolean;
  issuerTrusted: boolean;
  canonicalRoundTrip: boolean;
  /** The certified claims, payload, status and score agree with each other. */
  consistent: boolean;
  /** When sources were supplied: their SHA-256 digests equal the certified ones. */
  sourcesMatch: boolean | null;
  reasons: string[];
}

export interface VerifyCertificateOptions {
  /** Pin the issuer: only these keys count as `issuerTrusted`. */
  issuerRegistry?: KeyRegistry;
  /** Raw primary sources (id → content) to re-hash against the certified digests. */
  sources?: Readonly<Record<string, string>>;
}

const sameValue = (a: ClaimValue, b: ClaimValue): boolean => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) : a === b);

/** Verifies an `epc_` certificate offline: signature, canonical form, internal consistency and (optionally) the sources. */
export async function verifyEpistemicCertificate(token: string, opts: VerifyCertificateOptions = {}): Promise<CertificateVerification> {
  const fail = (reason: string): CertificateVerification => ({ ok: false, certificateId: "", signature: false, issuerTrusted: false, canonicalRoundTrip: false, consistent: false, sourcesMatch: null, reasons: [reason] });
  let d: DecodedCertificate;
  try {
    d = decodeEpistemicCertificate(token);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unreadable certificate");
  }
  const { payload, canonical, signatureHex } = d;
  const reasons: string[] = [];
  const stateHash = await sha256Hex(canonical);
  const certificateId = `${CERT_PREFIX}${stateHash.slice(0, 8)}${signatureHex.slice(0, 8)}`;
  const canonicalRoundTrip = canonicalize(payload as unknown as JsonValue) === canonical;
  if (!canonicalRoundTrip) reasons.push("Certificate payload is not in canonical form.");

  let signature = false;
  try {
    signature = (await fingerprintJwk(payload.issuerPublicKeyJwk)) === payload.issuerFingerprint && (await verifySignature(await importPublicKeyJwk(payload.issuerPublicKeyJwk), signatureHex, canonical));
  } catch {
    signature = false;
  }
  if (!signature) reasons.push("Issuer signature does not verify: the certificate was altered after signing.");
  const issuerTrusted = signature && opts.issuerRegistry !== undefined && Boolean(opts.issuerRegistry[payload.issuerFingerprint]);

  let consistent = true;
  if (payload.gateStatus === "HALLUCINATION_BLOCKED") {
    consistent = false;
    reasons.push("The certified gate status is HALLUCINATION_BLOCKED.");
  }
  const claimsOk = payload.verifiedClaims.every((c) => (c.status === "EXACT_GROUNDED" || c.status === "TOLERANCE_DRIFT") && sameValue(c.sourceValue, payload.verifiedPayload[c.fieldKey] as ClaimValue));
  if (!claimsOk) {
    consistent = false;
    reasons.push("A certified claim is not grounded, or the verified payload differs from the source values.");
  }
  if (Object.keys(payload.verifiedPayload).length !== new Set(payload.verifiedClaims.map((c) => c.fieldKey)).size) {
    consistent = false;
    reasons.push("The verified payload contains a field that no certified claim supports.");
  }
  const unknownSource = payload.verifiedClaims.find((c) => !(c.sourceId in payload.sourceHashes));
  if (unknownSource) {
    consistent = false;
    reasons.push(`Claim '${unknownSource.claimId}' cites a source with no certified hash.`);
  }

  let sourcesMatch: boolean | null = null;
  if (opts.sources) {
    sourcesMatch = true;
    for (const [id, sha] of Object.entries(payload.sourceHashes)) {
      const content = opts.sources[id];
      if (content === undefined || (await sha256OfSource(content)) !== sha) {
        sourcesMatch = false;
        reasons.push(`Source '${id}' does not match its certified SHA-256.`);
      }
    }
  }
  return { ok: signature && canonicalRoundTrip && consistent && sourcesMatch !== false, certificateId, signature, issuerTrusted, canonicalRoundTrip, consistent, sourcesMatch, reasons };
}

export type TamperMode = "inject-hallucination" | "corrupt-source-hash";

/**
 * Simulation helper: alters a certificate after signing and keeps the old signature.
 * `inject-hallucination` multiplies the first verified number (or flips the first string) in the claim AND the payload;
 * `corrupt-source-hash` flips one hex digit of the first source digest.
 */
export function tamperEpistemicCertificate(token: string, mode: TamperMode = "inject-hallucination"): string {
  const d = decodeEpistemicCertificate(token);
  const p = structuredClone(d.payload);
  if (mode === "corrupt-source-hash") {
    const id = Object.keys(p.sourceHashes)[0];
    if (id !== undefined) {
      const h = p.sourceHashes[id];
      p.sourceHashes[id] = (h[0] === "0" ? "1" : "0") + h.slice(1);
    }
  } else {
    const c = p.verifiedClaims.find((x) => typeof x.sourceValue === "number") ?? p.verifiedClaims[0];
    if (c) {
      const forged: ClaimValue = typeof c.sourceValue === "number" ? Math.round(c.sourceValue / 10) : typeof c.sourceValue === "boolean" ? !c.sourceValue : `${c.sourceValue}-FORGED`;
      c.claimedValue = forged;
      c.sourceValue = forged;
      p.verifiedPayload[c.fieldKey] = forged;
    }
  }
  return `${CERT_PREFIX}${bytesToBase64Url(utf8(canonicalize(p as unknown as JsonValue)))}.${bytesToBase64Url(hexToBytes(d.signatureHex))}`;
}
