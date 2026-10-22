import { DOSSIER_PACKS, type ProvenanceDossier } from "@verifact/core";
import { createPersistedStore } from "./persisted";
import { DEFAULT_THEME, THEME_KEY, type ThemePrefs } from "./theme";

/** `null` means "use the built-in dossiers" so upgrades keep flowing to people who never customised. */
export interface WorkspaceConfig {
  dossiers: ProvenanceDossier[] | null;
}

export const DEFAULT_WORKSPACE: WorkspaceConfig = { dossiers: null };
export const DEFAULT_DOSSIERS: ProvenanceDossier[] = [...DOSSIER_PACKS];

export const workspaceStore = createPersistedStore<WorkspaceConfig>("verifact-workspace", DEFAULT_WORKSPACE);
export const themeStore = createPersistedStore<ThemePrefs>(THEME_KEY, DEFAULT_THEME);

export interface WorkspaceExport {
  format: "verifact.workspace/1";
  exportedAt: string;
  dossiers: ProvenanceDossier[];
}
