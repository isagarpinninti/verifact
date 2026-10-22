import type { ClaimAssertion, ClaimValue, ProvenanceDossier } from "../schemas/dossier";
import { driftPct, extractGroundValue, resolveSourceSpan, sha256OfSource, utf8Length, valuesEqual, type ByteSpan } from "./spanMatcher";

export type ClaimStatus = "EXACT_GROUNDED" | "TOLERANCE_DRIFT" | "HALLUCINATED_VALUE" | "BROKEN_CITATION_SPAN" | "SOURCE_HASH_MISMATCH";
export type GateStatus = "VERIFIED_GROUNDED" | "DRIFT_WARNING" | "HALLUCINATION_BLOCKED";
export type CheckCode = "EC-101" | "EC-102" | "EC-103" | "EC-104" | "EC-105" | "EC-106";

export interface ProvenanceCheck {
  code: CheckCode;
  severity: "ok" | "warn" | "block";
  message: string;
}

export interface ClaimResult {
  claimId: string;
  label: string;
  fieldKey: string;
  valueType: "number" | "string" | "boolean";
  sourceId: string;
  required: boolean;
  claimedValue: ClaimValue;
  /** Ground truth read from the primary source bytes; null when the span cannot ground the claim. */
  sourceValue: ClaimValue | null;
  status: ClaimStatus;
  /** Where the cited excerpt sits in the source (null when the excerpt does not exist). */
  span: ByteSpan | null;
  /** Where the value itself sits inside the source, for highlighting. */
  valueSpan: ByteSpan | null;
  /** The excerpt contains several candidate values and nothing pinned the choice. */
  ambiguous: boolean;
  driftPct: number | null;
  detail: string;
}

export interface SourceResult {
  sourceId: string;
  title: string;
  bytes: number;
  sha256: string;
  expectedSha256: string | null;
  /** True when pinned and matching, or when not pinned. */
  hashOk: boolean;
  pinned: boolean;
}

export interface ProvenanceEvaluationResult {
  dossierId: string;
  epistemicScore: number;
  gateStatus: GateStatus;
  claimResults: ClaimResult[];
  sourceResults: SourceResult[];
  checks: ProvenanceCheck[];
  /** `{ fieldKey: groundedValue }`. Empty when the gate is blocked, so a blocked dossier can never feed a downstream layer. */
  verifiedPayload: Record<string, ClaimValue>;
}

export interface EvaluateOptions {
  /** Replace claimed values without editing the dossier (what-if / simulation). */
  claimOverrides?: Readonly<Record<string, ClaimValue>>;
  /** Replace source content without editing the dossier (e.g. simulate a corrupted byte). */
  sourceOverrides?: Readonly<Record<string, string>>;
}

const BLOCKING: ReadonlySet<ClaimStatus> = new Set(["HALLUCINATED_VALUE", "BROKEN_CITATION_SPAN", "SOURCE_HASH_MISMATCH"]);

const fmt = (v: ClaimValue | null): string => (v === null ? "—" : typeof v === "string" ? `"${v}"` : String(v));

function coerce(claim: ClaimAssertion, raw: ClaimValue): ClaimValue {
  if (claim.valueType === "number") return typeof raw === "number" ? raw : Number(raw);
  if (claim.valueType === "boolean") return typeof raw === "boolean" ? raw : raw === "true";
  return String(raw);
}

/** Computes the SHA-256 of every source and pins it, so later edits are detected as EC-105. */
export async function pinSources(dossier: ProvenanceDossier): Promise<ProvenanceDossier> {
  return { ...dossier, sources: await Promise.all(dossier.sources.map(async (s) => ({ ...s, expectedSha256: await sha256OfSource(s.content) }))) };
}

/**
 * Evaluates every claim against the exact bytes of its primary source. Deterministic: same dossier, same result.
 * EC-101 grounded · EC-102 tolerance drift · EC-103 hallucinated · EC-104 broken citation · EC-105 source hash · EC-106 policy.
 */
export async function evaluateDossierProvenance(dossier: ProvenanceDossier, opts: EvaluateOptions = {}): Promise<ProvenanceEvaluationResult> {
  const sources = new Map(dossier.sources.map((s) => [s.id, { ...s, content: opts.sourceOverrides?.[s.id] ?? s.content }]));
  const sourceResults: SourceResult[] = [];
  for (const s of sources.values()) {
    const sha = await sha256OfSource(s.content);
    sourceResults.push({ sourceId: s.id, title: s.title, bytes: utf8Length(s.content), sha256: sha, expectedSha256: s.expectedSha256 ?? null, hashOk: s.expectedSha256 === undefined || s.expectedSha256 === sha, pinned: s.expectedSha256 !== undefined });
  }
  const hashOk = new Map(sourceResults.map((r) => [r.sourceId, r.hashOk]));

  const claimResults: ClaimResult[] = dossier.claims.map((claim) => {
    const claimed = coerce(claim, opts.claimOverrides?.[claim.id] ?? claim.claimedValue);
    const base = { claimId: claim.id, label: claim.label, fieldKey: claim.fieldKey, valueType: claim.valueType, sourceId: claim.citation.sourceId, required: claim.citation.required, claimedValue: claimed };
    const miss = (status: ClaimStatus, detail: string): ClaimResult => ({ ...base, sourceValue: null, status, span: null, valueSpan: null, ambiguous: false, driftPct: null, detail });
    const src = sources.get(claim.citation.sourceId);
    if (!src) return miss("BROKEN_CITATION_SPAN", `Source '${claim.citation.sourceId}' does not exist.`);
    if (hashOk.get(src.id) === false) return miss("SOURCE_HASH_MISMATCH", `Source '${src.id}' changed after capture: its SHA-256 no longer matches the pinned digest.`);
    const span = resolveSourceSpan(src.content, claim.citation.excerpt);
    if (!span.found) return miss("BROKEN_CITATION_SPAN", "The cited excerpt does not exist in the primary source (fabricated or altered quote).");
    const g = extractGroundValue(claim.citation.excerpt, claim.valueType, claim.citation, claimed);
    const absStart = span.startChar + g.start;
    const absEnd = span.startChar + g.end;
    const startByte = utf8Length(src.content.slice(0, absStart));
    const valueSpan: ByteSpan | null = g.value === null ? null : { startChar: absStart, endChar: absEnd, startByte, endByte: startByte + utf8Length(src.content.slice(absStart, absEnd)) };
    const common = { ...base, span: { startChar: span.startChar, endChar: span.endChar, startByte: span.startByte, endByte: span.endByte }, valueSpan, ambiguous: g.ambiguous };
    if (g.markerMissing) return { ...common, sourceValue: null, status: "BROKEN_CITATION_SPAN", span: common.span, driftPct: null, detail: `The marker '${claim.citation.valueAfter ?? ""}' is not inside the cited excerpt.` };
    if (g.value === null) return { ...common, sourceValue: null, status: "HALLUCINATED_VALUE", driftPct: null, detail: "The cited span contains no value that can ground this claim." };
    if (valuesEqual(claim.valueType, claimed, g.value)) return { ...common, sourceValue: g.value, status: "EXACT_GROUNDED", driftPct: 0, detail: `Claimed ${fmt(claimed)} appears verbatim in bytes ${span.startByte}..${span.endByte}.` };
    if (claim.valueType === "number" && claim.citation.tolerancePct !== undefined && !g.ambiguous) {
      const d = driftPct(Number(claimed), Number(g.value));
      if (d <= claim.citation.tolerancePct) return { ...common, sourceValue: g.value, status: "TOLERANCE_DRIFT", driftPct: Math.round(d * 1000) / 1000, detail: `Claimed ${fmt(claimed)} differs from the source ${fmt(g.value)} by ${d.toFixed(2)}% (tolerance ${claim.citation.tolerancePct}%).` };
    }
    const d = claim.valueType === "number" ? driftPct(Number(claimed), Number(g.value)) : null;
    return { ...common, sourceValue: g.value, status: "HALLUCINATED_VALUE", driftPct: d === null ? null : Math.round(d * 1000) / 1000, detail: `The summary claims ${fmt(claimed)} but the primary source says ${fmt(g.value)}${g.ambiguous ? " (nearest of several values in the span)" : ""}.` };
  });

  const policy = dossier.policies;
  const count = (s: ClaimStatus): ClaimResult[] => claimResults.filter((c) => c.status === s);
  const exact = count("EXACT_GROUNDED");
  const drift = count("TOLERANCE_DRIFT");
  const reqBlock = (s: ClaimStatus): ClaimResult[] => count(s).filter((c) => c.required);
  const names = (list: ClaimResult[]): string => list.map((c) => c.label).join(", ");

  const checks: ProvenanceCheck[] = [];
  checks.push({ code: "EC-101", severity: "ok", message: `${exact.length} of ${claimResults.length} claims are grounded verbatim in primary-source bytes.` });
  checks.push(drift.length === 0 ? { code: "EC-102", severity: "ok", message: "No claim drifts from its source." } : { code: "EC-102", severity: policy.allowWithinTolerance ? "warn" : "block", message: `${drift.length} claim(s) drift within tolerance: ${names(drift)}.${policy.allowWithinTolerance ? "" : " Policy is zero-tolerance."}` });
  const hall = count("HALLUCINATED_VALUE");
  checks.push(hall.length === 0 ? { code: "EC-103", severity: "ok", message: "No hallucinated values." } : { code: "EC-103", severity: reqBlock("HALLUCINATED_VALUE").length ? "block" : "warn", message: `Hallucinated value in: ${names(hall)}.` });
  const broken = count("BROKEN_CITATION_SPAN");
  checks.push(broken.length === 0 ? { code: "EC-104", severity: "ok", message: "Every cited excerpt exists in its source." } : { code: "EC-104", severity: reqBlock("BROKEN_CITATION_SPAN").length ? "block" : "warn", message: `Broken citation span for: ${names(broken)}.` });
  const badHash = sourceResults.filter((r) => !r.hashOk);
  checks.push(badHash.length === 0 ? { code: "EC-105", severity: "ok", message: "Every pinned source still matches its SHA-256." } : { code: "EC-105", severity: "block", message: `Source changed after capture: ${badHash.map((r) => r.title).join(", ")}.` });

  // Score: grounded = 1, tolerated drift = 1 when policy allows it (it still raises a warning), everything else 0.
  const weight = (c: ClaimResult): number => (c.status === "EXACT_GROUNDED" ? 1 : c.status === "TOLERANCE_DRIFT" && policy.allowWithinTolerance ? 1 : 0);
  const epistemicScore = Math.round((100 * claimResults.reduce((n, c) => n + weight(c), 0)) / claimResults.length);
  const unpinned = sourceResults.filter((r) => !r.pinned);
  const policyIssues: string[] = [];
  if (epistemicScore < policy.minEpistemicScore) policyIssues.push(`Epistemic score ${epistemicScore} is below the required ${policy.minEpistemicScore}.`);
  if (policy.requireAllSourcesHashed && unpinned.length) policyIssues.push(`Unpinned source(s): ${unpinned.map((r) => r.title).join(", ")}.`);
  checks.push(policyIssues.length === 0 ? { code: "EC-106", severity: "ok", message: `Policy satisfied (score ${epistemicScore} ≥ ${policy.minEpistemicScore}).` } : { code: "EC-106", severity: "block", message: policyIssues.join(" ") });

  const blocked = checks.some((c) => c.severity === "block");
  const gateStatus: GateStatus = blocked ? "HALLUCINATION_BLOCKED" : drift.length > 0 || checks.some((c) => c.severity === "warn" && c.code !== "EC-102") ? "DRIFT_WARNING" : "VERIFIED_GROUNDED";

  const verifiedPayload: Record<string, ClaimValue> = {};
  if (!blocked) for (const c of claimResults) if (!BLOCKING.has(c.status) && c.sourceValue !== null) verifiedPayload[c.fieldKey] = c.sourceValue;
  return { dossierId: dossier.id, epistemicScore, gateStatus, claimResults, sourceResults, checks, verifiedPayload };
}

export interface AutoGroundResult {
  dossier: ProvenanceDossier;
  changes: Array<{ claimId: string; label: string; from: ClaimValue; to: ClaimValue }>;
  skipped: Array<{ claimId: string; label: string; reason: string }>;
}

/**
 * Rewrites hallucinated or drifted claim values to the value parsed from the cited primary-source bytes.
 * Never invents anything: claims with a broken citation, a changed source, no groundable value or an
 * ambiguous span are left alone and reported.
 */
export function autoGroundClaims(dossier: ProvenanceDossier, evaluation: ProvenanceEvaluationResult): AutoGroundResult {
  const changes: AutoGroundResult["changes"] = [];
  const skipped: AutoGroundResult["skipped"] = [];
  const next = new Map<string, ClaimValue>();
  for (const r of evaluation.claimResults) {
    if (r.status === "EXACT_GROUNDED") continue;
    if (r.status !== "HALLUCINATED_VALUE" && r.status !== "TOLERANCE_DRIFT") {
      skipped.push({ claimId: r.claimId, label: r.label, reason: r.status === "SOURCE_HASH_MISMATCH" ? "The source itself changed; restore it instead." : "The citation does not exist; fix the excerpt instead." });
    } else if (r.sourceValue === null) skipped.push({ claimId: r.claimId, label: r.label, reason: "The cited span holds no value to ground against." });
    else if (r.ambiguous) skipped.push({ claimId: r.claimId, label: r.label, reason: "The span holds several values; set a 'valueAfter' marker to pin which one." });
    else {
      next.set(r.claimId, r.sourceValue);
      changes.push({ claimId: r.claimId, label: r.label, from: r.claimedValue, to: r.sourceValue });
    }
  }
  return { dossier: { ...dossier, claims: dossier.claims.map((c) => (next.has(c.id) ? { ...c, claimedValue: next.get(c.id) as ClaimValue } : c)) }, changes, skipped };
}
