import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { DossierSchema, validateDossier, type ProvenanceDossier } from "@verifact/core";

const JwkSchema = z.object({ kty: z.literal("EC"), crv: z.literal("P-256"), x: z.string(), y: z.string() }).passthrough();

export const ConfigSchema = z.object({
  name: z.string().min(1),
  issuer: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
  /** Public keys of other issuers whose certificates this project accepts (besides its own). */
  trustedIssuers: z.array(JwkSchema).default([]),
  /** sha256(token) → label. Created with `verifact auth add-key`. */
  auth: z.object({ keys: z.record(z.string(), z.string()) }).default({ keys: {} }),
  webhookUrl: z.string().default(""),
  /** Allow webhooks on private / loopback addresses (off by default: SSRF guard). */
  allowPrivateNetworks: z.boolean().default(false),
});
export type ProjectConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_FILE = "verifact.config.json";
export const DOSSIERS_DIR = "dossiers";
export const STATE_DIR = ".verifact";

export interface Project {
  dir: string;
  config: ProjectConfig;
  dossiers: ProvenanceDossier[];
  warnings: string[];
  paths: { config: string; dossiers: string; state: string; ledger: string; issuerKey: string };
}

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

export function projectPaths(dir: string): Project["paths"] {
  const root = resolve(dir);
  const state = join(root, STATE_DIR);
  return { config: join(root, CONFIG_FILE), dossiers: join(root, DOSSIERS_DIR), state, ledger: join(state, "ledger.jsonl"), issuerKey: join(state, "issuer-key.json") };
}

/** Atomic write: temp file then rename, so a crash never leaves half a file. */
export async function writeFileAtomic(path: string, data: string, mode?: number): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

const SAFE_ID = /^[a-z][a-z0-9_]{1,63}$/;

/** Loads and validates a project. Throws `ProjectError` listing every problem. */
export async function loadProject(dir: string): Promise<Project> {
  const paths = projectPaths(dir);
  let rawConfig: string;
  try {
    rawConfig = await readFile(paths.config, "utf8");
  } catch {
    throw new ProjectError(`No ${CONFIG_FILE} found in ${resolve(dir)}. Run \`verifact init\` first.`);
  }
  let configJson: unknown;
  try {
    configJson = JSON.parse(rawConfig);
  } catch (e) {
    throw new ProjectError(`${CONFIG_FILE} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = ConfigSchema.safeParse(configJson);
  if (!parsed.success) throw new ProjectError(`${CONFIG_FILE} is invalid`, parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`));

  const issues: string[] = [];
  const warnings: string[] = [];
  const dossiers: ProvenanceDossier[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(paths.dossiers)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    /* no dossiers directory yet */
  }
  for (const file of files) {
    try {
      const v = validateDossier(JSON.parse(await readFile(join(paths.dossiers, file), "utf8")));
      if (v.ok && v.dossier) {
        if (`${v.dossier.id}.json` !== file) issues.push(`dossiers/${file}: id '${v.dossier.id}' must match the file name`);
        else {
          dossiers.push(v.dossier);
          warnings.push(...v.warnings.map((w) => `dossiers/${file}: ${w}`));
        }
      } else issues.push(...v.errors.map((m) => `dossiers/${file}: ${m}`));
    } catch (e) {
      issues.push(`dossiers/${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (dossiers.length === 0 && issues.length === 0) issues.push(`No dossiers found in ${DOSSIERS_DIR}/. Add one or run \`verifact init\`.`);
  if (issues.length > 0) throw new ProjectError(`Project has ${issues.length} issue${issues.length === 1 ? "" : "s"}`, issues);
  return { dir: resolve(dir), config: parsed.data, dossiers, warnings, paths };
}

/** Replaces dossiers/ on disk. Validates everything before touching a file. */
export async function saveDossiers(project: Project, next: ProvenanceDossier[]): Promise<Project> {
  const errors: string[] = [];
  for (const d of next) {
    if (!SAFE_ID.test(d.id)) errors.push(`Unsafe dossier id '${d.id}'`);
    const v = validateDossier(d);
    if (!v.ok) errors.push(...v.errors.map((m) => `${d.id}: ${m}`));
  }
  if (errors.length) throw new ProjectError("Invalid workspace", errors);
  await mkdir(project.paths.dossiers, { recursive: true });
  const keep = new Set(next.map((d) => `${d.id}.json`));
  for (const file of await readdir(project.paths.dossiers)) if (file.endsWith(".json") && !keep.has(file)) await rm(join(project.paths.dossiers, file));
  for (const d of next) await writeFileAtomic(join(project.paths.dossiers, `${d.id}.json`), `${JSON.stringify(DossierSchema.parse(d), null, 2)}\n`);
  return loadProject(project.dir);
}

export async function saveConfig(project: Project, config: ProjectConfig): Promise<void> {
  await writeFileAtomic(project.paths.config, `${JSON.stringify(config, null, 2)}\n`);
}
