<div align="center">

# Verifact

**Bind every claim to the exact bytes of its source, block hallucinations, and seal evidence anyone can verify.**

[![npm cli](https://img.shields.io/npm/v/@verifact/cli?label=%40verifact%2Fcli&color=black)](https://www.npmjs.com/package/@verifact/cli)
[![npm core](https://img.shields.io/npm/v/@verifact/core?label=%40verifact%2Fcore&color=black)](https://www.npmjs.com/package/@verifact/core)
[![npm react](https://img.shields.io/npm/v/@verifact/react?label=%40verifact%2Freact&color=black)](https://www.npmjs.com/package/@verifact/react)
[![CI](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml/badge.svg)](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-black.svg)](https://www.typescriptlang.org)

</div>


An AI summary says the invoice is **$6,200**. The invoice says **$62,000**. Before a human approves a payment, or an agent settles a contract, something has to catch that. Verifact is the evidence layer that does:

1. **Anchor.** Every claim cites a verbatim excerpt of a primary source (invoice, log, contract, IAM snapshot, wire feed). The excerpt is located to its exact **UTF-8 byte span** and the source is pinned by **SHA-256**.
2. **Ground.** The value is read out of those bytes and compared with what was claimed: `EXACT_GROUNDED`, `TOLERANCE_DRIFT`, `HALLUCINATED_VALUE`, `BROKEN_CITATION_SPAN` or `SOURCE_HASH_MISMATCH`. Nothing is guessed: no model is involved.
3. **Seal.** A grounded dossier is signed (ECDSA P-256) as an `epc_` certificate and appended to a hash-chained ledger. A blocked dossier cannot be sealed, and its values never reach the payload.

- 🧵 **Deterministic.** Same dossier, same result. No LLM, no network, no `eval`.
- 🪄 **Auto-ground.** Rewrite a hallucinated claim to the value in the source bytes, or refuse when the span is ambiguous.
- 🔗 **Tamper-evident.** Change one claim value or one source digest after signing and verification fails offline.
- 🔒 **Self-hosted, no lock-in.** MIT, plain files, no account, no telemetry.

## The Trust Trilogy

```
[ Verifact ]  ──epc_──▶  [ Assentra ]  ──tlm_──▶  [ Pactline ]
  Is the evidence true?       Did a human approve it?    Was it delivered and settled?
```

Verifact feeds verified values straight into [Assentra](https://github.com/isagarpinninti/assentra) workflow payloads and [Pactline](https://github.com/isagarpinninti/pactline) telemetry. The full chain is tested against the real published packages: see [docs/TRILOGY_BRIDGE.md](docs/TRILOGY_BRIDGE.md).

## Install

```bash
npm install -g @verifact/cli        # or run without installing: npx @verifact/cli <command>

npm install @verifact/core zod                                            # engine (zod 3.23+ or 4)
npm install @verifact/react @verifact/core lucide-react react react-dom   # UI primitives
```

Requires Node.js 20+.

## Quickstart (60 seconds)

```bash
npx @verifact/cli init my-evidence
cd my-evidence
npx @verifact/cli verify vendor_invoice_three_way_match --set c_amount=6200
# Vendor Invoice Three-Way Match  HALLUCINATION_BLOCKED  epistemic score 89/100
#   ✖ Invoice total (USD): claimed 6200 · source 62000  HALLUCINATED_VALUE [bytes 162..183]       (exit 2)
npx @verifact/cli verify vendor_invoice_three_way_match --set c_amount=6200 --auto-ground
# ✔ … VERIFIED_GROUNDED  epistemic score 100/100                                                   (exit 0)
npx @verifact/cli studio --open        # http://127.0.0.1:4319
```

New here? Follow the **[step-by-step guide](docs/GUIDE.md)**.

## Usage

**Terminal.**

```bash
verifact certify vendor_invoice_three_way_match --out invoice.epc.json
verifact cert verify invoice.epc.json --dossier vendor_invoice_three_way_match
verifact bridge assentra vendor_invoice_three_way_match      # grounded payload for Assentra
verifact bridge pactline vendor_invoice_three_way_match     # grounded telemetry for Pactline
verifact ledger verify
```

**Library.**

```ts
import { getDossierPack, pinSources, evaluateRequest, generateEpistemicCertificate, createSigningKey, verifyEpistemicCertificate } from "@verifact/core";

const dossier = await pinSources(getDossierPack("vendor_invoice_three_way_match")!);
const e = await evaluateRequest({ dossier, claimOverrides: { c_amount: 6200 }, autoGround: true });
e.evaluation.gateStatus;          // "VERIFIED_GROUNDED" after auto-grounding 6200 → 62000

const issuer = await createSigningKey();
const cert = await generateEpistemicCertificate({ dossier: e.dossier, evaluation: e.evaluation, issuerKey: issuer.material });
(await verifyEpistemicCertificate(cert.token)).ok;   // true
```

**React.** `PrimarySourceVault`, `ClaimSpanWeaveInspector`, `HallucinationGateCard` and `EpistemicSealInspector` from `@verifact/react`.

**HTTP.** `verifact studio`, then `POST /api/evaluate`, `/api/certify`, `/api/verify`, `/api/bridge`. See [docs/CLI_VERIFIER.md](docs/CLI_VERIFIER.md).

## Packages

| Package | Use it for |
|---|---|
| [`@verifact/cli`](packages/cli) | The `verifact` command, verifier server and self-hosted Provenance Studio |
| [`@verifact/core`](packages/core) | Dossier schema, byte-span matcher, claim grounding, auto-ground, `epc_` certificates, ledger chain, Assentra and Pactline bridges |
| [`@verifact/react`](packages/react) | Four UI primitives and a command bar, with a scoped stylesheet |

## How it works

```
 AI summary / vendor proposal                    primary sources (invoice, log, contract…)
        │ claims + verbatim citations                    │ SHA-256 pinned
        ▼                                                ▼
   locate excerpt → UTF-8 byte span → read value → compare   (EC-101 … EC-106)
        │
        ├─ any required claim not grounded ──▶ HALLUCINATION_BLOCKED  (nothing is sealed, payload is empty)
        └─ grounded ──▶ epc_ certificate (ECDSA P-256) ──▶ hash-chained ledger ──▶ Assentra / Pactline
```

A dossier is a JSON file: sources, claims, gate policy and bridge mappings. See [docs/PROVENANCE_SPEC.md](docs/PROVENANCE_SPEC.md).

## Documentation

- [Getting started guide](docs/GUIDE.md)
- [Provenance specification](docs/PROVENANCE_SPEC.md) · [Trilogy bridge](docs/TRILOGY_BRIDGE.md) · [CLI and verifier server](docs/CLI_VERIFIER.md)
- [Security model](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Publishing](docs/PUBLISHING.md)

## Security at a glance

- The server listens on `127.0.0.1` and **refuses a public address without authentication**.
- The issuer key lives in `.verifact/issuer-key.json` (mode `0600`, git-ignored). **Back it up**: it keeps old certificates verifiable.
- Concurrent certifications are serialised, so the ledger chain cannot fork. Webhooks to private addresses are blocked at connect time.
- A certificate proves **the claim matches the source bytes you gave it**. It does not prove the source itself is authentic: pin sources at capture and keep them in write-once storage.
- The Studio without a server is a browser-only demo and **not** a security boundary.

## Develop

```bash
git clone https://github.com/isagarpinninti/verifact && cd verifact
npm install
npm run ci            # build · lint · typecheck · tests · Studio export · smoke test of the packed tarballs
npm run dev:server    # example project API on :4319   (after `npm run build`)
npm run dev           # Studio dev server (proxies /api to :4319)
```

## License

MIT © [Sagar Pinninti](https://github.com/isagarpinninti)
