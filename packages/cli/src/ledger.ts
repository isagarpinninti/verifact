import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildLedgerRecord, verifyProvenanceLedger, type EpistemicCertificate, type LedgerVerification, type ProvenanceLedgerRecord } from "@verifact/core";

/** Reads the JSONL ledger. Returns records newest first. A corrupt line is reported, never skipped. */
export async function readLedger(path: string): Promise<ProvenanceLedgerRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out: ProvenanceLedgerRecord[] = [];
  text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .forEach((line, i) => {
      try {
        out.push(JSON.parse(line) as ProvenanceLedgerRecord);
      } catch {
        throw new Error(`Ledger line ${i + 1} is not valid JSON — the file was modified outside Verifact.`);
      }
    });
  return out.reverse();
}

/** Serialises appends within the process so the hash chain never forks. */
export class LedgerWriter {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly path: string) {}

  append(cert: EpistemicCertificate): Promise<ProvenanceLedgerRecord> {
    const run = async (): Promise<ProvenanceLedgerRecord> => {
      const current = await readLedger(this.path);
      const record = await buildLedgerRecord(current[0], cert);
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      return record;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

export async function verifyLedgerFile(path: string): Promise<LedgerVerification> {
  return verifyProvenanceLedger((await readLedger(path)).reverse());
}
