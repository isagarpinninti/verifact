# Verifact provenance specification (v1)

Everything here is implemented in `@verifact/core` and covered by tests.

## 1. Dossier

A dossier is a JSON document validated by `DossierSchema` and cross-checked by `validateDossier`.

| Key | Meaning |
|---|---|
| `id`, `name`, `version`, `category`, `description` | Identity. `id` is `[a-z][a-z0-9_]{1,63}` and must equal the file name `dossiers/<id>.json`. Categories: `FinOps`, `SecOps`, `SRE`, `Procurement`, `Sales`. |
| `sources[]` | Primary source documents: `{ id, title, sourceType, capturedAtIso, content, expectedSha256? }`. Types: `invoice_ledger`, `prometheus_log`, `signed_contract`, `iam_snapshot`, `bank_wire_feed`. |
| `claims[]` | Assertions to verify: `{ id, label, fieldKey, valueType, claimedValue, citation }`. |
| `claims[].citation` | `{ sourceId, excerpt, required, tolerancePct?, valueAfter?, valueEnd? }`. |
| `policies` | `{ minEpistemicScore (default 100), allowWithinTolerance (default true), requireAllSourcesHashed (default false) }`. |
| `targetBridge` | `{ assentraWorkflowId?, pactlineContractId?, fieldMappings, telemetryMappings? }` (section 6). |

`expectedSha256` is the pin: SHA-256 (hex) of the UTF-8 bytes of `content`. `pinSources` computes it; `verifact init` writes pinned dossiers.

## 2. Byte spans

`resolveSourceSpan(content, excerpt)` finds the first occurrence of the excerpt and reports `startChar/endChar` (UTF-16 indices) and `startByte/endByte` (**UTF-8** offsets). More than one occurrence is reported (`occurrences`), never guessed; `validateDossier` warns about it. A multi-byte character (for example `€`, 3 bytes) shifts byte offsets from character offsets, and the offsets are exact.

## 3. Reading the ground-truth value

The value is read from **inside the cited excerpt**, deterministically. No regular expression from the dossier is ever evaluated.

| Type | Rule |
|---|---|
| `number` | With `valueAfter`: the first number after that literal marker. Without it: the only number in the excerpt; with several, the one equal to the claim, else the nearest (flagged `ambiguous`). Understands `$`, thousands commas, `%`, `k`/`m` suffixes; hyphenated ids such as `INV-2291` are not numbers. |
| `string` | With `valueAfter`: the text after the marker up to `valueEnd`, else up to `\|`, `,`, `;` or a line break. Without it: the claimed text must appear verbatim in the excerpt. |
| `boolean` | `true/yes/enabled/pass/passed/compliant` and `false/no/disabled/fail/failed/non-compliant`, read after `valueAfter` or as the only such word in the excerpt. |

## 4. Statuses and checks

| Status | Check | Meaning |
|---|---|---|
| `EXACT_GROUNDED` | EC-101 | The claimed value equals the source value. |
| `TOLERANCE_DRIFT` | EC-102 | A number differs from the source by at most `tolerancePct`. |
| `HALLUCINATED_VALUE` | EC-103 | The claim differs from the source (or the span holds nothing to ground it). |
| `BROKEN_CITATION_SPAN` | EC-104 | The excerpt, its `valueAfter` marker or its source does not exist. |
| `SOURCE_HASH_MISMATCH` | EC-105 | A pinned source no longer hashes to its pin. Every claim citing it is blocked. |
| (policy) | EC-106 | Score below `minEpistemicScore`, or an unpinned source when `requireAllSourcesHashed`. |

**Score** = `round(100 × Σ weight / N)`; weight is 1 for `EXACT_GROUNDED`, 1 for `TOLERANCE_DRIFT` when `allowWithinTolerance`, otherwise 0.

**Gate.** `HALLUCINATION_BLOCKED` when any check blocks: a *required* claim is hallucinated/broken/hash-mismatched, drift occurs with `allowWithinTolerance: false`, or EC-106 fails. Otherwise `DRIFT_WARNING` when any drift or warning exists, else `VERIFIED_GROUNDED`. Claims with `required: false` only warn and never reach the payload.

**`verifiedPayload`** is `{ fieldKey: sourceValue }` for grounded claims, always the **source** value (never the summary's). It is **empty when the gate is blocked**, so a blocked dossier cannot feed a downstream layer.

## 5. Auto-ground

`autoGroundClaims` rewrites `HALLUCINATED_VALUE` and `TOLERANCE_DRIFT` claims to the source value. It never invents anything: claims with a broken citation, a changed source, no groundable value, or an **ambiguous** span are left alone and reported. Pin the choice with `valueAfter` to make an ambiguous claim groundable.

## 6. `epc_` certificate

```
epc_<base64url(canonical payload)>.<base64url(ECDSA P-256 / SHA-256 signature, raw r‖s)>
certificateId = "epc_" + sha256(canonical payload)[0..8] + signatureHex[0..8]
```

The payload holds the dossier id/version/hash, `sourceHashes`, `verifiedClaims` (with byte spans), `verifiedPayload`, the bridge mappings, score, gate status, timestamp, nonce, and the issuer's fingerprint and public key. A blocked evaluation is **never sealed**.

`verifyEpistemicCertificate` checks, offline: canonical form; the signature and that the key matches its fingerprint; that every certified claim is grounded and equals the payload value, with no unsupported field; the gate is not blocked; and, if you supply sources, that each hashes to its certified digest. Pass an `issuerRegistry` to learn whether the issuer is one you trust.

**Bridge mappings.** `fieldMappings` maps claim id → Assentra workflow field; `telemetryMappings` maps claim id → Pactline telemetry field and falls back to `fieldMappings`.

## 7. Ledger

JSONL, one record per certificate:

```
chainHash = SHA-256( prevHash | certificateId | dossierId | stateHashSha256 | signatureHex )
```

The first `prevHash` is 64 zeros. `verifyProvenanceLedger` checks sequence, linkage, each chain hash, that summary fields (score, gate, claim counts…) match the embedded certificate, and each certificate's signature. It reports the first broken record.

## 8. What it does not prove

A certificate proves the claim matches **the source bytes you supplied**. It does not prove those bytes are authentic: capture and pin sources at the system of record, and keep them in write-once storage. Someone with write access to the project can delete the ledger or the issuer key.
