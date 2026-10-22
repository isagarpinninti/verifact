import { buildRegistry, evaluateRequest, generateEpistemicCertificate, type EpistemicCertificate, type Evaluated, type KeyMaterial, type KeyRegistry } from "@verifact/core";

export type { Evaluated };
import { loadOrCreateKey } from "./key";
import type { Project } from "./project";

export interface Context {
  project: Project;
  issuerKey: KeyMaterial;
}

export async function openContext(project: Project): Promise<Context> {
  return { project, issuerKey: await loadOrCreateKey(project.paths.issuerKey) };
}

/** This project's own issuer key plus any configured trusted issuers. */
export async function trustedIssuers(ctx: Context): Promise<KeyRegistry> {
  return buildRegistry([ctx.issuerKey.publicKeyJwk, ...(ctx.project.config.trustedIssuers as JsonWebKey[])]);
}

export const evaluate = evaluateRequest;

export function seal(ctx: Context, e: Evaluated): Promise<EpistemicCertificate> {
  return generateEpistemicCertificate({ dossier: e.dossier, evaluation: e.evaluation, issuerKey: ctx.issuerKey });
}
