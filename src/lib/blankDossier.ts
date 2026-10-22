import { DossierSchema, type ProvenanceDossier } from "@verifact/core";

export function blankDossier(id: string, name = "New dossier"): ProvenanceDossier {
  return DossierSchema.parse({
    id,
    name,
    version: "1.0.0",
    category: "Procurement",
    description: "",
    sources: [{ id: "source1", title: "Primary source", sourceType: "invoice_ledger", capturedAtIso: new Date().toISOString(), content: "INVOICE INV-1\nTotal Due: $1,000.00\n" }],
    claims: [{ id: "c_total", label: "Invoice total (USD)", fieldKey: "amountUsd", valueType: "number", claimedValue: 1000, citation: { sourceId: "source1", excerpt: "Total Due: $1,000.00", valueAfter: "Total Due:", required: true } }],
  });
}
