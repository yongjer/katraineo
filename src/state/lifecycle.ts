// Starting the app: the saved config, its language, the engine, the first game and a file or autosave to open.

import { t, tf } from "../core/i18n";
import { setLanguage } from "../ui/i18nLoader";
import { log, set } from "./appState";
import { isUnreadableConfig, parseSavedConfig } from "./config";
import { startEngine } from "./engineState";
import { newGame, openGamePath } from "./files";
import { platform } from "./platform";
import { checkForUpdates, setUpdate } from "./updates";

/** The saved config could not be read: keep it, as the next save would replace it, and tell the user. */
async function keepUnreadableConfig() {
  let message = t("config:unreadable");
  try {
    message += `\n\n${tf("config:kept", { file: await platform.keepUnreadableConfig() })}`;
  } catch (e) {
    log(`Keeping the unreadable config failed: ${e}`, "error");
  }
  log(message, "error");
  void platform.showWarning(message).catch((e) => log(`Showing a warning failed: ${e}`, "error"));
}

let initialized = false;
export async function init() {
  if (initialized) return;
  initialized = true;
  const saved = await platform.loadConfig().catch(() => null);
  const config = parseSavedConfig(saved);
  await setLanguage(config.general.lang).catch(() => {});
  if (isUnreadableConfig(saved)) await keepUnreadableConfig();
  set({ config, ready: true, lang: config.general.lang });
  const autosave = await platform.loadAutosave?.().catch(() => null);
  await startEngine();
  newGame(undefined, { fromConfig: true, keepAutosave: Boolean(autosave?.trim()) });
  const pendingPath = await platform.takePendingOpenFile?.().catch(() => null);
  if (pendingPath) {
    await openGamePath(pendingPath);
  } else if (autosave?.trim()) {
    set({ recoverySgf: autosave, dialog: "recovery" });
  }
  void platform.appVersion().then((currentVersion) => setUpdate({ currentVersion }));
  if (config.general.check_for_updates) void checkForUpdates(false);
}
