// Changing and saving the user config, including the player types (which a loaded game changes only for a while).

import type { Player, PlayerType } from "../core/constants";
import { setLanguage } from "../ui/i18nLoader";
import { get, log, refresh, set } from "./appState";
import { addRecentFile, type AnalysisToggles, type AppConfig } from "./config";
import { getEngine, restartEngine } from "./engineState";
import { platform } from "./platform";

// A loaded game is reviewed by humans, but only until the next new game: the player types to return to.
let playerTypesBeforeLoad: Record<Player, string> | null = null;

/** A game was loaded: remember the player types to return to (the first time only), then make both human. */
export function rememberPlayerTypes() {
  const players = get().config.ui.players;
  playerTypesBeforeLoad ??= { B: players.B.type, W: players.W.type };
}

/** A new game: return to the player types from before the loaded games, if any. */
export function restorePlayerTypes() {
  if (!playerTypesBeforeLoad) return;
  const types = playerTypesBeforeLoad;
  playerTypesBeforeLoad = null;
  updateConfig((c) => {
    c.ui.players.B.type = types.B;
    c.ui.players.W.type = types.W;
  });
}

function persistConfig() {
  const config = structuredClone(get().config);
  if (playerTypesBeforeLoad) {
    config.ui.players.B.type = playerTypesBeforeLoad.B;
    config.ui.players.W.type = playerTypesBeforeLoad.W;
  }
  void platform.saveConfig(JSON.stringify(config, null, 2)).catch((e) => log(`Saving config failed: ${e}`, "error"));
}

/**
 * Change the settings; the engine restarts when its settings change, or with `restartDeadEngine` (applying the
 * settings dialog) also when it has stopped, so that applying the same settings again retries a failed engine.
 */
export function updateConfig(mutator: (c: AppConfig) => void, opts: { restartDeadEngine?: boolean } = {}) {
  const config = structuredClone(get().config);
  const before = JSON.stringify(config.engine);
  const lang = config.general.lang;
  mutator(config);
  set({ config });
  persistConfig();
  if (config.general.lang !== lang)
    void setLanguage(config.general.lang).then(() => set({ lang: config.general.lang }));
  const engine = getEngine();
  if (JSON.stringify(config.engine) !== before || (opts.restartDeadEngine && engine && !engine.isAlive))
    void restartEngine();
  refresh();
}

export function toggleControl(key: keyof AnalysisToggles) {
  const mode = get().mode;
  updateConfig((c) => {
    c.ui[mode][key] = !c.ui[mode][key];
  });
}

export function setPlayer(p: Player, change: { type?: PlayerType; strategy?: string; subtype?: string }) {
  if (change.type && playerTypesBeforeLoad) playerTypesBeforeLoad[p] = change.type;
  updateConfig((c) => {
    if (change.type) c.ui.players[p].type = change.type;
    if (change.strategy) c.ui.players[p].strategy = change.strategy;
    if (change.subtype) c.ui.players[p].subtype = change.subtype;
  });
}

export function recordRecentFile(path: string | null) {
  if (!path) return;
  const current = get().config.general.recent_files ?? [];
  const next = addRecentFile(current, path);
  if (next.length === current.length && next.every((v, i) => v === current[i])) return;
  updateConfig((c) => void (c.general.recent_files = next));
}

export function clearRecentFiles() {
  if (!get().config.general.recent_files.length) return;
  updateConfig((c) => void (c.general.recent_files = []));
}
