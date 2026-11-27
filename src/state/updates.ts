// Updates of the app itself (tauri-plugin-updater, src-tauri/src/updates.rs).

import { get, log, set, type UpdateState } from "./appState";
import { platform } from "./platform";

export function setUpdate(changes: Partial<UpdateState>) {
  set((s) => ({ update: { ...s.update, ...changes } }));
}

/** Look for a newer Katraineo. The check at startup (`manual` false) only logs failures; one from the menu shows them. */
export async function checkForUpdates(manual: boolean) {
  if (!platform.isDesktop || get().update.phase === "installing") return;
  if (manual) setUpdate({ phase: "checking", error: null });
  try {
    const info = await platform.checkForUpdate();
    if (info) setUpdate({ phase: "available", info, error: null });
    else setUpdate({ phase: manual ? "latest" : "idle", info: null });
  } catch (e) {
    log(`Checking for updates failed: ${e}`, manual ? "error" : "info");
    if (manual) setUpdate({ phase: "error", info: null, error: String(e) });
  }
}

/** Install the update that was found; the app restarts when it is done. */
export async function installUpdate() {
  const { phase, info } = get().update;
  if (!info || phase === "installing") return;
  setUpdate({ phase: "installing", progress: null, error: null });
  try {
    await platform.installUpdate((progress) => setUpdate({ progress }));
  } catch (e) {
    log(`Updating failed: ${e}`, "error");
    setUpdate({ phase: "error", error: String(e) });
  }
}
