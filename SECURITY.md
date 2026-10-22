# Security policy

## Reporting a vulnerability
Please report suspected vulnerabilities privately via GitHub Security Advisories: <https://github.com/isagarpinninti/verifact/security/advisories/new>. Do not open public issues for security reports. We aim to acknowledge reports within 3 business days.

## What a certificate proves
An `epc_` certificate proves that, for the source bytes supplied at certification time, every certified claim equals the value in those bytes, and that the issuer signed that statement. It does **not** prove the source documents are authentic. Capture and pin sources at the system of record, and keep them in write-once storage.

## Threat model (v0.1)
- **Server mode** (`verifact studio`): the server evaluates, signs and appends to a hash-chained ledger. Without auth it listens on loopback only and trusts anyone who can reach it.
- **Serialised certification.** `evaluate → seal → ledger append` is atomic within a process, so concurrent requests cannot fork the chain. Running several instances needs a shared ledger and lock.
- **Issuer trust.** `verifyEpistemicCertificate` validates the signature against the key embedded in the certificate. Pass an `issuerRegistry` (or use `trustedIssuers`) to decide whether you trust that issuer; otherwise a forger can sign their own certificate with their own key.
- **Local demo mode** (static Studio, no server) runs everything in the browser and is **not** a security boundary.
- The ledger detects edits, reordering and substitution of past records, but a party with write access to the project directory can delete the whole file or the issuer key.
- Anyone holding `.verifact/issuer-key.json` can forge certificates. It is created with mode `0600`; protect and back it up.
- Webhook targets are restricted to public addresses by default. The check covers IPv4-mapped and NAT64 IPv6 forms and is repeated inside the socket's own DNS lookup at connect time (no DNS-rebinding window).
- Dossier excerpts and markers are literal strings. No regular expression or expression from a dossier is ever evaluated.

## Known limits
- Value extraction is deterministic but heuristic for free text: a span with several numbers and no `valueAfter` marker is flagged `ambiguous` and never auto-grounded.
- The first occurrence of an excerpt is used; repeated excerpts are reported, not disambiguated.
- Signatures prove integrity under a key. They are not an identity proof until that key is bound to a party you trust.
