import { describe, expect, it } from "vitest";
import {
  DOSSIER_PACKS,
  autoGroundClaims,
  buildLedgerRecord,
  bridgeToAssentraPayload,
  bridgeToPactlineTelemetry,
  buildRegistry,
  createSigningKey,
  decodeEpistemicCertificate,
  dossierFromMarkdown,
  evaluateDossierProvenance,
  generateEpistemicCertificate,
  getDossierPack,
  pinSources,
  resolveSourceSpan,
  tamperEpistemicCertificate,
  utf8Length,
  validateDossier,
  verifyEpistemicCertificate,
  verifyProvenanceLedger,
  type ClaimValue,
  type ProvenanceDossier,
  type ProvenanceLedgerRecord,
} from "../src";

const pack = (id: string): ProvenanceDossier => {
  const d = getDossierPack(id);
  if (!d) throw new Error(`missing pack ${id}`);
  return d;
};

const withClaim = (d: ProvenanceDossier, claimId: string, value: ClaimValue): ProvenanceDossier => ({ ...d, claims: d.claims.map((c) => (c.id === claimId ? { ...c, claimedValue: value } : c)) });

describe("packs", () => {
  it("ships five valid dossiers that evaluate as VERIFIED_GROUNDED with a 100 score", async () => {
    expect(DOSSIER_PACKS).toHaveLength(5);
    for (const d of DOSSIER_PACKS) {
      const v = validateDossier(d);
      expect(v, d.id).toMatchObject({ ok: true, errors: [] });
      const r = await evaluateDossierProvenance(await pinSources(d));
      expect(r.gateStatus, d.id).toBe("VERIFIED_GROUNDED");
      expect(r.epistemicScore).toBe(100);
      expect(Object.keys(r.verifiedPayload).length).toBe(d.claims.length);
    }
  });
  it("rejects unknown sources, duplicate ids and unmatched markers", () => {
    const base = pack("vendor_invoice_three_way_match");
    const bad = { ...base, claims: [...base.claims, { ...base.claims[0], citation: { ...base.claims[0].citation, sourceId: "nope" } }] };
    const r = validateDossier(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/declared more than once/);
    expect(r.errors.join(" ")).toMatch(/does not exist/);
  });
});

describe("byte spans", () => {
  it("reports exact UTF-8 byte offsets, not character offsets", () => {
    const content = "Preis: 5 € netto\nTotal: 62000";
    const s = resolveSourceSpan(content, "Total: 62000");
    expect(s.found).toBe(true);
    expect(s.startChar).toBe(content.indexOf("Total"));
    expect(s.startByte).toBe(s.startChar + 2); // "€" is 3 bytes, 1 char
    expect(s.endByte - s.startByte).toBe(utf8Length("Total: 62000"));
  });
  it("reports repeated excerpts instead of guessing", () => {
    expect(resolveSourceSpan("a=1\na=1", "a=1")).toMatchObject({ found: true, occurrences: 2, startChar: 0 });
    expect(resolveSourceSpan("abc", "zzz").found).toBe(false);
  });
});

describe("claim grounding (EC-101..106)", () => {
  it("EC-103: blocks a hallucinated $6,200 against a $62,000 invoice and releases no payload", async () => {
    const d = await pinSources(withClaim(pack("vendor_invoice_three_way_match"), "c_amount", 6200));
    const r = await evaluateDossierProvenance(d);
    const c = r.claimResults.find((x) => x.claimId === "c_amount");
    expect(c).toMatchObject({ status: "HALLUCINATED_VALUE", sourceValue: 62000, claimedValue: 6200 });
    expect(r.gateStatus).toBe("HALLUCINATION_BLOCKED");
    expect(r.epistemicScore).toBeLessThan(100);
    expect(r.checks.find((k) => k.code === "EC-103")?.severity).toBe("block");
    expect(r.verifiedPayload).toEqual({});
  });

  it("anchors claims to exact byte spans", async () => {
    const d = pack("vendor_invoice_three_way_match");
    const r = await evaluateDossierProvenance(d);
    const c = r.claimResults.find((x) => x.claimId === "c_amount");
    const src = d.sources.find((s) => s.id === "invoice");
    const bytes = new TextEncoder().encode(src?.content ?? "");
    expect(new TextDecoder().decode(bytes.slice(c?.span?.startByte, c?.span?.endByte))).toBe("Total Due: $62,000.00");
    expect(new TextDecoder().decode(bytes.slice(c?.valueSpan?.startByte, c?.valueSpan?.endByte))).toBe("$62,000.00");
  });

  it("EC-102: tolerance drift warns when allowed and blocks under zero-tolerance policy", async () => {
    const base = pack("vendor_invoice_three_way_match"); // c_uptime has tolerancePct 0.05
    const drift = withClaim(base, "c_uptime", 99.95);
    const warn = await evaluateDossierProvenance(drift);
    expect(warn.claimResults.find((c) => c.claimId === "c_uptime")?.status).toBe("TOLERANCE_DRIFT");
    expect(warn.gateStatus).toBe("DRIFT_WARNING");
    expect(warn.verifiedPayload.uptimePct).toBe(99.98); // the source value, never the summary's
    const strict = await evaluateDossierProvenance({ ...drift, policies: { ...drift.policies, allowWithinTolerance: false } });
    expect(strict.gateStatus).toBe("HALLUCINATION_BLOCKED");
  });

  it("EC-104: a fabricated quote is a broken citation", async () => {
    const d = pack("vendor_invoice_three_way_match");
    const forged = { ...d, claims: d.claims.map((c) => (c.id === "c_amount" ? { ...c, citation: { ...c.citation, excerpt: "Total Due: $6,200.00", valueAfter: "Total Due:" } } : c)) };
    const r = await evaluateDossierProvenance(forged);
    expect(r.claimResults.find((c) => c.claimId === "c_amount")?.status).toBe("BROKEN_CITATION_SPAN");
    expect(r.gateStatus).toBe("HALLUCINATION_BLOCKED");
  });

  it("EC-105: one changed byte in a pinned source blocks every claim that cites it", async () => {
    const pinned = await pinSources(pack("p1_incident_root_cause_telemetry"));
    const alerts = pinned.sources.find((s) => s.id === "alerts")?.content ?? "";
    const r = await evaluateDossierProvenance(pinned, { sourceOverrides: { alerts: alerts.replace('{service="checkout-api"} 5', '{service="checkout-api"} 2') } });
    expect(r.sourceResults.find((s) => s.sourceId === "alerts")?.hashOk).toBe(false);
    expect(r.claimResults.filter((c) => c.sourceId === "alerts").every((c) => c.status === "SOURCE_HASH_MISMATCH")).toBe(true);
    expect(r.gateStatus).toBe("HALLUCINATION_BLOCKED");
  });

  it("EC-106: the policy floor and unpinned sources are enforced", async () => {
    const d = pack("vendor_invoice_three_way_match");
    const r = await evaluateDossierProvenance({ ...d, policies: { ...d.policies, requireAllSourcesHashed: true } });
    expect(r.gateStatus).toBe("HALLUCINATION_BLOCKED");
    expect(r.checks.find((c) => c.code === "EC-106")?.message).toMatch(/Unpinned/);
  });

  it("a non-required claim never blocks and never reaches the payload", async () => {
    const d = withClaim(pack("vendor_invoice_three_way_match"), "c_po", 1);
    const soft = { ...d, claims: d.claims.map((c) => (c.id === "c_po" ? { ...c, citation: { ...c.citation, required: false } } : c)), policies: { ...d.policies, minEpistemicScore: 80 } };
    const r = await evaluateDossierProvenance(soft);
    expect(r.gateStatus).toBe("DRIFT_WARNING");
    expect("poAmountUsd" in r.verifiedPayload).toBe(false);
  });

  it("boolean and string claims are grounded or flagged the same way", async () => {
    const d = pack("soc2_security_audit_evidence");
    const r = await evaluateDossierProvenance(withClaim(withClaim(d, "c_yubikey", false), "c_role", "Admin"));
    expect(r.claimResults.find((c) => c.claimId === "c_yubikey")).toMatchObject({ status: "HALLUCINATED_VALUE", sourceValue: true });
    expect(r.claimResults.find((c) => c.claimId === "c_role")).toMatchObject({ status: "HALLUCINATED_VALUE", sourceValue: "PowerUser" });
  });
});

describe("auto-ground", () => {
  it("rewrites hallucinated and drifted values to the source bytes, and nothing else", async () => {
    const d = await pinSources(withClaim(withClaim(pack("vendor_invoice_three_way_match"), "c_amount", 6200), "c_uptime", 99.95));
    const bad = await evaluateDossierProvenance(d);
    const fixed = autoGroundClaims(d, bad);
    expect(fixed.changes.map((c) => [c.claimId, c.to])).toEqual([["c_amount", 62000], ["c_uptime", 99.98]]);
    const after = await evaluateDossierProvenance(fixed.dossier);
    expect(after.gateStatus).toBe("VERIFIED_GROUNDED");
    expect(after.epistemicScore).toBe(100);
  });
  it("refuses to guess when the span holds several values or the source itself changed", async () => {
    const d = pack("vendor_invoice_three_way_match");
    // Anchor to a line with two numbers and no marker.
    const ambiguous: ProvenanceDossier = { ...d, claims: d.claims.map((c) => (c.id === "c_amount" ? { ...c, claimedValue: 6200, citation: { sourceId: "invoice", excerpt: "Line 1: GPU rack hardware x4 ........ $60,500.00", required: true } } : c)) };
    const r = await evaluateDossierProvenance(ambiguous);
    const g = autoGroundClaims(ambiguous, r);
    expect(r.claimResults.find((c) => c.claimId === "c_amount")?.ambiguous).toBe(true);
    expect(g.skipped.find((s) => s.claimId === "c_amount")?.reason).toMatch(/several values/);
    expect(g.dossier.claims.find((c) => c.id === "c_amount")?.claimedValue).toBe(6200);
  });
});

describe("epc_ certificates", () => {
  it("seals, verifies offline, and exposes the certificate id format", async () => {
    const d = await pinSources(pack("vendor_invoice_three_way_match"));
    const ev = await evaluateDossierProvenance(d);
    const key = await createSigningKey();
    const cert = await generateEpistemicCertificate({ dossier: d, evaluation: ev, issuerKey: key.material });
    expect(cert.token.startsWith("epc_")).toBe(true);
    expect(cert.certificateId).toBe(`epc_${cert.stateHashSha256.slice(0, 8)}${cert.signatureHex.slice(0, 8)}`);
    const registry = await buildRegistry([key.material.publicKeyJwk]);
    expect(await verifyEpistemicCertificate(cert.token, { issuerRegistry: registry, sources: Object.fromEntries(d.sources.map((s) => [s.id, s.content])) })).toMatchObject({ ok: true, signature: true, issuerTrusted: true, consistent: true, sourcesMatch: true });
    expect((await verifyEpistemicCertificate(cert.token, { issuerRegistry: await buildRegistry([(await createSigningKey()).material.publicKeyJwk]) })).issuerTrusted).toBe(false);
  });

  it("refuses to seal a blocked dossier", async () => {
    const d = withClaim(pack("vendor_invoice_three_way_match"), "c_amount", 6200);
    const ev = await evaluateDossierProvenance(d);
    await expect(generateEpistemicCertificate({ dossier: d, evaluation: ev, issuerKey: (await createSigningKey()).material })).rejects.toThrow(/blocked/);
  });

  it("detects a post-seal hallucination and a corrupted source hash", async () => {
    const d = await pinSources(pack("vendor_invoice_three_way_match"));
    const cert = await generateEpistemicCertificate({ dossier: d, evaluation: await evaluateDossierProvenance(d), issuerKey: (await createSigningKey()).material });
    const lied = await verifyEpistemicCertificate(tamperEpistemicCertificate(cert.token, "inject-hallucination"));
    expect(lied.ok).toBe(false);
    expect(lied.signature).toBe(false);
    const corrupt = await verifyEpistemicCertificate(tamperEpistemicCertificate(cert.token, "corrupt-source-hash"));
    expect(corrupt.ok).toBe(false);
    expect(corrupt.signature).toBe(false);
  });

  it("re-hashing a modified source against the certificate fails", async () => {
    const d = await pinSources(pack("vendor_invoice_three_way_match"));
    const cert = await generateEpistemicCertificate({ dossier: d, evaluation: await evaluateDossierProvenance(d), issuerKey: (await createSigningKey()).material });
    const sources = Object.fromEntries(d.sources.map((s) => [s.id, s.content]));
    sources.invoice = sources.invoice.replace("62,000", "6,200");
    const v = await verifyEpistemicCertificate(cert.token, { sources });
    expect(v).toMatchObject({ ok: false, sourcesMatch: false, signature: true });
  });
});

describe("provenance ledger", () => {
  it("chains certificates and pinpoints the first altered record", async () => {
    const key = await createSigningKey();
    const records: ProvenanceLedgerRecord[] = [];
    for (const id of ["vendor_invoice_three_way_match", "gpu_cluster_quote_attestation", "saas_discount_arr_verification"]) {
      const d = await pinSources(pack(id));
      records.push(await buildLedgerRecord(records.at(-1), await generateEpistemicCertificate({ dossier: d, evaluation: await evaluateDossierProvenance(d), issuerKey: key.material })));
    }
    expect(await verifyProvenanceLedger(records)).toMatchObject({ ok: true, count: 3 });
    const edited = records.map((r) => ({ ...r }));
    edited[1] = { ...edited[1], epistemicScore: 12 };
    expect(await verifyProvenanceLedger(edited)).toMatchObject({ ok: false, firstBrokenSeq: 2 });
    const forged = records.map((r) => ({ ...r }));
    forged[0] = { ...forged[0], token: tamperEpistemicCertificate(forged[0].token) };
    expect((await verifyProvenanceLedger(forged)).ok).toBe(false);
    const relinked = records.map((r) => ({ ...r }));
    relinked[0] = { ...relinked[0], chainHash: "f".repeat(64) };
    expect((await verifyProvenanceLedger(relinked, { verifyCertificates: false })).firstBrokenSeq).toBe(1);
  });
});

describe("bridge helpers", () => {
  it("maps verified claims to a Assentra workflow and Pactline telemetry", async () => {
    const d = await pinSources(pack("vendor_invoice_three_way_match"));
    const cert = await generateEpistemicCertificate({ dossier: d, evaluation: await evaluateDossierProvenance(d), issuerKey: (await createSigningKey()).material });
    expect(bridgeToAssentraPayload(cert.token).workflow).toEqual({ workflowType: "vendor_payment", vendorName: "Globex Supplies", amountUsd: 62000, vendorRisk: "high", paymentMethod: "wire", threeWayMatch: true });
    expect(bridgeToAssentraPayload(cert.token).unmapped).toEqual(["c_po", "c_wires", "c_settle", "c_uptime"]);
    expect(bridgeToPactlineTelemetry(decodeEpistemicCertificate(cert.token).payload)).toEqual({ contractId: "fintech_wire_clearing_rail", values: { wires: 800, settlementSeconds: 90, uptimePct: 99.98 }, skipped: ["c_vendor", "c_amount", "c_po", "c_risk", "c_method", "c_match"] });
    expect(() => bridgeToPactlineTelemetry(cert.token, { contractId: undefined })).not.toThrow();
  });
});

describe("markdown importer", () => {
  const md = "# Q3 vendor summary\n\n### Source: Vendor invoice [invoice_ledger]\n\n```\nInvoice INV-7\nTotal Due: $4,200.00\nVendor: Initech\n```\n\n## Claims\n- Total Due: $4,200\n- Vendor: Initech\n- Rush fee: $90\n";
  it("anchors each claim to the first source line that mentions its label", async () => {
    const { dossier, notes } = dossierFromMarkdown(md);
    expect(dossier.claims.map((c) => [c.label, c.valueType, c.claimedValue])).toEqual([["Total Due", "number", 4200], ["Vendor", "string", "Initech"], ["Rush fee", "number", 90]]);
    const r = await evaluateDossierProvenance(dossier);
    expect(r.claimResults.map((c) => c.status)).toEqual(["EXACT_GROUNDED", "EXACT_GROUNDED", "BROKEN_CITATION_SPAN"]);
    expect(notes.join(" ")).toMatch(/Rush fee/);
  });
  it("rejects markdown without sources or claims", () => {
    expect(() => dossierFromMarkdown("# x\n## Claims\n- a: 1")).toThrow(/No sources/);
    expect(() => dossierFromMarkdown("### Source: s\n```\nx\n```\n")).toThrow(/No claims/);
  });
});

describe("Trust Trilogy: verifact → assentra → pactline", () => {
  it("blocks a $6,200 hallucination, grounds $62,000, then gets a human seal and a bilateral settlement", async () => {
    // ── Layer 1: Verifact
    const hallucinated = await pinSources(withClaim(pack("vendor_invoice_three_way_match"), "c_amount", 6200));
    const blocked = await evaluateDossierProvenance(hallucinated);
    expect(blocked.gateStatus).toBe("HALLUCINATION_BLOCKED");
    expect(blocked.checks.find((c) => c.code === "EC-103")?.severity).toBe("block");

    const grounded = autoGroundClaims(hallucinated, blocked);
    expect(grounded.changes).toEqual([expect.objectContaining({ claimId: "c_amount", from: 6200, to: 62000 })]);
    const clean = await evaluateDossierProvenance(grounded.dossier);
    expect(clean.gateStatus).toBe("VERIFIED_GROUNDED");
    const invoiceSpan = clean.claimResults.find((c) => c.claimId === "c_amount")?.span;
    expect(invoiceSpan && invoiceSpan.endByte > invoiceSpan.startByte).toBe(true);

    const epk = await createSigningKey();
    const epc = await generateEpistemicCertificate({ dossier: grounded.dossier, evaluation: clean, issuerKey: epk.material });
    expect((await verifyEpistemicCertificate(epc.token)).ok).toBe(true);

    // ── Layer 2: Assentra, with the real published package
    const tl = await import("@assentra/server");
    const bridge = bridgeToAssentraPayload(epc.token);
    expect(bridge.workflow.amountUsd).toBe(62000);
    const catalog = tl.defaultCatalog;
    const user = tl.PERSONAS.VP_Infrastructure;
    const asked = catalog.schema.parse({ ...bridge.workflow, dualControl: false });
    const staff = catalog.compile(asked, tl.PERSONAS.L5_Staff_Lead, {});
    expect(staff.workflow.dualControl).toBe(true); // SOX-14: payments over $50k auto-require dual control
    expect(staff.primitives.policyEscalationGate.executionAllowed).toBe(false); // $62k exceeds a $15k approval limit
    const spec = catalog.compile(asked, user, {});
    expect(spec.primitives.policyEscalationGate.executionAllowed).toBe(true); // the VP's authority covers it
    expect(spec.workflow.dualControl).toBe(true);
    expect(spec.cost.approvalSpendUsd).toBe(62000);
    const humanKeys = await tl.initializeSessionKeyPair();
    const seal = await tl.generateActionSeal(spec, user, "mode_b_webhook", humanKeys);
    expect(seal.downstreamAgentToken.startsWith("tlm_")).toBe(true);

    // ── Layer 3: Pactline, with the real published package
    const vp = await import("@pactline/core");
    const registry = await vp.buildRegistry([humanKeys.publicKeyJwk]);
    const buyer = await vp.verifyAssentraBearerToken(seal, { registry });
    expect(buyer).toMatchObject({ ok: true, state: "verified" });
    expect(buyer.authority?.authorizedCapUsd).toBe(62000);
    expect(buyer.authority?.scope).toBe("vendor_payment");

    const rail = vp.getPack(bridge.workflow.workflowType === "vendor_payment" ? "fintech_wire_clearing_rail" : "")!;
    const contract = { ...rail, policies: { ...rail.policies, requiredScope: "vendor_payment" } };
    const telemetry = bridgeToPactlineTelemetry(epc.token);
    expect(telemetry.contractId).toBe(rail.id);
    const now = Math.floor(Date.now() / 1000);
    const authority = { authorizedCapUsd: buyer.authority?.authorizedCapUsd ?? 0, scope: buyer.authority?.scope ?? "", expiresAtEpoch: buyer.authority?.expiresAtEpoch ?? 0, verified: true };
    const result = vp.evaluatePactExecution({ contract, values: telemetry.values, authority, nowEpoch: now });
    expect(result.circuitBreakerStatus).toBe("HEALTHY_CLEARED");
    expect(result.authorizedCapUsd).toBe(62000);
    const providerKey = await vp.createSigningKey();
    if (!buyer.authority) throw new Error("no authority");
    const pact = await vp.generateBilateralSettlementPact({ contract, authority: buyer.authority, telemetry: result.resolved, result, providerKey: providerKey.material });
    expect(pact.pact.startsWith("vpt_")).toBe(true);
    expect((await vp.verifyBilateralPact(pact.pact)).ok).toBe(true);
  });
});
