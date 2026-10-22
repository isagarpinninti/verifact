# The Trust Trilogy

Three independent open-source layers, one chain of evidence:

```
[ Verifact ] ──epc_──▶ [ Assentra ] ──tlm_──▶ [ Pactline ]
  source → claim             human → agent            agent ↔ agent
```

Each layer works alone. Together, a number that a human approves and an agent pays is provably the number in the source document.

## Layer 1 → 2: evidence into a Assentra workflow

```bash
verifact bridge assentra vendor_invoice_three_way_match --json
```

```json
{ "workflowType": "vendor_payment", "vendorName": "Globex Supplies", "amountUsd": 62000, "vendorRisk": "high", "paymentMethod": "wire", "threeWayMatch": true }
```

In code:

```ts
import { bridgeToAssentraPayload } from "@verifact/core";
import { defaultCatalog, PERSONAS } from "@assentra/server";

const { workflow } = bridgeToAssentraPayload(cert.token);
const spec = defaultCatalog.compile(defaultCatalog.schema.parse(workflow), PERSONAS.VP_Infrastructure, {});
// a human approves the surface; Assentra issues the cas_ / tlm_ seal
```

Only claims the certificate vouches for are mapped, and each value is the **source** value. A dossier the gate blocked produces no certificate and no payload. Fields the human must decide (for example `dualControl`) are deliberately left out of the evidence.

## Layer 1 → 3: evidence into Pactline telemetry

```bash
verifact bridge pactline vendor_invoice_three_way_match
# { "wires": 800, "settlementSeconds": 90, "uptimePct": 99.98 }
```

```ts
import { bridgeToPactlineTelemetry } from "@verifact/core";
const t = bridgeToPactlineTelemetry(cert.token);        // { contractId: "fintech_wire_clearing_rail", values: {…} }
evaluatePactExecution({ contract: getPack(t.contractId)!, values: t.values, authority, nowEpoch });
```

The telemetry is evidence-backed: the numbers the pact meters are the numbers in the provider's own log.

## The full chain, tested

`packages/core/test/core.test.ts` ("Trust Trilogy") runs this against the real published `@assentra/server` and `@pactline/core`:

1. **Verifact.** An AI summary claims `$6,200`; the invoice bytes say `$62,000`. EC-103 blocks it, `autoGroundClaims` restores `$62,000` from bytes `162..183` of the invoice, and an `epc_` certificate is sealed.
2. **Assentra.** The bridged payload compiles in the `vendor_payment` workflow. Assentra auto-requires dual control (SOX-14, over $50k); a Staff Lead with a $15k limit is blocked, a VP is cleared. A `tlm_` Action Seal with `approvalSpendUsd = 62000` is issued.
3. **Pactline.** The gateway verifies the `tlm_` seal (cap locked to **$62,000**, scope `vendor_payment`), meters the telemetry from stage 1 against a wire-clearing pact, and issues a dual-signed `vpt_` settlement that verifies offline.

Note the scope: Assentra's `workflowType` becomes the Pactline token scope, so the pact's `requiredScope` must be `vendor_payment` (the test sets this on a copy of the built-in `fintech_wire_clearing_rail`, whose default scope is `wire_clearing`).

## Wiring it in production

- Run `verifact certify` (or `POST /api/certify`) where the AI summary is produced; store the `epc_` token beside the summary.
- In your Assentra approval flow, build the workflow payload with `bridgeToAssentraPayload` and refuse to open an approval surface without a verifying certificate.
- Feed Pactline meters from `bridgeToPactlineTelemetry` instead of self-reported numbers.
- Register the issuer: other systems verify with `verifyEpistemicCertificate(token, { issuerRegistry })`, so share the issuer public key (`verifact key show`).
