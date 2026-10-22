// End-to-end smoke test of the PUBLISHED artifact: packs the packages, installs the tarballs into a clean
// directory and drives the real `verifact` binary: init → validate → verify → certify → verify offline → studio (HTTP) → ledger.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const fail = (msg) => {
  console.error(`\n✖ smoke test failed: ${msg}`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
  console.log(`  ✔ ${msg}`);
};

const work = mkdtempSync(join(tmpdir(), "verifact-smoke-"));
console.log(`smoke: ${work}`);
const pack = run("npm", ["pack", "-w", "@verifact/core", "-w", "@verifact/react", "-w", "@verifact/cli", "--pack-destination", work]);
if (pack.code !== 0) fail(`npm pack failed\n${pack.out}`);
const tars = readdirSync(work).filter((f) => f.endsWith(".tgz")).map((f) => join(work, f));
check(tars.length === 3, "packed 3 tarballs");

const app = join(work, "app");
run("mkdir", ["-p", app]);
writeFileSync(join(app, "package.json"), JSON.stringify({ name: "smoke", private: true, type: "module" }));
const install = run("npm", ["install", "--no-audit", "--no-fund", ...tars, "zod"], { cwd: app });
if (install.code !== 0) fail(`npm install failed\n${install.out}`);
const bin = join(app, "node_modules", "@verifact", "cli", "dist", "cli.js");
const ec = (...args) => run("node", [bin, ...args], { cwd: app });

const INVOICE = "vendor_invoice_three_way_match";
check(ec("--version").out.trim().match(/^\d+\.\d+\.\d+/) !== null, "verifact --version");
check(ec("init", "proj", "--name", "smoke-project").code === 0, "init scaffolds a project with pinned sources");
check(ec("validate", "proj").code === 0, "validate passes");
check(ec("verify", INVOICE, "--dir", "proj").code === 0, "verify: a grounded dossier passes (exit 0)");
check(ec("verify", INVOICE, "--dir", "proj", "--set", "c_amount=6200").code === 2, "verify: a $6,200 hallucination against a $62,000 invoice is blocked (exit 2)");
const grounded = ec("verify", INVOICE, "--dir", "proj", "--set", "c_amount=6200", "--auto-ground", "--json");
check(grounded.code === 0 && JSON.parse(grounded.out).evaluation.verifiedPayload.amountUsd === 62000, "auto-ground restores $62,000 from the source bytes");
check(ec("certify", INVOICE, "--dir", "proj", "--set", "c_amount=6200").code === 2, "certify refuses to seal a hallucinated dossier");
const certFile = join(work, "invoice.epc.json");
check(ec("certify", INVOICE, "--dir", "proj", "--out", certFile).code === 0, "certify seals an epc_ certificate");
check(ec("cert", "verify", certFile, "--dossier", INVOICE, "--dir", "proj").code === 0, "cert verify: authentic, sources re-hashed");
const tl = ec("bridge", "assentra", INVOICE, "--dir", "proj", "--json");
check(tl.code === 0 && JSON.parse(tl.out).workflow.amountUsd === 62000, "bridge assentra: grounded payload");
const vp = ec("bridge", "pactline", INVOICE, "--dir", "proj", "--json");
check(vp.code === 0 && JSON.parse(vp.out).values.wires === 800, "bridge pactline: grounded telemetry");

const port = 4900 + Math.floor(Math.random() * 90);
const server = spawn("node", [bin, "studio", "proj", "--port", String(port)], { cwd: app, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", () => undefined);
server.stderr.on("data", () => undefined);
let tokenFile = "";
try {
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    await sleep(100);
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
  }
  check(up, "studio server starts");
  check((await (await fetch(base)).text()).includes("Verifact"), "bundled Studio UI is served");
  const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const blocked = await post("/api/certify", { dossierId: INVOICE, claimOverrides: { c_amount: 6200 } });
  check(blocked.status === 403, "server blocks a hallucinated certification (403)");
  const sealed = await (await post("/api/certify", { dossierId: INVOICE, claimOverrides: { c_amount: 6200 }, autoGround: true })).json();
  check(sealed.evaluation?.verifiedPayload?.amountUsd === 62000, "server auto-grounds and seals");
  const many = await Promise.all(Array.from({ length: 6 }, () => post("/api/certify", { dossierId: INVOICE })));
  check(many.every((r) => r.status === 201), "concurrent certifications all succeed");
  tokenFile = join(work, "server.epc.json");
  writeFileSync(tokenFile, JSON.stringify({ token: sealed.token }));
} finally {
  server.kill("SIGTERM");
}
check(ec("cert", "verify", tokenFile).code === 0, "cert verify: the server's certificate is authentic");
check(ec("ledger", "verify", "proj").code === 0, "ledger verifies (chain + every signature, no forks)");
console.log("\n✔ smoke test passed");
