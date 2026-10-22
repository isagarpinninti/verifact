/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON fixtures in integration tests */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run, startServer, type RunningServer } from "../src";
import type { Io } from "../src/ui";

function capture(stdin = ""): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t), color: false, stdin: async () => stdin }, out, err };
}

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verifact-test-"));
  expect(await run(["init", dir, "--name", "test-project"], capture().io)).toBe(0);
  return dir;
}

const open: RunningServer[] = [];
afterEach(async () => {
  while (open.length) await open.pop()?.close();
});

async function serve(dir: string, apiKey?: string): Promise<RunningServer> {
  const s = await startServer({ dir, port: 0, apiKey });
  open.push(s);
  return s;
}

async function api(base: string, path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<{ status: number; json: Record<string, any> }> {
  const res = await fetch(`${base}${path}`, { method: init.method ?? "GET", headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const INVOICE = "vendor_invoice_three_way_match";

describe("project commands", () => {
  it("init scaffolds pinned dossiers and validate passes", async () => {
    const dir = await project();
    const c = capture();
    expect(await run(["validate", dir, "--json"], c.io)).toBe(0);
    expect(JSON.parse(c.out.join("")).dossiers).toHaveLength(5);
    const d = JSON.parse(await readFile(join(dir, "dossiers", `${INVOICE}.json`), "utf8"));
    expect(d.sources.every((s: { expectedSha256?: string }) => /^[0-9a-f]{64}$/.test(s.expectedSha256 ?? ""))).toBe(true);
  });

  it("validate fails listing every problem", async () => {
    const dir = await project();
    const file = join(dir, "dossiers", `${INVOICE}.json`);
    const d = JSON.parse(await readFile(file, "utf8"));
    d.claims[0].citation.sourceId = "ghost";
    await writeFile(file, JSON.stringify(d));
    await writeFile(join(dir, "dossiers", "broken.json"), "{ not json");
    const c = capture();
    expect(await run(["validate", dir], c.io)).toBe(1);
    expect(c.err.join("\n")).toContain("ghost");
    expect(c.err.join("\n")).toContain("broken.json");
  });

  it("refuses to overwrite an existing project without --force", async () => {
    const dir = await project();
    expect(await run(["init", dir], capture().io)).toBe(1);
    expect(await run(["init", dir, "--force"], capture().io)).toBe(0);
  });
});

describe("verify / certify", () => {
  it("exits 0 when grounded and 2 when a hallucination is blocked, then auto-grounds it", async () => {
    const dir = await project();
    const ok = capture();
    expect(await run(["verify", INVOICE, "--dir", dir], ok.io)).toBe(0);
    expect(ok.out.join("\n")).toContain("VERIFIED_GROUNDED");

    const bad = capture();
    expect(await run(["verify", INVOICE, "--dir", dir, "--set", "c_amount=6200"], bad.io)).toBe(2);
    expect(bad.out.join("\n")).toContain("HALLUCINATION_BLOCKED");
    expect(bad.out.join("\n")).toMatch(/claimed 6200 · source 62000/);

    const fixed = capture();
    expect(await run(["verify", INVOICE, "--dir", dir, "--set", "c_amount=6200", "--auto-ground", "--json"], fixed.io)).toBe(0);
    const j = JSON.parse(fixed.out.join(""));
    expect(j.evaluation.verifiedPayload.amountUsd).toBe(62000);
    expect(j.grounding.changes[0]).toMatchObject({ claimId: "c_amount", from: 6200, to: 62000 });
  });

  it("rejects unknown claims and badly typed values", async () => {
    const dir = await project();
    expect(await run(["verify", INVOICE, "--dir", dir, "--set", "nope=1"], capture().io)).toBe(1);
    expect(await run(["verify", INVOICE, "--dir", dir, "--set", "c_amount=abc"], capture().io)).toBe(1);
    expect(await run(["verify", "ghost", "--dir", dir], capture().io)).toBe(1);
  });

  it("detects a source edited after pinning, until it is re-pinned", async () => {
    const dir = await project();
    const file = join(dir, "dossiers", `${INVOICE}.json`);
    const d = JSON.parse(await readFile(file, "utf8"));
    d.sources[0].content = d.sources[0].content.replace("$62,000.00", "$6,200.00");
    await writeFile(file, JSON.stringify(d));
    const c = capture();
    expect(await run(["verify", INVOICE, "--dir", dir], c.io)).toBe(2);
    expect(c.out.join("\n")).toContain("SOURCE_HASH_MISMATCH");
  });

  it("certify seals only grounded dossiers; the ledger and the certificate verify offline", async () => {
    const dir = await project();
    expect(await run(["certify", INVOICE, "--dir", dir, "--set", "c_amount=6200"], capture().io)).toBe(2);
    expect(await run(["ledger", "list", dir, "--json"], (() => { const c = capture(); return c.io; })())).toBe(0);
    const out = join(dir, "invoice.epc.json");
    expect(await run(["certify", INVOICE, "--dir", dir, "--out", out], capture().io)).toBe(0);
    expect(await run(["cert", "verify", out], capture().io)).toBe(0);
    expect(await run(["cert", "verify", out, "--dossier", INVOICE, "--dir", dir], capture().io)).toBe(0);
    expect(await run(["ledger", "verify", dir], capture().io)).toBe(0);
    const { tamperEpistemicCertificate } = await import("@verifact/core");
    const token = JSON.parse(await readFile(out, "utf8")).token as string;
    const bad = join(dir, "bad.epc.json");
    await writeFile(bad, JSON.stringify({ token: tamperEpistemicCertificate(token) }));
    expect(await run(["cert", "verify", bad], capture().io)).toBe(2);
  });

  it("detects a tampered ledger", async () => {
    const dir = await project();
    for (const id of [INVOICE, "gpu_cluster_quote_attestation"]) expect(await run(["certify", id, "--dir", dir], capture().io)).toBe(0);
    const file = join(dir, ".verifact", "ledger.jsonl");
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const rec = JSON.parse(lines[0]);
    rec.epistemicScore = 3;
    lines[0] = JSON.stringify(rec);
    await writeFile(file, `${lines.join("\n")}\n`);
    expect(await run(["ledger", "verify", dir], capture().io)).toBe(2);
  });
});

describe("bridge", () => {
  it("outputs the grounded Assentra payload and Pactline telemetry; a hallucination cannot cross", async () => {
    const dir = await project();
    const tl = capture();
    expect(await run(["bridge", "assentra", INVOICE, "--dir", dir, "--json"], tl.io)).toBe(0);
    expect(JSON.parse(tl.out.join("")).workflow).toMatchObject({ workflowType: "vendor_payment", amountUsd: 62000, vendorRisk: "high" });
    const vp = capture();
    expect(await run(["bridge", "pactline", INVOICE, "--dir", dir, "--json"], vp.io)).toBe(0);
    expect(JSON.parse(vp.out.join(""))).toMatchObject({ contractId: "fintech_wire_clearing_rail", values: { wires: 800, uptimePct: 99.98 } });
    const blocked = capture();
    expect(await run(["bridge", "assentra", INVOICE, "--dir", dir, "--set", "c_amount=6200"], blocked.io)).toBe(2);
    expect(blocked.out.join("\n") + blocked.err.join("\n")).toContain("BLOCKED");
    expect(await run(["bridge", "nope", INVOICE, "--dir", dir], capture().io)).toBe(1);
  });
});

describe("server", () => {
  it("evaluates, certifies, verifies and serves the ledger", async () => {
    const dir = await project();
    const s = await serve(dir);
    expect((await api(s.url, "/api/health")).json).toMatchObject({ name: "verifact", authRequired: false });

    const ev = await api(s.url, "/api/evaluate", { method: "POST", body: { dossierId: INVOICE, claimOverrides: { c_amount: 6200 } } });
    expect(ev.json.evaluation.gateStatus).toBe("HALLUCINATION_BLOCKED");
    const blocked = await api(s.url, "/api/certify", { method: "POST", body: { dossierId: INVOICE, claimOverrides: { c_amount: 6200 } } });
    expect(blocked.status).toBe(403);
    expect((await api(s.url, "/api/ledger")).json.total).toBe(0);

    const sealed = await api(s.url, "/api/certify", { method: "POST", body: { dossierId: INVOICE, claimOverrides: { c_amount: 6200 }, autoGround: true } });
    expect(sealed.status).toBe(201);
    expect(sealed.json.evaluation.verifiedPayload.amountUsd).toBe(62000);
    expect(sealed.json.certificateId).toMatch(/^epc_[0-9a-f]{16}$/);
    expect((await api(s.url, "/api/verify", { method: "POST", body: { token: sealed.json.token, dossierId: INVOICE } })).json).toMatchObject({ ok: true, issuerTrusted: true, sourcesMatch: true });
    expect((await api(s.url, "/api/ledger/verify")).json).toMatchObject({ ok: true, count: 1 });
    const bridge = await api(s.url, "/api/bridge", { method: "POST", body: { target: "assentra", token: sealed.json.token } });
    expect(bridge.json.bridge.workflow.amountUsd).toBe(62000);
  });

  it("accepts an inline working copy and rejects an invalid one", async () => {
    const dir = await project();
    const s = await serve(dir);
    const ws = await api(s.url, "/api/workspace");
    const d = ws.json.dossiers.find((x: any) => x.id === INVOICE);
    const inline = await api(s.url, "/api/evaluate", { method: "POST", body: { dossier: d, sourceOverrides: { invoice: d.sources[0].content.replace("62,000", "62,001") } } });
    expect(inline.json.evaluation.gateStatus).toBe("HALLUCINATION_BLOCKED");
    expect(inline.json.evaluation.checks.find((c: any) => c.code === "EC-105").severity).toBe("block");
    expect((await api(s.url, "/api/evaluate", { method: "POST", body: { dossier: { id: "x" } } })).status).toBe(422);
  });

  it("serialises concurrent certifications so the hash chain never forks", async () => {
    const dir = await project();
    const s = await serve(dir);
    const results = await Promise.all(Array.from({ length: 10 }, () => api(s.url, "/api/certify", { method: "POST", body: { dossierId: INVOICE } })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const ledger = (await api(s.url, "/api/ledger")).json;
    expect(ledger.total).toBe(10);
    expect(new Set(ledger.records.map((r: any) => r.seq)).size).toBe(10);
    expect((await api(s.url, "/api/ledger/verify")).json).toMatchObject({ ok: true, count: 10 });
  });

  it("rejects a forged certificate", async () => {
    const dir = await project();
    const s = await serve(dir);
    const sealed = await api(s.url, "/api/certify", { method: "POST", body: { dossierId: INVOICE } });
    const { tamperEpistemicCertificate } = await import("@verifact/core");
    const forged = tamperEpistemicCertificate(sealed.json.token);
    expect((await api(s.url, "/api/verify", { method: "POST", body: { token: forged } })).json.ok).toBe(false);
    expect((await api(s.url, "/api/bridge", { method: "POST", body: { target: "assentra", token: forged } })).status).toBe(422);
  });

  it("requires the master key and keeps the workspace admin-only; refuses a public bind without auth", async () => {
    const dir = await project();
    const s = await serve(dir, "master-secret");
    expect((await api(s.url, "/api/workspace")).status).toBe(401);
    const ws = await api(s.url, "/api/workspace", { token: "master-secret" });
    expect(ws.status).toBe(200);
    expect((await api(s.url, "/api/workspace", { method: "PUT", token: "master-secret", body: { dossiers: ws.json.dossiers } })).status).toBe(200);
    await expect(startServer({ dir, port: 0, host: "0.0.0.0", apiKey: "" })).rejects.toThrow(/without authentication/);
  });
});

describe("Assentra and Pactline interop", () => {
  it("the bridged payload compiles in the real Assentra catalog", async () => {
    const dir = await project();
    const tlOut = capture();
    expect(await run(["bridge", "assentra", INVOICE, "--dir", dir, "--json"], tlOut.io)).toBe(0);
    const { workflow } = JSON.parse(tlOut.out.join("")) as { workflow: Record<string, unknown> };
    const tl = await import("@assentra/server");
    const parsed = tl.defaultCatalog.schema.safeParse({ ...workflow, dualControl: true });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(tl.defaultCatalog.compile(parsed.data, tl.PERSONAS.VP_Infrastructure, {}).cost.approvalSpendUsd).toBe(62000);

    const vpOut = capture();
    expect(await run(["bridge", "pactline", INVOICE, "--dir", dir, "--json"], vpOut.io)).toBe(0);
    const { values } = JSON.parse(vpOut.out.join("")) as { values: Record<string, number> };
    const vp = await import("@pactline/core");
    const rail = vp.getPack("fintech_wire_clearing_rail");
    expect(rail && Object.keys(values).every((k) => rail.fields.some((f) => f.id === k))).toBe(true);
  });
});
