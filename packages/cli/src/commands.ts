import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DOSSIER_PACKS, bridgeToAssentraPayload, bridgeToPactlineTelemetry, decodeEpistemicCertificate, pinSources, verifyEpistemicCertificate, type ClaimValue, type ProvenanceDossier } from "@verifact/core";
import { readLedger, verifyLedgerFile } from "./ledger";
import { CONFIG_FILE, ProjectError, loadProject, projectPaths, saveConfig, saveDossiers, writeFileAtomic, type Project, type ProjectConfig } from "./project";
import { startServer } from "./server";
import { evaluate, openContext, seal, type Evaluated } from "./service";
import { loadOrCreateKey } from "./key";
import { styles, type Io } from "./ui";
import { VERSION } from "./version";

type OptionDef = { type: "string" | "boolean"; short?: string; multiple?: boolean };

/** Exit codes: 0 grounded / ok · 1 error · 2 hallucination blocked, verification failed or tampering detected. */
export type ExitCode = 0 | 1 | 2;

const HELP = `verifact ${VERSION} — bind claims to primary-source bytes, block hallucinations, seal evidence

Usage: verifact <command> [options]

Commands
  init [dir]                          Scaffold verifact.config.json and dossiers/ (sources are SHA-256 pinned)
  validate [dir]                      Validate config and every dossier (CI friendly)
  verify <dossierId>                  Check every claim against its source bytes   (exit 2 when blocked)
        --set claimId=value             what-if: replace a claimed value (repeatable)
        --auto-ground                   rewrite hallucinated claims to the source value first
  certify <dossierId>                 Seal an epc_ certificate and append it to the ledger  (exit 2 when blocked)
  pin <dossierId>                     Re-pin source SHA-256 digests after an intentional change
  studio [dir]                        Start the Provenance Studio + verifier on http://127.0.0.1:4319
  ledger verify|list [dir]            Verify the hash-chained provenance ledger     (exit 2 on tampering)
  cert verify <file.epc.json>         Verify an epc_ certificate offline            (exit 2 on failure)
  bridge assentra|pactline <dossierId|file|token>   Output the grounded payload for Assentra or Pactline
  key show [dir]                      Issuer key fingerprint and public key
  auth add-key <label>                Create a verifier API key

Common options
  --dir <path>     Project directory (default: .)
  --json           Machine-readable output
  -h, --help       Show help      -v, --version   Show version

Examples
  verifact init my-evidence && cd my-evidence
  verifact verify vendor_invoice_three_way_match --set c_amount=6200 --auto-ground
  verifact bridge assentra vendor_invoice_three_way_match
`;

const COMMON = { dir: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } } as const;

function parse<const O extends Record<string, OptionDef>>(argv: string[], own: O) {
  return parseArgs({ args: argv, options: { ...COMMON, ...own }, allowPositionals: true, strict: true });
}

function printIssues(io: Io, issues: string[]): void {
  const c = styles(io);
  for (const i of issues) io.err(`  ${c.red("✖")} ${i}`);
}

function fail(io: Io, e: unknown): ExitCode {
  const c = styles(io);
  io.err(`${c.red("✖")} ${e instanceof Error ? e.message : String(e)}`);
  if (e instanceof ProjectError) printIssues(io, e.issues);
  return 1;
}

function parseClaimed(raw: string, type: "number" | "string" | "boolean"): ClaimValue {
  if (type === "number") {
    const n = Number(raw.replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) throw new Error(`'${raw}' is not a number`);
    return n;
  }
  if (type === "boolean") {
    if (raw !== "true" && raw !== "false") throw new Error(`'${raw}' is not true or false`);
    return raw === "true";
  }
  return raw;
}

function overridesFrom(dossier: ProvenanceDossier, sets: string[] | undefined): Record<string, ClaimValue> {
  const out: Record<string, ClaimValue> = {};
  for (const kv of sets ?? []) {
    const i = kv.indexOf("=");
    if (i < 1) throw new Error(`--set expects claimId=value, got '${kv}'`);
    const claim = dossier.claims.find((c) => c.id === kv.slice(0, i));
    if (!claim) throw new Error(`'${kv.slice(0, i)}' is not a claim of ${dossier.id}. Claims: ${dossier.claims.map((c) => c.id).join(", ")}`);
    out[claim.id] = parseClaimed(kv.slice(i + 1), claim.valueType);
  }
  return out;
}

function findDossier(project: Project, id: string): ProvenanceDossier {
  const d = project.dossiers.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dossier '${id}'. Available: ${project.dossiers.map((x) => x.id).join(", ")}`);
  return d;
}

/* ───────────────────────── init ───────────────────────── */

async function init(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { name: { type: "string" }, force: { type: "boolean" } });
  const dir = resolve(positionals[0] ?? values.dir ?? ".");
  const paths = projectPaths(dir);
  const c = styles(io);
  try {
    await stat(paths.config);
    if (!values.force) {
      io.err(`${c.red("✖")} ${CONFIG_FILE} already exists in ${dir}. Use --force to overwrite.`);
      return 1;
    }
  } catch {
    /* fresh project */
  }
  const config: ProjectConfig = { name: String(values.name ?? dir.split(/[\\/]/).pop() ?? "verifact-project"), issuer: { id: "issuer_local", name: "Local Issuer" }, trustedIssuers: [], auth: { keys: {} }, webhookUrl: "", allowPrivateNetworks: false };
  await mkdir(paths.dossiers, { recursive: true });
  await writeFileAtomic(paths.config, `${JSON.stringify(config, null, 2)}\n`);
  for (const d of DOSSIER_PACKS) await writeFileAtomic(join(paths.dossiers, `${d.id}.json`), `${JSON.stringify(await pinSources(d), null, 2)}\n`);
  await writeFile(join(dir, ".gitignore"), ".verifact/\n", { flag: "a" });
  io.out(`${c.green("✔")} Created ${c.bold(config.name)} in ${dir}`);
  io.out(`  ${CONFIG_FILE}  issuer, trusted issuers, auth`);
  io.out(`  dossiers/       ${DOSSIER_PACKS.length} provenance dossiers, sources pinned by SHA-256`);
  io.out("");
  io.out("Next:");
  io.out(`  ${c.cyan("verifact validate")}   check everything`);
  io.out(`  ${c.cyan("verifact studio")}     open the Provenance Studio`);
  return 0;
}

async function validate(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, {});
  const c = styles(io);
  try {
    const p = await loadProject(positionals[0] ?? values.dir ?? ".");
    if (values.json) io.out(JSON.stringify({ ok: true, project: p.config.name, dossiers: p.dossiers.map((d) => d.id), warnings: p.warnings }, null, 2));
    else {
      io.out(`${c.green("✔")} ${c.bold(p.config.name)} is valid`);
      io.out(`  ${p.dossiers.length} dossiers · ${p.dossiers.reduce((n, d) => n + d.claims.length, 0)} claims · ${p.dossiers.reduce((n, d) => n + d.sources.length, 0)} sources`);
      for (const w of p.warnings) io.out(`  ${c.yellow("▲")} ${w}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ProjectError && values.json) {
      io.out(JSON.stringify({ ok: false, error: e.message, issues: e.issues }, null, 2));
      return 1;
    }
    return fail(io, e);
  }
}

/* ───────────────────────── verify / certify / pin ───────────────────────── */

function describe(io: Io, e: Evaluated): void {
  const c = styles(io);
  const r = e.evaluation;
  const tone = r.gateStatus === "VERIFIED_GROUNDED" ? c.green : r.gateStatus === "DRIFT_WARNING" ? c.yellow : c.red;
  io.out(`${c.bold(e.dossier.name)}  ${tone(r.gateStatus)}  ${c.dim(`epistemic score ${r.epistemicScore}/100`)}`);
  for (const cl of r.claimResults) {
    const mark = cl.status === "EXACT_GROUNDED" ? c.green("✔") : cl.status === "TOLERANCE_DRIFT" ? c.yellow("▲") : c.red("✖");
    const span = cl.span ? c.dim(` [bytes ${cl.span.startByte}..${cl.span.endByte}]`) : "";
    io.out(`  ${mark} ${cl.label}: claimed ${JSON.stringify(cl.claimedValue)}${cl.status === "EXACT_GROUNDED" ? "" : ` · source ${cl.sourceValue === null ? "—" : JSON.stringify(cl.sourceValue)}`}  ${c.dim(cl.status)}${span}`);
  }
  for (const k of r.checks.filter((x) => x.severity !== "ok")) io.out(`  ${k.severity === "block" ? c.red("✖") : c.yellow("▲")} ${c.dim(k.code)} ${k.message}`);
  if (e.grounding && e.grounding.changes.length) io.out(`${c.cyan("↳")} Auto-grounded: ${e.grounding.changes.map((x) => `${x.label} ${JSON.stringify(x.from)} → ${JSON.stringify(x.to)}`).join(", ")}`);
  for (const s of e.grounding?.skipped ?? []) io.out(`  ${c.yellow("▲")} not auto-grounded: ${s.label} (${s.reason})`);
}

async function verifyCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { set: { type: "string", multiple: true }, "auto-ground": { type: "boolean" } });
  const c = styles(io);
  const id = positionals[0];
  if (!id) {
    io.err(`${c.red("✖")} Usage: verifact verify <dossierId> [--set claimId=value] [--auto-ground] [--json]`);
    return 1;
  }
  try {
    const project = await loadProject(values.dir ?? ".");
    const dossier = findDossier(project, id);
    const e = await evaluate({ dossier, claimOverrides: overridesFrom(dossier, values.set), autoGround: Boolean(values["auto-ground"]) });
    const blocked = e.evaluation.gateStatus === "HALLUCINATION_BLOCKED";
    if (values.json) io.out(JSON.stringify({ dossierId: id, evaluation: e.evaluation, grounding: e.grounding }, null, 2));
    else describe(io, e);
    return blocked ? 2 : 0;
  } catch (e) {
    return fail(io, e);
  }
}

async function certifyCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { set: { type: "string", multiple: true }, "auto-ground": { type: "boolean" }, out: { type: "string" } });
  const c = styles(io);
  const id = positionals[0];
  if (!id) {
    io.err(`${c.red("✖")} Usage: verifact certify <dossierId> [--set claimId=value] [--auto-ground] [--out file.epc.json]`);
    return 1;
  }
  try {
    const project = await loadProject(values.dir ?? ".");
    const ctx = await openContext(project);
    const dossier = findDossier(project, id);
    const e = await evaluate({ dossier, claimOverrides: overridesFrom(dossier, values.set), autoGround: Boolean(values["auto-ground"]) });
    if (e.evaluation.gateStatus === "HALLUCINATION_BLOCKED") {
      if (values.json) io.out(JSON.stringify({ ok: false, evaluation: e.evaluation }, null, 2));
      else {
        describe(io, e);
        io.err(`${c.red("✖")} BLOCKED: nothing was sealed.`);
      }
      return 2;
    }
    const cert = await seal(ctx, e);
    const { LedgerWriter } = await import("./ledger");
    const record = await new LedgerWriter(project.paths.ledger).append(cert);
    if (values.out) await writeFile(values.out, `${JSON.stringify({ certificateId: cert.certificateId, token: cert.token }, null, 2)}\n`);
    if (values.json) io.out(JSON.stringify({ ok: true, certificateId: cert.certificateId, token: cert.token, record: { ...record, token: undefined } }, null, 2));
    else {
      describe(io, e);
      io.out(`${c.green("✔")} Sealed ${c.bold(cert.certificateId)}  ledger #${record.seq}${values.out ? `  → ${values.out}` : ""}`);
    }
    return 0;
  } catch (e) {
    return fail(io, e);
  }
}

async function pinCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, {});
  const c = styles(io);
  if (!positionals[0]) {
    io.err(`${c.red("✖")} Usage: verifact pin <dossierId>`);
    return 1;
  }
  try {
    const project = await loadProject(values.dir ?? ".");
    const pinned = await pinSources(findDossier(project, positionals[0]));
    await saveDossiers(project, project.dossiers.map((d) => (d.id === pinned.id ? pinned : d)));
    io.out(`${c.green("✔")} Pinned ${pinned.sources.length} source digest(s) for ${pinned.id}`);
    return 0;
  } catch (e) {
    return fail(io, e);
  }
}

/* ───────────────────────── ledger / cert / bridge / key / auth ───────────────────────── */

async function ledgerCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { limit: { type: "string" } });
  const c = styles(io);
  const sub = positionals[0];
  const paths = projectPaths(positionals[1] ?? values.dir ?? ".");
  try {
    if (sub === "verify") {
      const r = await verifyLedgerFile(paths.ledger);
      if (values.json) io.out(JSON.stringify(r, null, 2));
      else if (r.ok) io.out(`${c.green("✔")} ${r.reason} Chain and every certificate signature verified.`);
      else io.err(`${c.red("✖")} LEDGER FAILED VERIFICATION — ${r.reason}`);
      return r.ok ? 0 : 2;
    }
    if (sub === "list") {
      const rows = (await readLedger(paths.ledger)).slice(0, Number(values.limit ?? 20));
      if (values.json) io.out(JSON.stringify(rows.map((r) => ({ ...r, token: undefined })), null, 2));
      else if (rows.length === 0) io.out("Ledger is empty.");
      else for (const r of rows) io.out(`${r.timestampIso}  ${r.certificateId}  ${String(r.epistemicScore).padStart(3)}  ${r.gateStatus.padEnd(18)}  ${r.dossierId}  ${c.dim(`${r.claimCount} claims`)}`);
      return 0;
    }
    io.err(`${c.red("✖")} Usage: verifact ledger verify|list [dir]`);
    return 1;
  } catch (e) {
    io.err(`${c.red("✖")} ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

async function readToken(spec: string): Promise<string> {
  const t = spec.trim();
  if (t.startsWith("epc_")) return t;
  const raw = (await readFile(t, "utf8")).trim();
  if (raw.startsWith("{")) {
    const j = JSON.parse(raw) as { token?: string };
    if (typeof j.token !== "string") throw new Error("The file has no 'token' field");
    return j.token;
  }
  return raw;
}

async function certCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { dossier: { type: "string" } });
  const c = styles(io);
  if (positionals[0] !== "verify" || !positionals[1]) {
    io.err(`${c.red("✖")} Usage: verifact cert verify <file.epc.json|epc_token> [--dossier id] [--dir project]`);
    return 1;
  }
  try {
    const token = await readToken(positionals[1]);
    let sources: Record<string, string> | undefined;
    if (values.dossier) {
      const project = await loadProject(values.dir ?? ".");
      sources = Object.fromEntries(findDossier(project, values.dossier).sources.map((s) => [s.id, s.content]));
    }
    const v = await verifyEpistemicCertificate(token, { sources });
    if (values.json) io.out(JSON.stringify(v, null, 2));
    else if (v.ok) {
      const p = decodeEpistemicCertificate(token).payload;
      io.out(`${c.green("✔")} ${v.certificateId} is authentic: signature, canonical form and claims verified${v.sourcesMatch ? ", sources re-hashed" : ""}`);
      io.out(`  ${p.dossierId}  score ${p.epistemicScore}  ${c.dim(p.gateStatus)}  ${Object.keys(p.verifiedPayload).length} verified fields  issuer ${p.issuerFingerprint.slice(0, 12)}`);
    } else {
      io.err(`${c.red("✖")} VERIFICATION FAILED`);
      for (const r of v.reasons) io.err(`  ${c.red("•")} ${r}`);
    }
    return v.ok ? 0 : 2;
  } catch (e) {
    return fail(io, e);
  }
}

async function bridgeCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { set: { type: "string", multiple: true }, "auto-ground": { type: "boolean" } });
  const c = styles(io);
  const [target, subject] = positionals;
  if ((target !== "assentra" && target !== "pactline") || !subject) {
    io.err(`${c.red("✖")} Usage: verifact bridge assentra|pactline <dossierId|file.epc.json|epc_token> [--set claimId=value] [--auto-ground]`);
    return 1;
  }
  try {
    let token: string;
    if (subject.startsWith("epc_") || subject.endsWith(".json")) token = await readToken(subject);
    else {
      const project = await loadProject(values.dir ?? ".");
      const ctx = await openContext(project);
      const dossier = findDossier(project, subject);
      const e = await evaluate({ dossier, claimOverrides: overridesFrom(dossier, values.set), autoGround: Boolean(values["auto-ground"]) });
      if (e.evaluation.gateStatus === "HALLUCINATION_BLOCKED") {
        describe(io, e);
        io.err(`${c.red("✖")} BLOCKED: a hallucinated dossier cannot feed ${target === "assentra" ? "Assentra" : "Pactline"}.`);
        return 2;
      }
      token = (await seal(ctx, e)).token;
    }
    const v = await verifyEpistemicCertificate(token);
    if (!v.ok) {
      io.err(`${c.red("✖")} The certificate does not verify: ${v.reasons.join(" ")}`);
      return 2;
    }
    if (target === "assentra") {
      const b = bridgeToAssentraPayload(token);
      if (values.json) io.out(JSON.stringify(b, null, 2));
      else {
        io.out(JSON.stringify(b.workflow, null, 2));
        io.err(`${c.dim(`# Assentra: pass as the workflow payload (workflowType ${b.workflowType}); ${b.unmapped.length} claim(s) not mapped to a workflow field`)}`);
      }
    } else {
      const b = bridgeToPactlineTelemetry(token);
      if (values.json) io.out(JSON.stringify(b, null, 2));
      else {
        io.out(JSON.stringify(b.values, null, 2));
        io.err(`${c.dim(`# Pactline: pactline meter ${b.contractId} ${Object.entries(b.values).map(([k, x]) => `--set ${k}=${x}`).join(" ")} --token <buyer receipt>`)}`);
      }
    }
    return 0;
  } catch (e) {
    return fail(io, e);
  }
}

async function keyCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, {});
  if (positionals[0] !== "show") {
    io.err("Usage: verifact key show [dir]");
    return 1;
  }
  const k = await loadOrCreateKey(projectPaths(positionals[1] ?? values.dir ?? ".").issuerKey);
  if (values.json) io.out(JSON.stringify({ fingerprint: k.fingerprint, publicKeyJwk: k.publicKeyJwk }, null, 2));
  else {
    io.out(`fingerprint  ${k.fingerprint}`);
    io.out(JSON.stringify(k.publicKeyJwk, null, 2));
  }
  return 0;
}

async function authCmd(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, {});
  const c = styles(io);
  if (positionals[0] !== "add-key" || !positionals[1]) {
    io.err("Usage: verifact auth add-key <label>");
    return 1;
  }
  try {
    const p = await loadProject(values.dir ?? ".");
    const token = `epk_${randomBytes(24).toString("base64url")}`;
    const hash = createHash("sha256").update(token).digest("hex");
    await saveConfig(p, { ...p.config, auth: { keys: { ...p.config.auth.keys, [hash]: positionals[1] } } });
    io.out(`${c.green("✔")} Verifier API key '${positionals[1]}' (shown once, store it securely):`);
    io.out(`\n  ${c.bold(token)}\n`);
    io.out(c.dim("Send as `Authorization: Bearer …`. Only the sha256 is stored. Keys cannot change the workspace."));
    return 0;
  } catch (e) {
    return fail(io, e);
  }
}

async function studio(argv: string[], io: Io): Promise<ExitCode> {
  const { values, positionals } = parse(argv, { port: { type: "string", short: "p" }, host: { type: "string" }, open: { type: "boolean" } });
  const c = styles(io);
  try {
    const running = await startServer({ dir: positionals[0] ?? values.dir ?? ".", port: values.port ? Number(values.port) : 4319, host: values.host });
    io.out(`${c.green("✔")} Verifact Studio  ${c.bold(running.url)}`);
    io.out(`  issuer key ${running.fingerprint}`);
    io.out(c.dim("  Ctrl+C to stop"));
    if (values.open) {
      const { spawn } = await import("node:child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      spawn(cmd, [running.url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
    }
    const stop = (): void => {
      io.out("\nShutting down…");
      void running.close().then(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await new Promise<void>(() => undefined);
    return 0;
  } catch (e) {
    return fail(io, e);
  }
}

export async function run(argv: string[], io: Io): Promise<ExitCode> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    io.out(HELP);
    return 0;
  }
  if (cmd === "-v" || cmd === "--version") {
    io.out(VERSION);
    return 0;
  }
  try {
    switch (cmd) {
      case "init":
        return await init(rest, io);
      case "validate":
        return await validate(rest, io);
      case "verify":
        return await verifyCmd(rest, io);
      case "certify":
        return await certifyCmd(rest, io);
      case "pin":
        return await pinCmd(rest, io);
      case "studio":
      case "serve":
        return await studio(rest, io);
      case "ledger":
        return await ledgerCmd(rest, io);
      case "cert":
        return await certCmd(rest, io);
      case "bridge":
        return await bridgeCmd(rest, io);
      case "key":
        return await keyCmd(rest, io);
      case "auth":
        return await authCmd(rest, io);
      default:
        io.err(`Unknown command '${cmd}'.\n\n${HELP}`);
        return 1;
    }
  } catch (e) {
    return fail(io, e);
  }
}
