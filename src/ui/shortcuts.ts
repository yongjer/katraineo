// Keyboard shortcuts: the actions the keyboard can run, their default keys, and the user's own keys from the config
// (`shortcuts`: action id → key combinations, only for actions whose keys were changed).
//
// A key combination is written as modifiers then a key, joined by "+": "Mod+Shift+Z", "F2", "ArrowLeft", "`".
// "Mod" is Ctrl, or Cmd on macOS (either one works everywhere, as before). Letters and digits go by the physical key, as
// Kivy's keycodes did: with a Chinese or Japanese input method active, or a non-Latin layout, e.key is "Process" or
// another character, but e.code is still "KeyI".

import { useMemo } from "react";
import { MODE_ANALYZE, MODE_PLAY } from "../core/constants";
import { t } from "../core/i18n";
import type { AnalysisToggles } from "../state/config";
import {
  SETUP_TOOLS,
  aiMoveNow,
  analyzeExtra,
  copySgf,
  cycleFocusMode,
  editTree,
  finishSetup,
  setSetupTool,
  toggleSetup,
  findMistake,
  loadGame,
  openDialog,
  pasteSgf,
  playAt,
  redo,
  resetAnalysis,
  saveGame,
  selfplayToEnd,
  setMode,
  startRegionSelect,
  switchBranch,
  toggleControl,
  toggleCoordinates,
  toggleInsertMode,
  togglePondering,
  toggleTimerPaused,
  undo,
  updateConfig,
  useStore,
} from "../state/store";
import { IS_MAC } from "./theme";

export interface ShortcutAction {
  id: string;
  /** msgid of its name */
  label: string;
  group: "file" | "navigate" | "analyze" | "view" | "edit";
  defaults: string[];
  run: () => void;
}

const toggle = (key: keyof AnalysisToggles) => () => toggleControl(key);

export const ACTIONS: ShortcutAction[] = [
  // file
  { id: "new-game", label: "menu:newgame", group: "file", defaults: ["Mod+N"], run: () => openDialog("newgame") },
  { id: "load", label: "menu:load", group: "file", defaults: ["Mod+L"], run: () => void loadGame() },
  { id: "save", label: "menu:save", group: "file", defaults: ["Mod+S"], run: () => void saveGame(false) },
  { id: "save-as", label: "menu:save-as", group: "file", defaults: ["Mod+D"], run: () => void saveGame(true) },
  { id: "copy-sgf", label: "menu:copy-sgf", group: "file", defaults: ["Mod+C"], run: () => void copySgf() },
  { id: "paste-sgf", label: "menu:paste-sgf", group: "file", defaults: ["Mod+V"], run: () => void pasteSgf() },
  { id: "settings", label: "menu:settings", group: "file", defaults: ["F8"], run: () => openDialog("settings") },
  { id: "ai-settings", label: "menu:aisettings", group: "file", defaults: ["F7"], run: () => openDialog("ai") },
  {
    id: "timer-settings",
    label: "menu:clocksettings",
    group: "file",
    defaults: ["F5"],
    run: () => openDialog("timer"),
  },
  {
    id: "shortcuts",
    label: "menu:shortcuts",
    group: "file",
    defaults: ["Mod+/"],
    run: () => openDialog("shortcuts"),
  },
  // navigate
  { id: "undo", label: "nav:previous", group: "navigate", defaults: ["ArrowLeft", "Z"], run: () => undo(1) },
  { id: "redo", label: "nav:next", group: "navigate", defaults: ["ArrowRight", "X"], run: () => redo(1) },
  {
    id: "undo-10",
    label: "nav:back-10",
    group: "navigate",
    defaults: ["Shift+ArrowLeft", "Shift+Z"],
    run: () => undo(10),
  },
  {
    id: "redo-10",
    label: "nav:forward-10",
    group: "navigate",
    defaults: ["Shift+ArrowRight", "Shift+X"],
    run: () => redo(10),
  },
  { id: "start", label: "nav:start", group: "navigate", defaults: ["Home", "Mod+ArrowLeft"], run: () => undo(9999) },
  { id: "end", label: "nav:end", group: "navigate", defaults: ["End", "Mod+ArrowRight"], run: () => redo(9999) },
  { id: "branch-up", label: "nav:branch-up", group: "navigate", defaults: ["ArrowUp"], run: () => switchBranch(-1) },
  {
    id: "branch-down",
    label: "nav:branch-down",
    group: "navigate",
    defaults: ["ArrowDown"],
    run: () => switchBranch(1),
  },
  { id: "branch-point", label: "nav:branch-point", group: "navigate", defaults: ["B"], run: () => undo("branch") },
  {
    id: "main-branch-point",
    label: "nav:main-branch-point",
    group: "navigate",
    defaults: ["Shift+B"],
    run: () => undo("main-branch"),
  },
  {
    id: "next-mistake",
    label: "nav:next-mistake",
    group: "navigate",
    defaults: ["N"],
    run: () => findMistake("redo"),
  },
  {
    id: "previous-mistake",
    label: "nav:previous-mistake",
    group: "navigate",
    defaults: ["Shift+N"],
    run: () => findMistake("undo"),
  },
  // analyze
  { id: "ponder", label: "analysis:continuous", group: "analyze", defaults: ["Space"], run: togglePondering },
  {
    id: "stop-analysis",
    label: "analysis:stop",
    group: "analyze",
    defaults: ["Escape"],
    run: () => analyzeExtra("stop"),
  },
  { id: "extra", label: "analysis:extra", group: "analyze", defaults: ["A"], run: () => analyzeExtra("extra") },
  {
    id: "equalize",
    label: "analysis:equalize",
    group: "analyze",
    defaults: ["S"],
    run: () => analyzeExtra("equalize"),
  },
  { id: "sweep", label: "analysis:sweep", group: "analyze", defaults: ["D"], run: () => analyzeExtra("sweep") },
  {
    id: "alternatives",
    label: "analysis:alternatives",
    group: "analyze",
    defaults: ["F"],
    run: () => analyzeExtra("alternative"),
  },
  { id: "reset-analysis", label: "analysis:reset", group: "analyze", defaults: ["H"], run: resetAnalysis },
  { id: "region", label: "analysis:region", group: "analyze", defaults: ["G"], run: startRegionSelect },
  { id: "reanalyze", label: "analysis:game", group: "analyze", defaults: ["F2"], run: () => openDialog("reanalyze") },
  { id: "report", label: "analysis:report", group: "analyze", defaults: ["F3"], run: () => openDialog("report") },
  { id: "ai-move", label: "analysis:aimove", group: "analyze", defaults: ["Enter"], run: aiMoveNow },
  { id: "play-to-end", label: "analysis:playtoend", group: "analyze", defaults: ["L"], run: selfplayToEnd },
  {
    id: "tsumego-frame",
    label: "analysis:tsumegoframe",
    group: "analyze",
    defaults: ["F10"],
    run: () => openDialog("tsumego"),
  },
  // view
  {
    id: "mode",
    label: "shortcuts:mode",
    group: "view",
    defaults: ["Tab"],
    run: () => setMode(useStore.getState().mode === MODE_PLAY ? MODE_ANALYZE : MODE_PLAY),
  },
  { id: "show-children", label: "analysis:nextmoves", group: "view", defaults: ["Q"], run: toggle("show_children") },
  { id: "eval", label: "analysis:dots", group: "view", defaults: ["W"], run: toggle("eval") },
  { id: "hints", label: "analysis:topmoves", group: "view", defaults: ["E"], run: toggle("hints") },
  { id: "policy", label: "analysis:policy", group: "view", defaults: ["R"], run: toggle("policy") },
  { id: "ownership", label: "analysis:territory", group: "view", defaults: ["T"], run: toggle("ownership") },
  {
    id: "move-numbers",
    label: "show move numbers",
    group: "view",
    defaults: ["M"],
    run: () => updateConfig((c) => void (c.trainer.show_move_numbers = !c.trainer.show_move_numbers)),
  },
  { id: "coordinates", label: "shortcuts:coordinates", group: "view", defaults: ["K"], run: toggleCoordinates },
  { id: "focus", label: "shortcuts:focus", group: "view", defaults: ["`", "F12"], run: cycleFocusMode },
  { id: "pause-timer", label: "shortcuts:pause-timer", group: "view", defaults: ["Pause"], run: toggleTimerPaused },
  // edit
  { id: "pass", label: "pass-button-text", group: "edit", defaults: ["P"], run: () => playAt(null) },
  {
    id: "delete-node",
    label: "Delete Node",
    group: "edit",
    defaults: ["Mod+Delete", "Mod+Backspace"],
    run: () => editTree("delete"),
  },
  { id: "main-branch", label: "Make Main Branch", group: "edit", defaults: ["PageUp"], run: () => editTree("main") },
  { id: "collapse", label: "Toggle Collapse Branch", group: "edit", defaults: ["C"], run: () => editTree("collapse") },
  { id: "insert", label: "analysis:insert", group: "edit", defaults: ["I"], run: toggleInsertMode },
  { id: "setup", label: "setup:title", group: "edit", defaults: ["U"], run: toggleSetup },
];

export const SHORTCUT_GROUPS: ShortcutAction["group"][] = ["file", "navigate", "analyze", "view", "edit"];

const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

// ---------------------------------------------------------------- key combinations
const CODE_KEYS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
};
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "OS", "Hyper", "Super"]);

/** The key of a key event, without modifiers: "Z", "7", "F2", "ArrowLeft", "`"; null for keys that are no shortcut. */
export function keyName(e: Pick<KeyboardEvent, "key" | "code">): string | null {
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return letter[1];
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (digit) return digit[1];
  if (e.code in CODE_KEYS) return CODE_KEYS[e.code];
  const key = e.key;
  if (!key || MODIFIER_KEYS.has(key) || key === "Process" || key === "Unidentified" || key === "Dead") return null;
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  if (key === "Del") return "Delete";
  return key.length === 1 ? key.toUpperCase() : key;
}

/** The key combination of a key event, such as "Mod+Shift+Z", or null for a modifier key on its own. */
export function comboFromEvent(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string | null {
  const key = keyName(e);
  if (!key) return null;
  return makeCombo(key, { mod: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey });
}

function makeCombo(key: string, m: { mod?: boolean; alt?: boolean; shift?: boolean }): string {
  return [m.mod && "Mod", m.alt && "Alt", m.shift && "Shift", key].filter(Boolean).join("+");
}

/** A combination written by hand ("ctrl+shift+z") in the canonical form ("Mod+Shift+Z"). */
export function normalizeCombo(combo: string): string {
  const parts = combo.split("+");
  // a "+" key: "Shift++" splits into ["Shift", "", ""]
  let key = parts.pop()!;
  if (key === "" && parts.at(-1) === "") {
    parts.pop();
    key = "+";
  }
  const mods = new Set(parts.map((p) => p.trim().toLowerCase()));
  const mod = ["mod", "ctrl", "control", "cmd", "meta", "command"].some((m) => mods.has(m));
  return makeCombo(key.length === 1 ? key.toUpperCase() : key, {
    mod,
    alt: mods.has("alt") || mods.has("option"),
    shift: mods.has("shift"),
  });
}

/** How a combination is shown, such as "Ctrl+Shift+Z" or "⌘⇧Z". */
export function comboLabel(combo: string, mac = IS_MAC): string {
  const parts = combo.split("+");
  let key = parts.pop()!;
  if (key === "" && parts.at(-1) === "") {
    parts.pop();
    key = "+";
  }
  const names: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
    Delete: "Del",
    Backspace: mac ? "⌫" : "Backspace",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Enter: mac ? "↩" : "Enter",
  };
  const modNames: Record<string, string> = mac
    ? { Mod: "⌘", Alt: "⌥", Shift: "⇧" }
    : { Mod: "Ctrl+", Alt: "Alt+", Shift: "Shift+" };
  return parts.map((p) => modNames[p] ?? `${p}+`).join("") + (names[key] ?? key);
}

// ---------------------------------------------------------------- bindings
/** The keys of every action: its own from the config, or its defaults. */
export function resolveBindings(overrides: Record<string, string[]>): Map<string, string[]> {
  const bindings = new Map<string, string[]>();
  for (const a of ACTIONS) bindings.set(a.id, (overrides[a.id] ?? a.defaults).map(normalizeCombo));
  return bindings;
}

/** The action a key combination runs. When the combination has Shift and no action uses it, the one without Shift
 * runs, as the keys of KaTrain mostly did not mind Shift. */
export function actionForCombo(bindings: Map<string, string[]>, combo: string): ShortcutAction | null {
  const find = (c: string) => {
    for (const [id, keys] of bindings) if (keys.includes(c)) return ACTION_BY_ID.get(id) ?? null;
    return null;
  };
  const found = find(combo);
  if (found) return found;
  const withoutShift = combo.replace(/(^|\+)Shift\+/, "$1");
  return withoutShift !== combo ? find(withoutShift) : null;
}

/**
 * The config's shortcuts after giving `action` the keys `keys`: another action that had one of them loses it, and only
 * actions whose keys differ from their defaults are kept. Returns the new overrides and the actions that lost a key.
 */
export function assignKeys(
  overrides: Record<string, string[]>,
  action: string,
  keys: string[],
): { overrides: Record<string, string[]>; changed: string[] } {
  const bindings = resolveBindings(overrides);
  const wanted = [...new Set(keys.map(normalizeCombo))];
  bindings.set(action, wanted);
  const changed: string[] = [];
  for (const [id, ks] of bindings) {
    if (id === action) continue;
    const kept = ks.filter((k) => !wanted.includes(k));
    if (kept.length !== ks.length) {
      bindings.set(id, kept);
      changed.push(id);
    }
  }
  const next: Record<string, string[]> = {};
  for (const a of ACTIONS) {
    const ks = bindings.get(a.id)!;
    const defaults = a.defaults.map(normalizeCombo);
    if (ks.length !== defaults.length || ks.some((k, i) => k !== defaults[i])) next[a.id] = ks;
  }
  return { overrides: next, changed };
}

/** The name of an action. */
export function actionLabel(action: ShortcutAction): string {
  return t(action.label).replace(/\s*\n\s*/g, " ");
}

/** The app's keydown handler. */
export function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.closest?.("input, textarea, select, [contenteditable]")) return;
  const s = useStore.getState();
  if (s.dialog) return; // the dialog has the keyboard: Escape closes it (see App)
  const combo = comboFromEvent(e);
  if (!combo) return;
  if (s.setupTool) {
    // editing the position: 1 to 9 choose a tool, Escape is done
    const tool = /^[1-9]$/.test(combo) ? SETUP_TOOLS[Number(combo) - 1] : null;
    if (tool || combo === "Escape") {
      e.preventDefault();
      if (tool) setSetupTool(tool);
      else finishSetup();
      return;
    }
  }
  const action = actionForCombo(resolveBindings(s.config.shortcuts), combo);
  if (!action) return;
  e.preventDefault();
  action.run();
}

/** The keys of the actions as shown in menus and tooltips, following changes to them. */
export function useShortcutLabels(): (action: string) => string {
  const overrides = useStore((s) => s.config.shortcuts);
  return useMemo(() => {
    const bindings = resolveBindings(overrides);
    return (action: string) => {
      const keys = bindings.get(action) ?? [];
      return keys.length ? comboLabel(keys[0]) : "";
    };
  }, [overrides]);
}
