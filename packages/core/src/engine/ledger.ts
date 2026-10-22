import { decodeEpistemicCertificate, verifyEpistemicCertificate, type EpistemicCertificate } from "../crypto/epistemicSeal";
import { sha256Hex } from "../crypto/keys";

export const GENESIS_HASH = "0".repeat(64);

export interface ProvenanceLedgerRecord {
  seq: number;
  timestampIso: string;
  certificateId: string;
  dossierId: string;
  gateStatus: string;
  epistemicScore: number;
  issuerFingerprint: string;
  claimCount: number;
  sourceCount: number;
  stateHashSha256: string;
  signatureHex: string;
  /** The full `epc_` token so any record can be re-verified offline. */
  token: string;
  prevHash: string;
  chainHash: string;
}

/** chainHash = SHA-256(prevHash | certificateId | dossierId | stateHashSha256 | signatureHex) */
export function computeChainHash(prevHash: string, certificateId: string, dossierId: string, stateHashSha256: string, signatureHex: string): Promise<string> {
  return sha256Hex([prevHash, certificateId, dossierId, stateHashSha256, signatureHex].join("|"));
}

export async function buildLedgerRecord(prev: ProvenanceLedgerRecord | undefined, cert: EpistemicCertificate, nowIso: string = new Date().toISOString()): Promise<ProvenanceLedgerRecord> {
  const prevHash = prev?.chainHash ?? GENESIS_HASH;
  const p = cert.payload;
  return {
    seq: (prev?.seq ?? 0) + 1,
    timestampIso: nowIso,
    certificateId: cert.certificateId,
    dossierId: p.dossierId,
    gateStatus: p.gateStatus,
    epistemicScore: p.epistemicScore,
    issuerFingerprint: p.issuerFingerprint,
    claimCount: p.verifiedClaims.length,
    sourceCount: Object.keys(p.sourceHashes).length,
    stateHashSha256: cert.stateHashSha256,
    signatureHex: cert.signatureHex,
    token: cert.token,
    prevHash,
    chainHash: await computeChainHash(prevHash, cert.certificateId, p.dossierId, cert.stateHashSha256, cert.signatureHex),
  };
}

export interface LedgerVerification {
  ok: boolean;
  count: number;
  firstBrokenSeq: number | null;
  reason: string;
  badCertificates: number[];
}

/** Checks sequence, linkage, each chain hash, that summary fields match the embedded certificate, and every signature. */
export async function verifyProvenanceLedger(records: readonly ProvenanceLedgerRecord[], opts: { verifyCertificates?: boolean } = {}): Promise<LedgerVerification> {
  let prev = GENESIS_HASH;
  const badCertificates: number[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const broken = (reason: string): LedgerVerification => ({ ok: false, count: records.length, firstBrokenSeq: r.seq, reason, badCertificates });
    if (r.seq !== i + 1) return broken(`Sequence gap at position ${i + 1}.`);
    if (r.prevHash !== prev) return broken(`Record ${r.seq} does not link to the previous record.`);
    if ((await computeChainHash(r.prevHash, r.certificateId, r.dossierId, r.stateHashSha256, r.signatureHex)) !== r.chainHash) return broken(`Record ${r.seq} chain hash was altered.`);
    if (opts.verifyCertificates !== false) {
      let good = false;
      try {
        const d = decodeEpistemicCertificate(r.token);
        const v = await verifyEpistemicCertificate(r.token);
        const p = d.payload;
        good = v.ok && v.certificateId === r.certificateId && r.dossierId === p.dossierId && r.gateStatus === p.gateStatus && r.epistemicScore === p.epistemicScore && r.issuerFingerprint === p.issuerFingerprint && r.claimCount === p.verifiedClaims.length && r.sourceCount === Object.keys(p.sourceHashes).length && (await sha256Hex(d.canonical)) === r.stateHashSha256 && d.signatureHex === r.signatureHex;
      } catch {
        good = false;
      }
      if (!good) badCertificates.push(r.seq);
    }
    prev = r.chainHash;
  }
  if (badCertificates.length) return { ok: false, count: records.length, firstBrokenSeq: badCertificates[0], reason: `Embedded certificate failed verification at record ${badCertificates[0]}.`, badCertificates };
  return { ok: true, count: records.length, firstBrokenSeq: null, reason: records.length ? `Chain intact across ${records.length} record(s).` : "Ledger is empty.", badCertificates };
}
