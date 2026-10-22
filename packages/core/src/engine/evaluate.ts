import type { ClaimValue, ProvenanceDossier } from "../schemas/dossier";
import { autoGroundClaims, evaluateDossierProvenance, type AutoGroundResult, type ProvenanceEvaluationResult } from "./compiler";

export interface EvaluateRequest {
  dossier: ProvenanceDossier;
  /** What-if: replace claimed values without editing the dossier. */
  claimOverrides?: Readonly<Record<string, ClaimValue>>;
  /** What-if: replace source content (e.g. simulate one corrupted byte) without editing the dossier. */
  sourceOverrides?: Readonly<Record<string, string>>;
  /** Rewrite hallucinated or drifted claims to the value in the primary source. */
  autoGround?: boolean;
}

export interface Evaluated {
  /** The dossier after overrides and (optionally) auto-grounding. */
  dossier: ProvenanceDossier;
  evaluation: ProvenanceEvaluationResult;
  /** Present when auto-grounding ran. */
  grounding: AutoGroundResult | null;
}

/** Applies what-if overrides to a copy of the dossier, evaluates it and optionally auto-grounds it. */
export async function evaluateRequest(req: EvaluateRequest): Promise<Evaluated> {
  let dossier: ProvenanceDossier = {
    ...req.dossier,
    claims: req.dossier.claims.map((c) => (req.claimOverrides && c.id in req.claimOverrides ? { ...c, claimedValue: req.claimOverrides[c.id] } : c)),
    sources: req.dossier.sources.map((s) => (req.sourceOverrides && s.id in req.sourceOverrides ? { ...s, content: req.sourceOverrides[s.id] } : s)),
  };
  let evaluation = await evaluateDossierProvenance(dossier);
  let grounding: AutoGroundResult | null = null;
  if (req.autoGround) {
    grounding = autoGroundClaims(dossier, evaluation);
    dossier = grounding.dossier;
    evaluation = await evaluateDossierProvenance(dossier);
  }
  return { dossier, evaluation, grounding };
}
