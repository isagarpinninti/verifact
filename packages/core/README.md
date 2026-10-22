# @verifact/core

[![npm](https://img.shields.io/npm/v/@verifact/core?label=%40verifact%2Fcore&color=black)](https://www.npmjs.com/package/@verifact/core)
[![CI](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml/badge.svg)](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-black.svg)](https://www.typescriptlang.org)

Framework-free provenance engine: dossier schema, UTF-8 byte-span matcher, deterministic claim grounding with hallucination and drift detection, auto-ground, ECDSA P-256 `epc_` certificates, a hash-chained ledger and bridges into Assentra and Pactline. Web Crypto only, so it runs on Node 20+ and in browsers.

Part of [Verifact](https://github.com/isagarpinninti/verifact): bind claims to primary-source bytes, block hallucinations, seal evidence. Docs: [guide](https://github.com/isagarpinninti/verifact/blob/main/docs/GUIDE.md) · [spec](https://github.com/isagarpinninti/verifact/blob/main/docs/PROVENANCE_SPEC.md) · [Trilogy bridge](https://github.com/isagarpinninti/verifact/blob/main/docs/TRILOGY_BRIDGE.md).

## Install

```bash
npm install @verifact/core zod      # zod ^3.23 or ^4 (peer dependency)
```

## Usage

```ts
import { getDossierPack, pinSources, evaluateRequest, generateEpistemicCertificate, createSigningKey,
         verifyEpistemicCertificate, bridgeToAssentraPayload, bridgeToPactlineTelemetry } from "@verifact/core";

const dossier = await pinSources(getDossierPack("vendor_invoice_three_way_match")!);

// The AI summary says $6,200; the invoice bytes say $62,000.
const blocked = await evaluateRequest({ dossier, claimOverrides: { c_amount: 6200 } });
blocked.evaluation.gateStatus;                       // "HALLUCINATION_BLOCKED" (EC-103)
blocked.evaluation.verifiedPayload;                  // {}  nothing may flow downstream

const fixed = await evaluateRequest({ dossier, claimOverrides: { c_amount: 6200 }, autoGround: true });
fixed.grounding?.changes;                            // [{ claimId: "c_amount", from: 6200, to: 62000 }]

const issuer = await createSigningKey();
const cert = await generateEpistemicCertificate({ dossier: fixed.dossier, evaluation: fixed.evaluation, issuerKey: issuer.material });
(await verifyEpistemicCertificate(cert.token)).ok;   // true

bridgeToAssentraPayload(cert.token).workflow;       // { workflowType: "vendor_payment", amountUsd: 62000, … }
bridgeToPactlineTelemetry(cert.token).values;      // { wires: 800, settlementSeconds: 90, uptimePct: 99.98 }
```

## What is inside
| Area | Exports |
|---|---|
| Dossier | `DossierSchema`, `validateDossier`, `DOSSIER_PACKS` (5 dossiers), `getDossierPack`, `pinSources`, `dossierFromMarkdown` |
| Grounding | `evaluateDossierProvenance`, `evaluateRequest`, `autoGroundClaims`, `resolveSourceSpan` (exact byte offsets) |
| Certificates | `generateEpistemicCertificate`, `verifyEpistemicCertificate`, `tamperEpistemicCertificate`, `decodeEpistemicCertificate` |
| Ledger | `buildLedgerRecord`, `verifyProvenanceLedger` |
| Bridges | `bridgeToAssentraPayload`, `bridgeToPactlineTelemetry` |

Checks: `EC-101` grounded · `EC-102` tolerance drift · `EC-103` hallucinated · `EC-104` broken citation · `EC-105` source hash mismatch · `EC-106` policy. A blocked dossier cannot be sealed. See the [specification](https://github.com/isagarpinninti/verifact/blob/main/docs/PROVENANCE_SPEC.md).

MIT © [Sagar Pinninti](https://github.com/isagarpinninti)
