export type ViewId = "truth" | "studio" | "ledger" | "bridge" | "settings";

/** ⌘/Ctrl/Alt + index+1 */
export const VIEW_ORDER: ViewId[] = ["truth", "studio", "ledger", "bridge", "settings"];

export const VIEW_TITLES: Record<ViewId, string> = {
  truth: "Truth Workbench",
  studio: "Dossier Studio",
  ledger: "Ledger",
  bridge: "Trilogy Bridge",
  settings: "Settings",
};
