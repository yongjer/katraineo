// The application state (a zustand store) and the few helpers every controller module needs: logging, the status bar
// and refresh(). The controller logic lives in the other modules of src/state; src/state/store.ts re-exports them all.

import { create } from "zustand";
import { MODE_PLAY, type UiMode } from "../core/constants";
import type { LogLevel } from "../core/engine";
import type { Game, StatusLevel } from "../core/game";
import { parseSavedConfig, type AppConfig } from "./config";
import type { UpdateInfo, UpdateProgress } from "./platform";

export interface Status {
  message: string;
  level: StatusLevel;
}

export interface LogEntry {
  message: string;
  level: LogLevel;
}

export type DialogKind =
  | null
  | "newgame"
  | "settings"
  | "ai"
  | "log"
  | "timer"
  | "tsumego"
  | "report"
  | "reanalyze"
  | "update"
  | "unsaved"
  | "recovery"
  | "shortcuts";

/** Focus modes (~ / F12): 0 shows everything, 1 hides the side panels, 2 shows only the board. */
export type FocusMode = 0 | 1 | 2;

/** Updates of the app itself: `checking` and `latest` only follow a check from the menu. */
export interface UpdateState {
  phase: "idle" | "checking" | "latest" | "available" | "installing" | "error";
  currentVersion: string;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
}

/** What the clock shows: main time, or the current byo-yomi period and the periods left. */
export interface TimerState {
  paused: boolean;
  /** seconds left, of main time or of the current period */
  remaining: number;
  /** byo-yomi periods left, or null during main time */
  periods: number | null;
  /** the player on the clock is an AI */
  ai: boolean;
}

export interface State {
  ready: boolean;
  config: AppConfig;
  game: Game | null;
  /** Incremented whenever the (mutable) game tree or analysis changes. */
  tick: number;
  mode: UiMode;
  pondering: boolean;
  aiThinking: boolean;
  status: Status | null;
  logs: LogEntry[];
  dialog: DialogKind;
  /** Loaded UI language; the app re-renders fully when it changes. */
  lang: string;
  timer: TimerState;
  /** Dragging on the board selects a region of interest (key g) instead of playing. */
  selectingRegion: boolean;
  showCoords: boolean;
  update: UpdateState;
  /** True when the active game has edits (moves, branches, notes) since last save or load. */
  dirty: boolean;
  /** SGF recovered from a previous session's autosave, waiting for user confirmation. */
  recoverySgf: string | null;
  focusMode: FocusMode;
}

export const useStore = create<State>(() => ({
  ready: false,
  config: parseSavedConfig(null),
  game: null,
  tick: 0,
  mode: MODE_PLAY,
  pondering: false,
  aiThinking: false,
  status: null,
  logs: [],
  dialog: null,
  lang: "en",
  timer: { paused: true, remaining: 30, periods: 5, ai: false },
  selectingRegion: false,
  showCoords: true,
  update: { phase: "idle", currentVersion: "", info: null, progress: null, error: null },
  dirty: false,
  recoverySgf: null,
  focusMode: 0,
}));

export const get = useStore.getState;
export const set = useStore.setState;

// ---------------------------------------------------------------- logging & refresh
export function log(message: string, level: LogLevel = "info") {
  if (level === "error") console.error(message);
  if (level === "debug" && get().config.general.debug_level < 1) return;
  set((s) => ({ logs: [...s.logs.slice(-499), { message, level }] }));
}

/** The AI / teaching / pondering logic that runs after changes; state/trainer.ts sets it. */
let updateLogic: () => void = () => {};
export function setUpdateLogic(logic: () => void) {
  updateLogic = logic;
}

let renderScheduled = false;
let updateScheduled = false;
/**
 * Re-render (at most once per frame) and run the AI / teaching / pondering logic (at most about as often).
 * The logic runs on a timer of its own: web views pause animation frames while the window is minimized or hidden,
 * and AI moves must go on then.
 */
export function refresh() {
  if (!updateScheduled) {
    updateScheduled = true;
    setTimeout(() => {
      updateScheduled = false;
      updateLogic();
    }, 16);
  }
  if (!renderScheduled) {
    renderScheduled = true;
    const render = () => {
      renderScheduled = false;
      set((s) => ({ tick: s.tick + 1 }));
    };
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(render);
    else setTimeout(render, 16);
  }
}

export function setStatus(message: string, level: StatusLevel = "info") {
  set({ status: message ? { message, level } : null });
}
