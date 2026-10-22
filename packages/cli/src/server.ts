import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DossierSchema, bridgeToAssentraPayload, bridgeToPactlineTelemetry, validateDossier, verifyEpistemicCertificate, type ProvenanceDossier } from "@verifact/core";
import { LedgerWriter, readLedger, verifyLedgerFile } from "./ledger";
import { loadProject, saveDossiers, type Project } from "./project";
import { evaluate, openContext, seal, trustedIssuers, type Context } from "./service";
import { VERSION } from "./version";
import { deliver } from "./webhook";

export interface ServerOptions {
  dir: string;
  host?: string;
  port?: number;
  /** Directory with the prebuilt Studio. Defaults to the one bundled in the package. */
  studioDir?: string;
  /** Master key (admin): may edit the workspace. Also read from VERIFACT_API_KEY. */
  apiKey?: string;
}

export interface RunningServer {
  server: Server;
  url: string;
  port: number;
  fingerprint: string;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const MAX_BODY = 1_000_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const issues = (e: z.ZodError): string[] => e.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra, "content-type": "application/json", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
  res.end(text);
}

function defaultStudioDir(): string {
  return fileURLToPath(new URL("../studio-dist", import.meta.url));
}

const ClaimValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const EvaluateSchema = z.object({
  /** A stored dossier id, or an inline dossier (the Studio sends its working copy). */
  dossierId: z.string().min(1).optional(),
  dossier: z.unknown().optional(),
  claimOverrides: z.record(z.string(), ClaimValueSchema).optional(),
  sourceOverrides: z.record(z.string(), z.string()).optional(),
  autoGround: z.boolean().default(false),
});

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  let project: Project = await loadProject(options.dir);
  let ctx: Context = await openContext(project);
  const ledger = new LedgerWriter(project.paths.ledger);
  const masterKey = options.apiKey ?? process.env.VERIFACT_API_KEY ?? "";
  const authRequired = (): boolean => masterKey !== "" || Object.keys(project.config.auth.keys).length > 0;
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!loopback && !authRequired()) throw new Error(`Refusing to listen on ${host} without authentication. Set VERIFACT_API_KEY or run \`verifact auth add-key <label>\`.`);
  const studioDir = resolve(options.studioDir ?? defaultStudioDir());

  /**
   * Certifications are serialised so the evaluate → seal → ledger-append step is atomic: concurrent requests
   * can never fork the hash chain or interleave records. Slow network I/O (the webhook) runs outside the lock.
   */
  let certifyQueue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = certifyQueue.then(fn, fn);
    certifyQueue = run.catch(() => undefined);
    return run;
  };

  /* ───── rate limiting (per IP, fixed window) ───── */
  const windows = new Map<string, { count: number; reset: number }>();
  const limited = (ip: string, bucket: string, max: number): boolean => {
    const now = Date.now();
    const k = `${bucket}:${ip}`;
    const w = windows.get(k);
    if (!w || w.reset < now) {
      windows.set(k, { count: 1, reset: now + 60_000 });
      return false;
    }
    w.count++;
    return w.count > max;
  };

  /** Returns the principal (admin = master key) or null. */
  const authenticate = (req: IncomingMessage): { admin: boolean } | null => {
    if (!authRequired()) return { admin: true };
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return null;
    if (masterKey !== "" && safeEqual(token, masterKey)) return { admin: true };
    return project.config.auth.keys[sha256(token)] ? { admin: false } : null;
  };

  const resolveDossier = (body: z.infer<typeof EvaluateSchema>): ProvenanceDossier => {
    if (body.dossier !== undefined) {
      const v = validateDossier(body.dossier);
      if (!v.ok || !v.dossier) throw new HttpError(422, "Invalid dossier", { issues: v.errors });
      return v.dossier;
    }
    const found = project.dossiers.find((d) => d.id === body.dossierId);
    if (!found) throw new HttpError(404, `No dossier '${String(body.dossierId)}'`);
    return found;
  };
  const parseEvaluate = async (req: IncomingMessage): Promise<z.infer<typeof EvaluateSchema>> => {
    const body = EvaluateSchema.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "Invalid request", { issues: issues(body.error) });
    if (body.data.dossierId === undefined && body.data.dossier === undefined) throw new HttpError(400, "Send a dossierId or an inline dossier");
    return body.data;
  };

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, ip: string): Promise<void> {
    const method = req.method ?? "GET";
    if (path === "/api/health" && method === "GET") {
      return send(res, 200, { name: "verifact", version: VERSION, mode: "server", project: project.config.name, issuer: project.config.issuer, authRequired: authRequired(), keyFingerprint: ctx.issuerKey.fingerprint, publicKeyJwk: ctx.issuerKey.publicKeyJwk });
    }
    if (limited(ip, "api", 600)) throw new HttpError(429, "Too many requests");
    const principal = authenticate(req);
    if (!principal) throw new HttpError(401, "Authentication required: send `Authorization: Bearer <key>`");

    if (path === "/api/workspace" && method === "GET") return send(res, 200, { project: project.config.name, issuer: project.config.issuer, dossiers: project.dossiers, warnings: project.warnings });
    if (path === "/api/workspace" && method === "PUT") {
      if (!principal.admin) throw new HttpError(403, "Only the admin key can change the workspace");
      const body = z.object({ dossiers: z.array(DossierSchema).min(1) }).safeParse(await readJson(req));
      if (!body.success) throw new HttpError(422, "Invalid workspace", { issues: issues(body.error) });
      try {
        project = await saveDossiers(project, body.data.dossiers);
        ctx = { ...ctx, project };
      } catch (e) {
        throw new HttpError(422, e instanceof Error ? e.message : "Invalid workspace", { issues: (e as { issues?: string[] }).issues });
      }
      return send(res, 200, { ok: true, dossiers: project.dossiers.length });
    }
    if (path === "/api/evaluate" && method === "POST") {
      const body = await parseEvaluate(req);
      const e = await evaluate({ dossier: resolveDossier(body), claimOverrides: body.claimOverrides, sourceOverrides: body.sourceOverrides, autoGround: body.autoGround });
      return send(res, 200, { ok: true, dossier: e.dossier, evaluation: e.evaluation, grounding: e.grounding });
    }
    if (path === "/api/certify" && method === "POST") {
      if (limited(ip, "certify", 120)) throw new HttpError(429, "Too many certifications");
      const body = await parseEvaluate(req);
      const dossier = resolveDossier(body);
      const done = await exclusive(async () => {
        const e = await evaluate({ dossier, claimOverrides: body.claimOverrides, sourceOverrides: body.sourceOverrides, autoGround: body.autoGround });
        if (e.evaluation.gateStatus === "HALLUCINATION_BLOCKED") throw new HttpError(403, "Blocked by the hallucination gate", { code: "hallucination_blocked", evaluation: e.evaluation, grounding: e.grounding });
        const cert = await seal(ctx, e);
        return { e, cert, record: await ledger.append(cert) };
      });
      const webhook = await deliver(project.config.webhookUrl, { event: "verifact.certificate.sealed", certificateId: done.cert.certificateId, dossierId: dossier.id, gateStatus: done.cert.payload.gateStatus, epistemicScore: done.cert.payload.epistemicScore, verifiedPayload: done.cert.payload.verifiedPayload, token: done.cert.token }, project.config.allowPrivateNetworks);
      return send(res, 201, { ok: true, certificateId: done.cert.certificateId, token: done.cert.token, record: done.record, evaluation: done.e.evaluation, grounding: done.e.grounding, webhook });
    }
    if (path === "/api/ledger" && method === "GET") {
      const limit = Math.min(1000, Number(new URL(req.url ?? "/", "http://x").searchParams.get("limit") ?? 500) || 500);
      const records = await readLedger(project.paths.ledger);
      return send(res, 200, { records: records.slice(0, limit), total: records.length });
    }
    if (path === "/api/ledger/verify" && method === "GET") return send(res, 200, await verifyLedgerFile(project.paths.ledger));
    if (path === "/api/verify" && method === "POST") {
      const body = z.object({ token: z.string().min(8), dossierId: z.string().optional() }).safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "Body must be { token: 'epc_…', dossierId?: string }", { issues: issues(body.error) });
      const dossier = body.data.dossierId ? project.dossiers.find((d) => d.id === body.data.dossierId) : undefined;
      if (body.data.dossierId && !dossier) throw new HttpError(404, `No dossier '${body.data.dossierId}'`);
      const result = await verifyEpistemicCertificate(body.data.token, { issuerRegistry: await trustedIssuers(ctx), sources: dossier ? Object.fromEntries(dossier.sources.map((s) => [s.id, s.content])) : undefined });
      return send(res, 200, result);
    }
    if (path === "/api/bridge" && method === "POST") {
      const body = z.object({ target: z.enum(["assentra", "pactline"]), token: z.string().min(8) }).safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "Body must be { target: 'assentra' | 'pactline', token: 'epc_…' }", { issues: issues(body.error) });
      const v = await verifyEpistemicCertificate(body.data.token, { issuerRegistry: await trustedIssuers(ctx) });
      if (!v.ok) throw new HttpError(422, "The certificate does not verify", { reasons: v.reasons });
      try {
        return send(res, 200, { ok: true, target: body.data.target, ...(body.data.target === "assentra" ? { bridge: bridgeToAssentraPayload(body.data.token) } : { bridge: bridgeToPactlineTelemetry(body.data.token) }) });
      } catch (e) {
        throw new HttpError(422, e instanceof Error ? e.message : "Bridge failed");
      }
    }
    throw new HttpError(404, "Not found");
  }

  async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
    if (!existsSync(studioDir)) {
      res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>Verifact</title><body style=\"font-family:system-ui;padding:2rem\"><h1>Verifact gateway is running</h1><p>The Studio UI is not bundled in this build. The JSON API is available under <code>/api</code>.</p></body>");
      return;
    }
    const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
    let file = resolve(studioDir, clean === "" ? "index.html" : clean);
    if (file !== studioDir && !file.startsWith(studioDir + sep)) throw new HttpError(403, "Forbidden");
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = existsSync(`${file}.html`) ? `${file}.html` : join(studioDir, "index.html");
    const data = await readFile(file);
    const immutable = file.includes(`${sep}_next${sep}static${sep}`);
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(data);
  }

  const server = createServer((req, res) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const path = (req.url ?? "/").split("?")[0];
    const run = path.startsWith("/api/") ? handleApi(req, res, path, ip) : req.method === "GET" || req.method === "HEAD" ? serveStatic(res, path) : Promise.reject(new HttpError(405, "Method not allowed"));
    run.catch((e: unknown) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message, ...e.extra });
      process.stderr.write(`[verifact] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
      return send(res, 500, { ok: false, error: "Internal server error" });
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4319, host, () => resolveListen());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 4319);
  return {
    server,
    port,
    url: `http://${host === "::1" ? "[::1]" : host}:${port}`,
    fingerprint: ctx.issuerKey.fingerprint,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
