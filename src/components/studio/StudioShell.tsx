"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Download, FileSignature, FileSearch, Handshake, Moon, Plus, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { validateDossier, type ProvenanceDossier, type ProvenanceLedgerRecord } from "@verifact/core";
import { CommandPalette, type PaletteItem } from "@verifact/react";
import { localClient, serverClient, type EvidenceClient } from "@/lib/client";
import { usePersisted } from "@/lib/persisted";
import { ApiError, api, getToken, probeServer, setToken, type ServerInfo } from "@/lib/serverApi";
import { DEFAULT_DOSSIERS, DEFAULT_WORKSPACE, themeStore, workspaceStore, type WorkspaceExport } from "@/lib/studioStore";
import { DEFAULT_THEME, applyTheme, buildVars, type ThemeMode, type ThemePrefs } from "@/lib/theme";
import type { LogFn, TerminalEvent } from "./log";
import { VIEW_ORDER, VIEW_TITLES, type ViewId } from "./nav";
import { StatusBar } from "./StatusBar";
import { StudioWorkbench, type StudioCommand } from "./StudioWorkbench";
import { TokenGate } from "./TokenGate";
import { TopNav } from "./TopNav";
import { BridgeView } from "./views/BridgeView";
import { LedgerView } from "./views/LedgerView";
import { SettingsView } from "./views/SettingsView";
import { TruthView } from "./views/TruthView";

interface WorkspaceDto {
  dossiers: ProvenanceDossier[];
}

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

const hhmmss = (): string => new Date().toTimeString().slice(0, 8);

export function StudioShell() {
  const [workspace, setWorkspace] = usePersisted(workspaceStore);
  const [theme, setTheme] = usePersisted(themeStore);
  const [view, setView] = useState<ViewId>("truth");
  const [server, setServer] = useState<ServerInfo | null | false>(null);
  const [serverWs, setServerWs] = useState<WorkspaceDto | null>(null);
  const [client, setClient] = useState<EvidenceClient | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [records, setRecords] = useState<ProvenanceLedgerRecord[]>([]);
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [studioIssues, setStudioIssues] = useState(0);
  const [studioCommand, setStudioCommand] = useState<StudioCommand>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const nextEventId = useRef(1);
  const commandId = useRef(1);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverMode = server !== null && server !== false;

  const log = useCallback<LogFn>((kind, text) => {
    setEvents((cur) => [...cur.slice(-199), { id: nextEventId.current++, at: hhmmss(), kind, text }]);
  }, []);

  /* ───── connect: a running `verifact studio` server, else the browser-only demo ───── */
  const loadFromServer = useCallback(async (): Promise<void> => {
    try {
      const ws = await api<WorkspaceDto>("/api/workspace");
      setServerWs({ dossiers: ws.dossiers });
      setNeedsToken(false);
      setSyncError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setNeedsToken(true);
        setTokenError(getToken() ? "That key was not accepted." : null);
      } else setSyncError(e instanceof Error ? e.message : "Could not load the workspace");
    }
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const info = await probeServer();
      if (!live) return;
      if (info) {
        setServer(info);
        setClient(serverClient(info.keyFingerprint));
        await loadFromServer();
      } else {
        const c = await localClient();
        if (!live) return;
        setServer(false);
        setClient(c);
      }
    })();
    return () => {
      live = false;
    };
  }, [loadFromServer]);

  /* ───── workspace (server files, or this browser) ───── */
  const dossiers = useMemo<ProvenanceDossier[]>(() => (serverMode ? (serverWs?.dossiers ?? []) : (workspace.dossiers ?? DEFAULT_DOSSIERS)), [serverMode, serverWs, workspace.dossiers]);
  const dossier = dossiers.find((d) => d.id === selected) ?? dossiers[0] ?? null;

  const commit = useCallback(
    (next: ProvenanceDossier[]): void => {
      if (serverMode) {
        setServerWs({ dossiers: next });
        if (pushTimer.current) clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(() => {
          api("/api/workspace", { method: "PUT", body: { dossiers: next } })
            .then(() => setSyncError(null))
            .catch((e: unknown) => setSyncError(e instanceof Error ? e.message : "Could not save the workspace"));
        }, 500);
      } else setWorkspace({ dossiers: next });
    },
    [serverMode, setWorkspace],
  );

  const saveDossier = (d: ProvenanceDossier): void => commit(dossiers.some((x) => x.id === d.id) ? dossiers.map((x) => (x.id === d.id ? d : x)) : [...dossiers, d]);
  const deleteDossier = (id: string): void => {
    const next = dossiers.filter((d) => d.id !== id);
    if (next.length === 0) return;
    commit(next);
    if (selected === id) setSelected(next[0].id);
    log("warn", `Deleted dossier ${id}`);
  };

  /* ───── ledger ───── */
  useEffect(() => {
    if (!client) return;
    let live = true;
    void client
      .ledger()
      .then((r) => {
        if (live) setRecords(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, ledgerVersion]);

  /* ───── theme ───── */
  useEffect(() => {
    applyTheme(theme);
    if (theme.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => applyTheme(theme);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const updateTheme = (patch: Partial<Pick<ThemePrefs, "mode" | "accent" | "radius" | "textSize">>): void => {
    const next = { ...theme, ...patch };
    setTheme({ ...next, vars: buildVars(next.accent, next.radius, next.textSize) });
  };
  const cycleTheme = (): void => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    updateTheme({ mode: order[(order.indexOf(theme.mode) + 1) % order.length] });
  };

  /* ───── export / import ───── */
  const exportWorkspace = (): void => {
    const payload: WorkspaceExport = { format: "verifact.workspace/1", exportedAt: new Date().toISOString(), dossiers };
    download("verifact-workspace.json", `${JSON.stringify(payload, null, 2)}\n`, "application/json");
    log("info", `Exported ${dossiers.length} dossier${dossiers.length === 1 ? "" : "s"}`);
  };

  const importWorkspace = (file: File): void => {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Partial<WorkspaceExport>;
        if (parsed.format !== "verifact.workspace/1" || !Array.isArray(parsed.dossiers)) throw new Error("Not an Verifact workspace export (expected format verifact.workspace/1).");
        const errors: string[] = [];
        const valid: ProvenanceDossier[] = [];
        for (const raw of parsed.dossiers) {
          const v = validateDossier(raw);
          if (v.ok && v.dossier) valid.push(v.dossier);
          else errors.push(...v.errors.slice(0, 3));
        }
        if (errors.length) throw new Error(errors.join("\n"));
        if (valid.length === 0) throw new Error("The file needs at least one dossier.");
        commit(valid);
        setSelected(valid[0].id);
        setImportError(null);
        log("ok", `Imported ${valid.length} dossier(s)`);
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Could not import the file");
      }
    });
  };

  /* ───── navigation & shortcuts ───── */
  const studioCmd = (name: "new-dossier" | "focus-filter"): void => {
    setView("studio");
    setStudioCommand({ id: commandId.current++, name });
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportWorkspace();
      } else if ((mod || e.altKey) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setView(VIEW_ORDER[Number(e.key) - 1]);
      } else if (!mod && !e.altKey && !isTyping(e.target) && view === "studio") {
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          studioCmd("new-dossier");
        } else if (e.key === "/") {
          e.preventDefault();
          studioCmd("focus-filter");
        }
      }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => keyRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openDossier = (id: string): void => {
    setSelected(id);
    setView("truth");
  };

  const paletteItems: PaletteItem[] = [
    ...VIEW_ORDER.map(
      (id, i): PaletteItem => ({
        id: `view-${id}`,
        group: "Go to",
        label: VIEW_TITLES[id],
        hint: `⌘${i + 1}`,
        icon: { truth: <ShieldCheck size={14} />, studio: <Boxes size={14} />, ledger: <FileSignature size={14} />, bridge: <Handshake size={14} />, settings: <SettingsIcon size={14} /> }[id],
        run: () => setView(id),
      }),
    ),
    ...dossiers.map((d): PaletteItem => ({ id: `dossier-${d.id}`, group: "Verify a dossier", label: d.name, hint: d.category, icon: <FileSearch size={14} />, keywords: `${d.id} ${d.description}`, run: () => openDossier(d.id) })),
    { id: "act-theme", group: "Actions", label: "Cycle theme (light / dark / system)", icon: <Moon size={14} />, run: cycleTheme },
    { id: "act-new", group: "Actions", label: "Create a new dossier", hint: "N", icon: <Plus size={14} />, run: () => studioCmd("new-dossier") },
    { id: "act-export", group: "Actions", label: "Export Studio configuration as JSON", hint: "⌘S", icon: <Download size={14} />, run: exportWorkspace },
  ];

  const pane = (id: ViewId, children: React.ReactNode, padded = true) => (
    <div hidden={view !== id} className={padded ? "studio-fade h-full overflow-y-auto" : "studio-fade h-full min-h-0"}>
      {padded ? <div className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-8">{children}</div> : children}
    </div>
  );

  const mode = server === null ? "connecting" : serverMode ? "server" : "local";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      <TopNav view={view} onView={setView} themeMode={theme.mode} onCycleTheme={cycleTheme} onPalette={() => setPaletteOpen(true)} onExport={exportWorkspace} ledgerCount={records.length} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onFreeText={(t) => {
          const hit = dossiers.find((d) => `${d.name} ${d.id} ${d.category}`.toLowerCase().includes(t.toLowerCase()));
          if (hit) openDossier(hit.id);
        }}
      />

      {needsToken ? (
        <TokenGate
          project={server ? server.project : "Verifact"}
          error={tokenError}
          onSubmit={(t) => {
            setToken(t);
            void loadFromServer();
          }}
        />
      ) : null}

      {server === false ? (
        <div role="note" className="shrink-0 border-b border-amber-300/60 bg-amber-50 px-4 py-1.5 text-center text-[11px] text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          <b>Local demo</b> — keys, dossiers and the ledger live in this browser and nothing is enforced server-side. Run <code className="font-mono">npx @verifact/cli studio</code> in a project for files, server signing and a shared ledger.
        </div>
      ) : null}

      <main className="min-h-0 flex-1">
        {syncError ? (
          <p role="alert" className="m-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200">
            {syncError}
          </p>
        ) : null}

        {pane("truth", <TruthView client={client} dossiers={dossiers} dossier={dossier} onDossier={setSelected} log={log} onSealed={() => setLedgerVersion((v) => v + 1)} />)}
        {pane("studio", <StudioWorkbench dossiers={dossiers} selectedId={dossier?.id ?? null} onSelect={setSelected} onSave={saveDossier} onDelete={deleteDossier} onIssues={setStudioIssues} events={events} onClearEvents={() => setEvents([])} client={client} command={studioCommand} />, false)}
        {pane("ledger", <LedgerView client={client} records={records} onClear={client?.clearLedger ? () => { client.clearLedger?.(); setLedgerVersion((v) => v + 1); } : undefined} />)}
        {pane("bridge", <BridgeView client={client} dossiers={dossiers} dossier={dossier} onDossier={setSelected} />)}
        {pane(
          "settings",
          <SettingsView
            prefs={theme}
            onPrefs={updateTheme}
            onResetTheme={() => setTheme(DEFAULT_THEME)}
            onExport={exportWorkspace}
            onImport={importWorkspace}
            onResetWorkspace={() => {
              if (serverMode) commit(DEFAULT_DOSSIERS);
              else setWorkspace(DEFAULT_WORKSPACE);
              setImportError(null);
              setSelected(null);
              log("warn", "Workspace reset to the built-in dossiers");
            }}
            importError={importError}
            counts={{ dossiers: dossiers.length, claims: dossiers.reduce((n, d) => n + d.claims.length, 0), ledger: records.length }}
            mode={mode}
            fingerprint={client?.issuerFingerprint ?? null}
          />,
        )}
      </main>

      <StatusBar synced={studioIssues === 0 && !syncError} issues={studioIssues || (syncError ? 1 : 0)} keyFingerprint={client?.issuerFingerprint ?? null} keyPersistent={client?.keyPersistent ?? false} mode={mode} />
    </div>
  );
}
