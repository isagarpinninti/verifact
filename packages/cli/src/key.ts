import { chmod, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createSigningKey, loadSigningKey, type KeyMaterial } from "@verifact/core";
import { writeFileAtomic } from "./project";

/** Loads the issuer signing key or creates it (ECDSA P-256, stored as a private JWK with mode 0600). */
export async function loadOrCreateKey(path: string): Promise<KeyMaterial> {
  try {
    const stored = JSON.parse(await readFile(path, "utf8")) as { privateKeyJwk: JsonWebKey };
    return await loadSigningKey(stored.privateKeyJwk);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Could not read signing key at ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const created = await createSigningKey();
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify({ createdAt: new Date().toISOString(), privateKeyJwk: created.privateKeyJwk }, null, 2)}\n`, 0o600);
  await chmod(path, 0o600);
  return created.material;
}
