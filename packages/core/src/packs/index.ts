import { DossierSchema, type ProvenanceDossier, type ProvenanceDossierInput } from "../schemas/dossier";

const TS = "2026-10-14T09:12:41Z";

const vendorInvoice: ProvenanceDossierInput = {
  id: "vendor_invoice_three_way_match",
  name: "Vendor Invoice Three-Way Match",
  version: "1.0.0",
  category: "FinOps",
  description: "Binds an AI payment summary to the invoice, purchase order and treasury wire feed. Feeds Assentra vendor_payment and Pactline fintech_wire_clearing_rail.",
  targetBridge: {
    assentraWorkflowId: "vendor_payment",
    pactlineContractId: "fintech_wire_clearing_rail",
    fieldMappings: { c_vendor: "vendorName", c_amount: "amountUsd", c_risk: "vendorRisk", c_method: "paymentMethod", c_match: "threeWayMatch" },
    telemetryMappings: { c_wires: "wires", c_settle: "settlementSeconds", c_uptime: "uptimePct" },
  },
  sources: [
    { id: "invoice", title: "Vendor invoice INV-2291", sourceType: "invoice_ledger", capturedAtIso: TS, content: "INVOICE INV-2291\nVendor: Globex Supplies\nPO Reference: PO-88120\nLine 1: GPU rack hardware x4 ........ $60,500.00\nLine 2: Freight and insurance ........ $1,500.00\nTotal Due: $62,000.00\n" },
    { id: "po", title: "Purchase order PO-88120", sourceType: "signed_contract", capturedAtIso: TS, content: "PURCHASE ORDER PO-88120\nVendor: Globex Supplies\nApproved Amount: $62,000.00\nTerms: net30\n" },
    { id: "wire", title: "Treasury wire request and rail telemetry", sourceType: "bank_wire_feed", capturedAtIso: TS, content: "WIRE-REQ-5530 | Beneficiary: Globex Supplies | Method: wire | Vendor Risk Rating: high | Three-way match: true\nRail telemetry window 2026-10-14\nWires cleared: 800\nSettlement time: 90 s\nRail uptime: 99.98%\n" },
  ],
  claims: [
    { id: "c_vendor", label: "Vendor", fieldKey: "vendorName", valueType: "string", claimedValue: "Globex Supplies", citation: { sourceId: "invoice", excerpt: "Vendor: Globex Supplies", valueAfter: "Vendor:", required: true } },
    { id: "c_amount", label: "Invoice total (USD)", fieldKey: "amountUsd", valueType: "number", claimedValue: 62000, citation: { sourceId: "invoice", excerpt: "Total Due: $62,000.00", valueAfter: "Total Due:", required: true } },
    { id: "c_po", label: "PO approved amount (USD)", fieldKey: "poAmountUsd", valueType: "number", claimedValue: 62000, citation: { sourceId: "po", excerpt: "Approved Amount: $62,000.00", valueAfter: "Approved Amount:", required: true } },
    { id: "c_risk", label: "Vendor risk tier", fieldKey: "vendorRisk", valueType: "string", claimedValue: "high", citation: { sourceId: "wire", excerpt: "Vendor Risk Rating: high", valueAfter: "Vendor Risk Rating:", required: true } },
    { id: "c_method", label: "Payment method", fieldKey: "paymentMethod", valueType: "string", claimedValue: "wire", citation: { sourceId: "wire", excerpt: "Method: wire", valueAfter: "Method:", required: true } },
    { id: "c_match", label: "Three-way match", fieldKey: "threeWayMatch", valueType: "boolean", claimedValue: true, citation: { sourceId: "wire", excerpt: "Three-way match: true", valueAfter: "Three-way match:", required: true } },
    { id: "c_wires", label: "Wires cleared", fieldKey: "wires", valueType: "number", claimedValue: 800, citation: { sourceId: "wire", excerpt: "Wires cleared: 800", valueAfter: "Wires cleared:", required: true } },
    { id: "c_settle", label: "Settlement time (s)", fieldKey: "settlementSeconds", valueType: "number", claimedValue: 90, citation: { sourceId: "wire", excerpt: "Settlement time: 90 s", valueAfter: "Settlement time:", required: true } },
    { id: "c_uptime", label: "Rail uptime (%)", fieldKey: "uptimePct", valueType: "number", claimedValue: 99.98, citation: { sourceId: "wire", excerpt: "Rail uptime: 99.98%", valueAfter: "Rail uptime:", tolerancePct: 0.05, required: true } },
  ],
  policies: { minEpistemicScore: 100, allowWithinTolerance: true, requireAllSourcesHashed: false },
};

const p1Incident: ProvenanceDossierInput = {
  id: "p1_incident_root_cause_telemetry",
  name: "P1 Incident Root-Cause Telemetry",
  version: "1.0.0",
  category: "SRE",
  description: "Verifies an AI incident summary against the Prometheus alert export and the approved runbook. Feeds Assentra p1_traffic_failover.",
  targetBridge: {
    assentraWorkflowId: "p1_traffic_failover",
    fieldMappings: { c_incident: "incidentId", c_service: "affectedService", c_rpo: "maxAllowedDataLossSec", c_strategy: "strategy", c_status: "notifyStatusPage" },
  },
  sources: [
    { id: "alerts", title: "Alertmanager and Prometheus export", sourceType: "prometheus_log", capturedAtIso: TS, content: `# alertmanager export\nALERT HighErrorRate firing incident=INC-4821 service=checkout-api region=eu-central-1\nts=${TS} rpo_budget_seconds{service="checkout-api"} 5\nts=${TS} replication_lag_seconds{service="checkout-api"} 12\nts=${TS} error_rate_ratio{service="checkout-api"} 0.37\nstatus_page_notified: true\n` },
    { id: "runbook", title: "Runbook RB-17", sourceType: "signed_contract", capturedAtIso: TS, content: "RUNBOOK RB-17\nApproved strategy: multi_region_drain\nOwner: SRE on-call\n" },
  ],
  claims: [
    { id: "c_incident", label: "Incident id", fieldKey: "incidentId", valueType: "string", claimedValue: "INC-4821", citation: { sourceId: "alerts", excerpt: "incident=INC-4821 service=checkout-api", valueAfter: "incident=", valueEnd: " ", required: true } },
    { id: "c_service", label: "Affected service", fieldKey: "affectedService", valueType: "string", claimedValue: "checkout-api", citation: { sourceId: "alerts", excerpt: "service=checkout-api region=eu-central-1", valueAfter: "service=", valueEnd: " ", required: true } },
    { id: "c_rpo", label: "Max allowed data loss (s)", fieldKey: "maxAllowedDataLossSec", valueType: "number", claimedValue: 5, citation: { sourceId: "alerts", excerpt: 'rpo_budget_seconds{service="checkout-api"} 5', valueAfter: 'rpo_budget_seconds{service="checkout-api"}', required: true } },
    { id: "c_lag", label: "Replication lag (s)", fieldKey: "replicationLagSec", valueType: "number", claimedValue: 12, citation: { sourceId: "alerts", excerpt: 'replication_lag_seconds{service="checkout-api"} 12', valueAfter: 'replication_lag_seconds{service="checkout-api"}', required: true } },
    { id: "c_strategy", label: "Approved strategy", fieldKey: "strategy", valueType: "string", claimedValue: "multi_region_drain", citation: { sourceId: "runbook", excerpt: "Approved strategy: multi_region_drain", valueAfter: "Approved strategy:", required: true } },
    { id: "c_status", label: "Status page notified", fieldKey: "notifyStatusPage", valueType: "boolean", claimedValue: true, citation: { sourceId: "alerts", excerpt: "status_page_notified: true", valueAfter: "status_page_notified:", required: true } },
  ],
  policies: { minEpistemicScore: 100, allowWithinTolerance: false, requireAllSourcesHashed: false },
};

const gpuQuote: ProvenanceDossierInput = {
  id: "gpu_cluster_quote_attestation",
  name: "GPU Cluster Quote Attestation",
  version: "1.0.0",
  category: "Procurement",
  description: "Verifies a vendor GPU quote and benchmark log, including the GDPR residency attestation. Feeds Assentra gpu_cluster_provisioning and Pactline b2b_gpu_burst_lease.",
  targetBridge: {
    assentraWorkflowId: "gpu_cluster_provisioning",
    pactlineContractId: "b2b_gpu_burst_lease",
    fieldMappings: { c_region: "region", c_model: "gpuModel", c_nodes: "nodeCount", c_residency: "dataResidencyStrict", c_ttl: "autoTerminateHours" },
    telemetryMappings: { c_gpuhours: "gpuHours", c_p95: "p95LatencyMs", c_queue: "queueDepth" },
  },
  sources: [
    { id: "quote", title: "Signed vendor quote Q-7731", sourceType: "signed_contract", capturedAtIso: TS, content: "QUOTE Q-7731 (signed)\nGPU Model: H100_80GB\nNodes: 8\nRegion: eu-central-1\nHourly Rate: $3.20 per GPU-hour\nAuto-terminate: 72 hours\nGDPR Data Residency Attestation: true\nReserved GPU-hours: 120\n" },
    { id: "bench", title: "Vendor benchmark log", sourceType: "prometheus_log", capturedAtIso: TS, content: "ts=2026-10-14T10:00:00Z p95_latency_ms 180\nts=2026-10-14T10:00:00Z queue_depth 12\n" },
  ],
  claims: [
    { id: "c_model", label: "GPU model", fieldKey: "gpuModel", valueType: "string", claimedValue: "H100_80GB", citation: { sourceId: "quote", excerpt: "GPU Model: H100_80GB", valueAfter: "GPU Model:", required: true } },
    { id: "c_nodes", label: "Node count", fieldKey: "nodeCount", valueType: "number", claimedValue: 8, citation: { sourceId: "quote", excerpt: "Nodes: 8", valueAfter: "Nodes:", required: true } },
    { id: "c_region", label: "Region", fieldKey: "region", valueType: "string", claimedValue: "eu-central-1", citation: { sourceId: "quote", excerpt: "Region: eu-central-1", valueAfter: "Region:", required: true } },
    { id: "c_rate", label: "Hourly rate (USD / GPU-hour)", fieldKey: "hourlyRateUsd", valueType: "number", claimedValue: 3.2, citation: { sourceId: "quote", excerpt: "Hourly Rate: $3.20 per GPU-hour", valueAfter: "Hourly Rate:", required: true } },
    { id: "c_ttl", label: "Auto-terminate (hours)", fieldKey: "autoTerminateHours", valueType: "number", claimedValue: 72, citation: { sourceId: "quote", excerpt: "Auto-terminate: 72 hours", valueAfter: "Auto-terminate:", required: true } },
    { id: "c_residency", label: "GDPR residency attested", fieldKey: "dataResidencyStrict", valueType: "boolean", claimedValue: true, citation: { sourceId: "quote", excerpt: "GDPR Data Residency Attestation: true", valueAfter: "GDPR Data Residency Attestation:", required: true } },
    { id: "c_gpuhours", label: "Reserved GPU-hours", fieldKey: "gpuHours", valueType: "number", claimedValue: 120, citation: { sourceId: "quote", excerpt: "Reserved GPU-hours: 120", valueAfter: "Reserved GPU-hours:", required: true } },
    { id: "c_p95", label: "p95 latency (ms)", fieldKey: "p95LatencyMs", valueType: "number", claimedValue: 180, citation: { sourceId: "bench", excerpt: "p95_latency_ms 180", valueAfter: "p95_latency_ms", required: true } },
    { id: "c_queue", label: "Queue depth", fieldKey: "queueDepth", valueType: "number", claimedValue: 12, citation: { sourceId: "bench", excerpt: "queue_depth 12", valueAfter: "queue_depth", required: true } },
  ],
  policies: { minEpistemicScore: 100, allowWithinTolerance: true, requireAllSourcesHashed: false },
};

const soc2: ProvenanceDossierInput = {
  id: "soc2_security_audit_evidence",
  name: "SOC 2 Security Audit Evidence",
  version: "1.0.0",
  category: "SecOps",
  description: "Verifies IAM clearance and hardware-MFA evidence plus a threat-feed delivery log. Feeds Assentra zero_trust_onboarding and Pactline secops_threat_feed_exchange.",
  targetBridge: {
    assentraWorkflowId: "zero_trust_onboarding",
    pactlineContractId: "secops_threat_feed_exchange",
    fieldMappings: { c_name: "engineerName", c_tier: "hardwareTier", c_proddb: "prodDatabaseAccess", c_role: "awsIamRole", c_yubikey: "yubikeyHardwareMfa" },
    telemetryMappings: { c_indicators: "indicators", c_fresh: "freshnessSec", c_fp: "falsePositivePct" },
  },
  sources: [
    { id: "iam", title: "IAM snapshot 2026-10-14", sourceType: "iam_snapshot", capturedAtIso: TS, content: "IAM SNAPSHOT 2026-10-14\nprincipal: Ananya\nrole: PowerUser\nhardware_tier: MacBook_Pro_M4_Max\nprod_db_access: false\nyubikey_mfa: true\n" },
    { id: "feed", title: "Threat-feed delivery log", sourceType: "prometheus_log", capturedAtIso: TS, content: "ts=2026-10-14T11:00:00Z indicators_delivered 250000\nts=2026-10-14T11:00:00Z feed_freshness_seconds 45\nts=2026-10-14T11:00:00Z false_positive_pct 0.8\n" },
  ],
  claims: [
    { id: "c_name", label: "Engineer", fieldKey: "engineerName", valueType: "string", claimedValue: "Ananya", citation: { sourceId: "iam", excerpt: "principal: Ananya", valueAfter: "principal:", required: true } },
    { id: "c_role", label: "AWS IAM role", fieldKey: "awsIamRole", valueType: "string", claimedValue: "PowerUser", citation: { sourceId: "iam", excerpt: "role: PowerUser", valueAfter: "role:", required: true } },
    { id: "c_tier", label: "Hardware tier", fieldKey: "hardwareTier", valueType: "string", claimedValue: "MacBook_Pro_M4_Max", citation: { sourceId: "iam", excerpt: "hardware_tier: MacBook_Pro_M4_Max", valueAfter: "hardware_tier:", required: true } },
    { id: "c_proddb", label: "Production DB access", fieldKey: "prodDatabaseAccess", valueType: "boolean", claimedValue: false, citation: { sourceId: "iam", excerpt: "prod_db_access: false", valueAfter: "prod_db_access:", required: true } },
    { id: "c_yubikey", label: "YubiKey hardware MFA", fieldKey: "yubikeyHardwareMfa", valueType: "boolean", claimedValue: true, citation: { sourceId: "iam", excerpt: "yubikey_mfa: true", valueAfter: "yubikey_mfa:", required: true } },
    { id: "c_indicators", label: "Indicators delivered", fieldKey: "indicators", valueType: "number", claimedValue: 250000, citation: { sourceId: "feed", excerpt: "indicators_delivered 250000", valueAfter: "indicators_delivered", required: true } },
    { id: "c_fresh", label: "Feed freshness (s)", fieldKey: "freshnessSec", valueType: "number", claimedValue: 45, citation: { sourceId: "feed", excerpt: "feed_freshness_seconds 45", valueAfter: "feed_freshness_seconds", required: true } },
    { id: "c_fp", label: "False positives (%)", fieldKey: "falsePositivePct", valueType: "number", claimedValue: 0.8, citation: { sourceId: "feed", excerpt: "false_positive_pct 0.8", valueAfter: "false_positive_pct", required: true } },
  ],
  policies: { minEpistemicScore: 100, allowWithinTolerance: false, requireAllSourcesHashed: false },
};

const saasArr: ProvenanceDossierInput = {
  id: "saas_discount_arr_verification",
  name: "SaaS Discount and ARR Verification",
  version: "1.0.0",
  category: "Sales",
  description: "Verifies a deal summary against the CRM order form and the usage log. Feeds Assentra discount_approval and Pactline autonomous_data_enrichment_api.",
  targetBridge: {
    assentraWorkflowId: "discount_approval",
    pactlineContractId: "autonomous_data_enrichment_api",
    fieldMappings: { c_account: "accountName", c_list: "listPriceUsd", c_discount: "discountPct", c_term: "termMonths", c_terms: "paymentTerms", c_sponsor: "executiveSponsor" },
    telemetryMappings: { c_units: "enrichmentUnits", c_latency: "avgLatencyMs", c_errors: "errors" },
  },
  sources: [
    { id: "crm", title: "CRM order form OF-4410", sourceType: "signed_contract", capturedAtIso: TS, content: "ORDER FORM OF-4410\nAccount: Acme\nList Price (ARR): $240,000\nDiscount: 20%\nTerm: 36 months\nPayment Terms: net60\nExecutive Sponsor: true\n" },
    { id: "usage", title: "Enrichment API usage log", sourceType: "prometheus_log", capturedAtIso: TS, content: "ts=2026-10-14T12:00:00Z enrichment_units 22500\nts=2026-10-14T12:00:00Z avg_latency_ms 220\nts=2026-10-14T12:00:00Z errors 40\n" },
  ],
  claims: [
    { id: "c_account", label: "Account", fieldKey: "accountName", valueType: "string", claimedValue: "Acme", citation: { sourceId: "crm", excerpt: "Account: Acme", valueAfter: "Account:", required: true } },
    { id: "c_list", label: "List price / ARR (USD)", fieldKey: "listPriceUsd", valueType: "number", claimedValue: 240000, citation: { sourceId: "crm", excerpt: "List Price (ARR): $240,000", valueAfter: "List Price (ARR):", tolerancePct: 1, required: true } },
    { id: "c_discount", label: "Discount (%)", fieldKey: "discountPct", valueType: "number", claimedValue: 20, citation: { sourceId: "crm", excerpt: "Discount: 20%", valueAfter: "Discount:", required: true } },
    { id: "c_term", label: "Term (months)", fieldKey: "termMonths", valueType: "string", claimedValue: "36", citation: { sourceId: "crm", excerpt: "Term: 36 months", valueAfter: "Term:", valueEnd: " months", required: true } },
    { id: "c_terms", label: "Payment terms", fieldKey: "paymentTerms", valueType: "string", claimedValue: "net60", citation: { sourceId: "crm", excerpt: "Payment Terms: net60", valueAfter: "Payment Terms:", required: true } },
    { id: "c_sponsor", label: "Executive sponsor", fieldKey: "executiveSponsor", valueType: "boolean", claimedValue: true, citation: { sourceId: "crm", excerpt: "Executive Sponsor: true", valueAfter: "Executive Sponsor:", required: true } },
    { id: "c_units", label: "Enrichment units", fieldKey: "enrichmentUnits", valueType: "number", claimedValue: 22500, citation: { sourceId: "usage", excerpt: "enrichment_units 22500", valueAfter: "enrichment_units", required: true } },
    { id: "c_latency", label: "Avg latency (ms)", fieldKey: "avgLatencyMs", valueType: "number", claimedValue: 220, citation: { sourceId: "usage", excerpt: "avg_latency_ms 220", valueAfter: "avg_latency_ms", required: true } },
    { id: "c_errors", label: "Failed calls", fieldKey: "errors", valueType: "number", claimedValue: 40, citation: { sourceId: "usage", excerpt: "errors 40", valueAfter: "errors", required: true } },
  ],
  policies: { minEpistemicScore: 100, allowWithinTolerance: true, requireAllSourcesHashed: false },
};

export const DOSSIER_PACKS: readonly ProvenanceDossier[] = [vendorInvoice, p1Incident, gpuQuote, soc2, saasArr].map((d) => DossierSchema.parse(d));

export function getDossierPack(id: string): ProvenanceDossier | undefined {
  return DOSSIER_PACKS.find((d) => d.id === id);
}
