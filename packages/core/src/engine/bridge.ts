import { decodeEpistemicCertificate, type CertificatePayload } from "../crypto/epistemicSeal";
import type { ClaimValue } from "../schemas/dossier";

type Source = string | CertificatePayload;
const payloadOf = (s: Source): CertificatePayload => (typeof s === "string" ? decodeEpistemicCertificate(s).payload : s);

export interface AssentraBridge {
  /** A Assentra `WorkflowInstance`: `{ workflowType, ...fields }`, ready for `catalog.compile` or the approve webhook. */
  workflow: Record<string, ClaimValue> & { workflowType: string };
  workflowType: string;
  /** Claims that carried no mapping and were left out. */
  unmapped: string[];
}

export interface PactlineBridge {
  contractId: string;
  /** Numeric telemetry for `evaluatePactExecution` / `pactline meter --set`. */
  values: Record<string, number>;
  /** Verified claims that are not numeric or have no telemetry mapping. */
  skipped: string[];
}

/**
 * Injects verified evidence into a Assentra workflow payload. Only claims the certificate vouches for are used,
 * and the value is always the primary-source value, never the summary's.
 */
export function bridgeToAssentraPayload(cert: Source, opts: { workflowType?: string } = {}): AssentraBridge {
  const p = payloadOf(cert);
  const workflowType = opts.workflowType ?? p.bridge.assentraWorkflowId;
  if (!workflowType) throw new Error("No Assentra workflow: the dossier has no assentraWorkflowId and none was passed");
  const workflow: Record<string, ClaimValue> = { workflowType };
  const unmapped: string[] = [];
  for (const c of p.verifiedClaims) {
    const field = p.bridge.fieldMappings[c.claimId];
    if (field === undefined) unmapped.push(c.claimId);
    else workflow[field] = c.sourceValue;
  }
  return { workflow: workflow as AssentraBridge["workflow"], workflowType, unmapped };
}

/** Injects verified numbers as Pactline telemetry (`telemetryMappings`, falling back to `fieldMappings`). */
export function bridgeToPactlineTelemetry(cert: Source, opts: { contractId?: string } = {}): PactlineBridge {
  const p = payloadOf(cert);
  const contractId = opts.contractId ?? p.bridge.pactlineContractId;
  if (!contractId) throw new Error("No Pactline contract: the dossier has no pactlineContractId and none was passed");
  const map = p.bridge.telemetryMappings ?? p.bridge.fieldMappings;
  const values: Record<string, number> = {};
  const skipped: string[] = [];
  for (const c of p.verifiedClaims) {
    const field = map[c.claimId];
    if (field === undefined || typeof c.sourceValue !== "number") skipped.push(c.claimId);
    else values[field] = c.sourceValue;
  }
  return { contractId, values, skipped };
}
