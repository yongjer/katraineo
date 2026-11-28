// Games and files: new games, loading and saving, the clipboard, and keeping unsaved changes safe (the dirty flag,
// autosave, crash recovery and the "save changes?" guard).

import { aiRankEstimation, rankLabel } from "../core/ai";
import {
  MODE_ANALYZE,
  MODE_PLAY,
  PLAYER_AI,
  PLAYER_HUMAN,
  SGF_INTERNAL_COMMENTS_MARKER,
  type Player,
  type UiMode,
} from "../core/constants";
import { Game, type NewGameSettings } from "../core/game";
import type { GameNode } from "../core/gameNode";
import { t, tf } from "../core/i18n";
import { parseGameFile, parseSgf, writeSgf } from "../core/sgf";
import { get, log, refresh, set, setStatus } from "./appState";
import { recordRecentFile, rememberPlayerTypes, restorePlayerTypes, updateConfig } from "./configState";
import { clearStatus, getEngine, host } from "./engineState";
import { platform } from "./platform";
import { resetTimer } from "./timer";
import { openDialog } from "./uiState";

// ---------------------------------------------------------------- dirty tracking, autosave & unsaved guard
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUnsavedAction: (() => void | Promise<void>) | null = null;

function syncWindowTitle(game = get().game, dirty = get().dirty) {
  const file = game?.sgfFilename ? (game.sgfFilename.split(/[\\/]/).pop() ?? null) : null;
  const title = `${dirty ? "• " : ""}${file ? `${file} — ` : ""}Katraineo`;
  if (typeof document !== "undefined") document.title = title;
  void platform.setWindowTitle?.(title)?.catch(() => {});
}

function clearAutosaveTimer() {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function clearAutosaveNow() {
  clearAutosaveTimer();
  return platform.clearAutosave?.().catch(() => {}) ?? Promise.resolve();
}

function scheduleAutosave() {
  clearAutosaveTimer();
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const { game, dirty } = get();
    if (!game || !dirty) return;
    void platform.saveAutosave?.(writeSgf(game.root))?.catch((e) => log(`Autosave failed: ${e}`, "debug"));
  }, 1500);
}

/** Flush any pending debounced autosave immediately (e.g. for tests). */
export async function flushAutosave() {
  clearAutosaveTimer();
  const { game, dirty } = get();
  if (!game || !dirty) return;
  await platform.saveAutosave?.(writeSgf(game.root))?.catch((e) => log(`Autosave failed: ${e}`, "debug"));
}

/** The game has changed since it was last saved or loaded. */
export function markDirty() {
  if (!get().dirty) set({ dirty: true });
  syncWindowTitle(get().game, true);
  scheduleAutosave();
}

export function guardUnsaved(action: () => void | Promise<void>) {
  if (!get().dirty) {
    void action();
    return;
  }
  pendingUnsavedAction = action;
  openDialog("unsaved");
}

export async function resolveUnsaved(choice: "save" | "discard" | "cancel") {
  const action = pendingUnsavedAction;
  if (choice === "cancel") {
    pendingUnsavedAction = null;
    openDialog(null);
    return;
  }
  if (choice === "save") {
    const saved = await saveGame(false);
    if (!saved) return;
  } else {
    set({ dirty: false });
    await clearAutosaveNow();
    syncWindowTitle(get().game, false);
  }
  pendingUnsavedAction = null;
  openDialog(null);
  if (action) await action();
}

export function recoverAutosave() {
  const sgf = get().recoverySgf;
  set({ recoverySgf: null, dialog: null });
  if (!sgf) return;
  loadGameFromString(sgf, "autosave.sgf", null);
  markDirty();
}

export function discardAutosave() {
  set({ recoverySgf: null, dialog: null });
  void clearAutosaveNow();
}

/** Called when the OS requests closing the main window; returns true to defer closing while confirming unsaved edits. */
export function requestWindowClose(): boolean {
  if (!get().dirty) {
    void clearAutosaveNow();
    return false;
  }
  guardUnsaved(async () => {
    await clearAutosaveNow();
    await platform.closeWindow?.();
  });
  return true;
}

// ---------------------------------------------------------------- new games & loading
function startGame(game: Game, mode: UiMode, opts: { keepAutosave?: boolean } = {}) {
  const old = get().game;
  if (old) old.active = false;
  resetTimer();
  set({ game, mode, pondering: false, dirty: false, setupTool: null });
  if (!opts.keepAutosave) void clearAutosaveNow();
  syncWindowTitle(game, false);
  clearStatus();
  refresh();
}

export function newGame(settings?: NewGameSettings, opts: { fromConfig?: boolean; keepAutosave?: boolean } = {}) {
  restorePlayerTypes();
  const cfg = get().config;
  const s: NewGameSettings = settings ?? {
    size: String(cfg.game.size),
    komi: cfg.game.komi,
    handicap: cfg.game.handicap,
    rules: cfg.game.rules,
  };
  if (settings && !opts.fromConfig) {
    updateConfig((c) => {
      c.game.size = settings.size;
      c.game.komi = settings.komi;
      c.game.handicap = settings.handicap;
      c.game.rules = settings.rules;
    });
  }
  const engine = getEngine();
  engine?.onNewGame();
  startGame(new Game(host, engine, { newGame: s, analyzeFast: true }), MODE_PLAY, { keepAutosave: opts.keepAutosave });
}

export function requestNewGame(settings?: NewGameSettings) {
  guardUnsaved(() => newGame(settings));
}

export function requestOpenGamePath(path: string) {
  guardUnsaved(() => openGamePath(path));
}

export function requestFileDrop(file: { contents: string; name: string; path: string | null }) {
  guardUnsaved(() => loadGameFromString(file.contents, file.name, file.path));
}

export function loadGameFromString(contents: string, filename: string, path: string | null) {
  try {
    const tree = parseGameFile(contents, filename);
    const engine = getEngine();
    engine?.onNewGame();
    const cfg = get().config;
    const game = new Game(host, engine, {
      moveTree: tree,
      sgfFilename: path,
      analyzeFast: cfg.general.load_fast_analysis,
    });
    if (!cfg.general.load_sgf_rewind) game.redo(9999);
    // loaded games are reviewed by humans
    rememberPlayerTypes();
    updateConfig((c) => {
      c.ui.players.B.type = PLAYER_HUMAN;
      c.ui.players.W.type = PLAYER_HUMAN;
    });
    if (path) recordRecentFile(path);
    startGame(game, MODE_ANALYZE);
    setStatus(`${filename}`, "info");
  } catch (e) {
    setStatus(tf("Failed to load SGF", { error: String(e) }), "error");
  }
}

export async function openGamePath(path: string) {
  try {
    const file = await platform.readGameFile(path);
    loadGameFromString(file.contents, file.name, file.path);
  } catch (e) {
    setStatus(tf("Failed to load SGF", { error: String(e) }), "error");
  }
}

export async function loadGame() {
  guardUnsaved(async () => {
    try {
      const file = await platform.openGameFile();
      if (file) loadGameFromString(file.contents, file.name, file.path);
    } catch (e) {
      setStatus(tf("Failed to load SGF", { error: String(e) }), "error");
    }
  });
}

// ---------------------------------------------------------------- saving
function playerName(p: Player): string | null {
  const setup = get().config.ui.players[p];
  if (setup.type !== PLAYER_AI) return null;
  return `${t(PLAYER_AI)} (${t(setup.strategy)})${SGF_INTERNAL_COMMENTS_MARKER}`;
}

export async function saveGame(saveAs = false): Promise<boolean> {
  const { game, config } = get();
  if (!game) return false;
  game.updateRootProperties({ B: playerName("B"), W: playerName("W") });
  for (const p of ["B", "W"] as Player[]) {
    const setup = config.ui.players[p];
    if (setup.type === PLAYER_AI && !game.externalGame) {
      game.root.setProperty(`${p}R`, rankLabel(aiRankEstimation(setup.strategy, config.ai[setup.strategy] ?? {})));
    }
  }
  const showDotsFor = {
    B: config.trainer.eval_show_ai || config.ui.players.B.type === PLAYER_HUMAN,
    W: config.trainer.eval_show_ai || config.ui.players.W.type === PLAYER_HUMAN,
  };
  try {
    const sgf = game.toSgf(config.trainer, showDotsFor);
    const path = await platform.saveTextFile(sgf, game.generateFilename(), saveAs ? null : game.sgfFilename);
    if (path) {
      game.sgfFilename = platform.isDesktop ? path : null;
      if (platform.isDesktop) recordRecentFile(path);
      set({ dirty: false });
      await clearAutosaveNow();
      syncWindowTitle(game, false);
      setStatus(tf("sgf written", { file_name: path }), "info");
      return true;
    }
    return false;
  } catch (e) {
    setStatus(tf("Saving failed", { error: String(e) }), "error");
    return false;
  }
}

// ---------------------------------------------------------------- clipboard
export async function copySgf() {
  const game = get().game;
  if (!game) return;
  try {
    await platform.writeClipboard(writeSgf(game.root));
    setStatus(t("Copied SGF to clipboard."), "info");
  } catch (e) {
    setStatus(String(e), "error");
  }
}

export async function pasteSgf() {
  let text: string;
  try {
    text = (await platform.readClipboard()) ?? "";
  } catch (e) {
    setStatus(String(e), "error");
    return;
  }
  if (!text.trim()) {
    setStatus(t("clipboard empty"), "info");
    return;
  }
  const url = /^(https?:\/\/\S+)/.exec(text.trim());
  if (url) {
    log(`Recognized url: ${url[1]}`, "info");
    try {
      text = await platform.fetchText(url[1]);
    } catch (e) {
      setStatus(tf("Failed to import from clipboard", { error: String(e), contents: text.slice(0, 50) }), "error");
      return;
    }
  }
  let tree: GameNode;
  try {
    tree = parseSgf(text);
  } catch (e) {
    setStatus(tf("Failed to import from clipboard", { error: String(e), contents: text.slice(0, 50) }), "error");
    return;
  }
  guardUnsaved(() => {
    const engine = getEngine();
    engine?.onNewGame();
    const game = new Game(host, engine, { moveTree: tree, analyzeFast: true });
    game.redo(9999);
    startGame(game, MODE_ANALYZE);
    log("Imported game from clipboard.", "info");
  });
}
