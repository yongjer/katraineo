// Playing and navigating: moves, undo/redo, branches, editing the move tree, notes and insert mode.

import { MODE_ANALYZE, MODE_PLAY, PLAYER_AI, PLAYER_HUMAN } from "../core/constants";
import { IllegalMoveException } from "../core/game";
import type { GameNode } from "../core/gameNode";
import { t, tf } from "../core/i18n";
import { Move, type Coords } from "../core/move";
import { sounds } from "../ui/sounds";
import { get, refresh, set, setStatus } from "./appState";
import { clearStatus } from "./engineState";
import { markDirty } from "./files";

export function playAt(coords: Coords | null) {
  const { game, config, mode } = get();
  if (!game) return;
  const cn = game.currentNode;
  const minUse = config.timer.minimal_use;
  if (
    coords &&
    minUse &&
    mode === MODE_PLAY &&
    !get().timer.paused &&
    !cn.children.length &&
    config.ui.players[cn.nextPlayer].type !== PLAYER_AI &&
    config.timer.main_time * 60 - game.mainTimeUsed <= 0 &&
    cn.timeUsed < minUse
  ) {
    setStatus(tf("move too fast", { num: minUse }), "teaching");
    return;
  }
  const before = game.prisonerCount.B + game.prisonerCount.W;
  try {
    game.play(new Move(coords, game.currentNode.nextPlayer));
    const after = game.prisonerCount.B + game.prisonerCount.W;
    if (after > before) sounds.capture();
    else if (coords) sounds.stone();
    markDirty();
    clearStatus();
  } catch (e) {
    if (e instanceof IllegalMoveException) setStatus(tf("Illegal move", { reason: t(e.message) }), "error");
    else throw e;
  }
  refresh();
}

export function undo(n: number | "smart" | "branch" | "main-branch" = 1) {
  const { game, mode, config } = get();
  if (!game) return;
  let times = n;
  if (n === "smart") {
    const cn = game.currentNode;
    times =
      mode === MODE_PLAY &&
      config.ui.players[cn.player].type === PLAYER_AI &&
      config.ui.players[cn.nextPlayer].type === PLAYER_HUMAN
        ? 2
        : 1;
  }
  game.undo(times as number | "branch" | "main-branch");
  refresh();
}

export function redo(n = 1) {
  get().game?.redo(n);
  refresh();
}

export function goTo(node: GameNode) {
  get().game?.setCurrentNode(node);
  refresh();
}

export function switchBranch(direction: 1 | -1) {
  get().game?.switchBranch(direction);
  refresh();
}

export function findMistake(direction: "undo" | "redo") {
  const { game, config } = get();
  if (!game) return;
  const threshold = config.trainer.eval_thresholds.at(-4)!;
  if (direction === "redo") game.redo(9999, threshold);
  else game.undo(9999, threshold);
  refresh();
}

export function resign() {
  const game = get().game;
  if (!game) return;
  game.currentNode.endState = `${game.currentNode.player}+R`;
  markDirty();
  refresh();
}

// ---------------------------------------------------------------- move tree editing
export type TreeEdit = "delete" | "prune" | "main" | "collapse";

export function editTree(edit: TreeEdit, node?: GameNode) {
  const game = get().game;
  if (!game) return;
  const target = node ?? game.currentNode;
  if (edit === "delete") game.deleteNode(target);
  else if (edit === "prune") game.pruneBranch(target);
  else if (edit === "main") game.makeMainBranch(target);
  else game.toggleCollapse(target);
  markDirty();
  refresh();
}

export function setNote(note: string) {
  const game = get().game;
  if (game && game.currentNode.note !== note) {
    game.currentNode.note = note;
    markDirty();
  }
}

export function toggleInsertMode() {
  const game = get().game;
  if (!game || get().setupTool) return;
  game.setInsertMode("toggle");
  if (game.insertMode && get().mode !== MODE_ANALYZE) set({ mode: MODE_ANALYZE });
  refresh();
}
