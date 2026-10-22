# Changelog

## 0.1.0: Initial release

- `@verifact/core`: dossier schema (Zod 3 and 4), five example dossiers, UTF-8 byte-span matcher, deterministic claim grounding with checks EC-101…EC-106, auto-ground, `epc_` ECDSA P-256 certificates with offline verification and tamper helpers, hash-chained provenance ledger, Markdown importer, and bridges into Assentra workflow payloads and Pactline telemetry. Tested end to end against the real `@assentra/server` and `@pactline/core`.
- `@verifact/react`: `PrimarySourceVault`, `ClaimSpanWeaveInspector`, `HallucinationGateCard`, `EpistemicSealInspector`, `CommandPalette` and a scoped stylesheet.
- `@verifact/cli`: `init`, `validate`, `verify`, `certify`, `pin`, `studio`, `ledger`, `cert`, `bridge`, `key`, `auth`; verifier HTTP API with serialised certification, SSRF-guarded webhooks, bearer auth and rate limiting.
- Self-hosted Provenance Studio: Truth Workbench, Dossier Studio with simulator dock, Provenance Ledger, Trilogy Bridge, Settings; server mode and browser-only demo.
