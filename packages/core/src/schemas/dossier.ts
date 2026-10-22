import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "lowercase letters, digits and _");
const ident = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/, "must start with a letter and use only letters, digits and _");
const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const SOURCE_TYPES = ["invoice_ledger", "prometheus_log", "signed_contract", "iam_snapshot", "bank_wire_feed"] as const;
export const CATEGORIES = ["FinOps", "SecOps", "SRE", "Procurement", "Sales"] as const;

export const PrimarySourceSchema = z
  .object({
    id: ident,
    title: z.string().min(1).max(160),
    sourceType: z.enum(SOURCE_TYPES),
    capturedAtIso: z.string().min(10).max(40),
    /** The immutable primary source, exactly as captured (text, JSON or log). */
    content: z.string().min(1).max(500_000),
    /** Optional pinned SHA-256 (hex). If the content later changes, EC-105 trips. */
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict();

export const CitationSchema = z
  .object({
    sourceId: ident,
    /** A verbatim span of the primary source this claim is anchored to. */
    excerpt: z.string().min(1).max(2000),
    /** Numeric claims within this percentage of the source value are TOLERANCE_DRIFT instead of hallucinated. */
    tolerancePct: z.number().min(0).max(100).optional(),
    required: z.boolean().default(true),
    /** Literal marker inside the excerpt; the value is read from the text right after it. */
    valueAfter: z.string().min(1).max(200).optional(),
    /** For string values: a literal that ends the value. Default end: `|`, `,`, `;` or a line break. */
    valueEnd: z.string().min(1).max(50).optional(),
  })
  .strict();

export const ClaimSchema = z
  .object({
    id: ident,
    label: z.string().min(1).max(120),
    /** The field this claim feeds in a Assentra workflow or Pactline pact, e.g. `amountUsd`. */
    fieldKey: ident,
    valueType: z.enum(["number", "string", "boolean"]),
    /** The value asserted by the AI summary, vendor proposal or report. */
    claimedValue: scalar,
    citation: CitationSchema,
  })
  .strict();

export const PolicySchema = z
  .object({
    minEpistemicScore: z.number().min(0).max(100).default(100),
    allowWithinTolerance: z.boolean().default(true),
    requireAllSourcesHashed: z.boolean().default(false),
  })
  .strict();

export const BridgeSchema = z
  .object({
    assentraWorkflowId: z.string().min(1).max(80).optional(),
    pactlineContractId: z.string().min(1).max(80).optional(),
    /** claimId → Assentra workflow field. */
    fieldMappings: z.record(z.string(), z.string()).default({}),
    /** claimId → Pactline telemetry field. Falls back to `fieldMappings` when omitted. */
    telemetryMappings: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const DossierSchema = z
  .object({
    id: slug,
    name: z.string().min(1).max(120),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    category: z.enum(CATEGORIES),
    description: z.string().max(600).default(""),
    targetBridge: BridgeSchema.default({ fieldMappings: {} }),
    sources: z.array(PrimarySourceSchema).min(1).max(40),
    claims: z.array(ClaimSchema).min(1).max(100),
    policies: PolicySchema.default({ minEpistemicScore: 100, allowWithinTolerance: true, requireAllSourcesHashed: false }),
  })
  .strict();

export type PrimarySource = z.infer<typeof PrimarySourceSchema>;
export type ClaimCitation = z.infer<typeof CitationSchema>;
export type ClaimAssertion = z.infer<typeof ClaimSchema>;
export type DossierPolicies = z.infer<typeof PolicySchema>;
export type DossierBridge = z.infer<typeof BridgeSchema>;
export type ProvenanceDossier = z.infer<typeof DossierSchema>;
export type ProvenanceDossierInput = z.input<typeof DossierSchema>;
export type ClaimValue = string | number | boolean;
