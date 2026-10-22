import type { ProvenanceDossier } from "@verifact/core";

export interface SdkSnippets {
  install: string;
  core: string;
  assentra: string;
  pactline: string;
  cli: string;
  curl: string;
  dossier: string;
}

export function buildSdkSnippets(d: ProvenanceDossier): SdkSnippets {
  const wf = d.targetBridge.assentraWorkflowId ?? "vendor_payment";
  const pact = d.targetBridge.pactlineContractId ?? "fintech_wire_clearing_rail";
  return {
    dossier: JSON.stringify(d, null, 2),
    install: `# the verifier + CLI\nnpx @verifact/cli init my-evidence && cd my-evidence\nnpx @verifact/cli validate\nnpx @verifact/cli studio --open\n\n# in your own app\nnpm install @verifact/core zod\nnpm install @verifact/react @verifact/core lucide-react react react-dom`,
    core: `import { getDossierPack, pinSources, evaluateRequest, generateEpistemicCertificate, createSigningKey, verifyEpistemicCertificate } from "@verifact/core";\n\nconst dossier = await pinSources(getDossierPack("${d.id}")!);\n\n// an AI summary asserted something the primary source does not say\nconst e = await evaluateRequest({ dossier, claimOverrides: { ${d.claims[0]?.id ?? "c_amount"}: 6200 }, autoGround: true });\nconsole.log(e.evaluation.gateStatus, e.grounding?.changes);\n\nconst issuer = await createSigningKey();\nconst cert = await generateEpistemicCertificate({ dossier: e.dossier, evaluation: e.evaluation, issuerKey: issuer.material });\nconsole.log(cert.certificateId, (await verifyEpistemicCertificate(cert.token)).ok);`,
    assentra: `import { bridgeToAssentraPayload } from "@verifact/core";\nimport { defaultCatalog, PERSONAS } from "@assentra/server";\n\n// Layer 1 → Layer 2: verified evidence becomes the workflow payload\nconst { workflow } = bridgeToAssentraPayload(cert.token);   // workflowType "${wf}"\nconst payload = defaultCatalog.schema.parse(workflow);\nconst spec = defaultCatalog.compile(payload, PERSONAS.VP_Infrastructure, {});\n// a human then approves the surface and Assentra issues the cas_ / tlm_ seal`,
    pactline: `import { bridgeToPactlineTelemetry } from "@verifact/core";\nimport { getPack, evaluatePactExecution } from "@pactline/core";\n\n// Layer 1 → Layer 3: verified telemetry meters the pact\nconst t = bridgeToPactlineTelemetry(cert.token);          // contract "${pact}"\nconst result = evaluatePactExecution({ contract: getPack(t.contractId)!, values: t.values, authority, nowEpoch });`,
    cli: `verifact verify ${d.id}                                  # exit 0 grounded · 2 blocked\nverifact verify ${d.id} --set ${d.claims[0]?.id ?? "c_amount"}=6200 --auto-ground\nverifact certify ${d.id} --out evidence.epc.json\nverifact cert verify evidence.epc.json --dossier ${d.id}\nverifact bridge assentra ${d.id} --json | assentra compile ${wf} --payload -\nverifact bridge pactline ${d.id}\nverifact ledger verify`,
    curl: `curl -s http://127.0.0.1:4319/api/evaluate -H 'content-type: application/json' -d '${JSON.stringify({ dossierId: d.id, claimOverrides: { [d.claims[0]?.id ?? "c_amount"]: 6200 } })}'\ncurl -s http://127.0.0.1:4319/api/certify  -H 'content-type: application/json' -d '${JSON.stringify({ dossierId: d.id, autoGround: true })}'\ncurl -s http://127.0.0.1:4319/api/verify   -H 'content-type: application/json' -d '{"token":"epc_…"}'\ncurl -s http://127.0.0.1:4319/api/ledger/verify`,
  };
}
