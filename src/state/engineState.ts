// The KataGo engine of the app: starting and restarting it, and what a Game needs from the app around it.

import { PLAYER_AI, PRIORITY_GAME_ANALYSIS, type Player } from "../core/constants";
import { KataGoEngine } from "../core/engine";
import type { GameHost } from "../core/game";
import { t } from "../core/i18n";
import { get, log, refresh, setStatus } from "./appState";
import { platform } from "./platform";

let engine: KataGoEngine | null = null;
export function getEngine(): KataGoEngine | null {
  return engine;
}

/** Clear the status bar, but keep what the engine connection has to say (why it stopped, reconnect progress). */
export function clearStatus() {
  const message = engine?.connectionMessage;
  setStatus(message ?? "", engine?.state === "dead" ? "error" : "info");
}

export const host: GameHost = {
  trainer: () => get().config.trainer,
  isAi: (p: Player) => get().config.ui.players[p].type === PLAYER_AI,
  setStatus: (m, l) => setStatus(m, l),
  log: (m) => log(m, "debug"),
};

let transportKind = "";
export async function startEngine() {
  const cfg = get().config;
  const kind = platform.transportKind(cfg.engine);
  if (!engine) {
    engine = new KataGoEngine(platform.makeTransport(cfg.engine), cfg.engine, (m, l) => log(m, l));
    engine.onStatus = (m) => setStatus(m, "info");
    engine.subscribe(() => {
      if (engine?.state === "dead") setStatus(engine.connectionMessage!, "error");
      refresh();
    });
    transportKind = kind;
    await engine.start();
  } else {
    const transport = kind !== transportKind ? platform.makeTransport(cfg.engine) : undefined;
    transportKind = kind;
    await engine.restart(cfg.engine, transport);
  }
}

/** Restart KataGo with the current settings, then analyze what the old engine left unanalyzed. */
export async function restartEngine() {
  setStatus(t("restarting engine"), "info");
  await startEngine();
  const game = get().game;
  if (game)
    for (const n of game.root.nodesInTree)
      if (!n.analysisComplete) game.analyze(n, { priority: PRIORITY_GAME_ANALYSIS });
  refresh();
}
