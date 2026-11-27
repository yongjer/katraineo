// The position editor: setup stones (AB, AW, AE), the player to move (PL) and markup (TR, SQ, CR, MA, LB).

import { MODE_ANALYZE } from "../core/constants";
import type { GameNode } from "../core/gameNode";
import { t } from "../core/i18n";
import type { Coords } from "../core/move";
import {
  clearMarkupAt,
  dropIfEmpty,
  nextLabel,
  setPlayerToMove,
  setSetupStone,
  setupNodeAt,
  toggleMarkup,
} from "../core/setup";
import { get, refresh, set, setStatus, type SetupTool } from "./appState";
import { clearStatus } from "./engineState";
import { markDirty } from "./files";

/** The tools in the order of their keys (1 to 9). */
export const SETUP_TOOLS: SetupTool[] = ["B", "W", "AE", "TR", "SQ", "CR", "MA", "letters", "numbers"];

/** Nodes the editor added after a move to hold setup; the empty ones go when editing ends. */
let created: GameNode[] = [];

export function startSetup(tool: SetupTool = "B") {
  const game = get().game;
  if (!game) return;
  if (game.insertMode) {
    setStatus(t("setup:not-in-insert-mode"), "error");
    return;
  }
  if (!get().setupTool) created = [];
  // analysis mode, so that no AI plays while the position is being set up
  set({ setupTool: tool, mode: MODE_ANALYZE, selectingRegion: false });
  setStatus(t("setup:status"), "info");
  refresh();
}

export function finishSetup() {
  const game = get().game;
  if (game) {
    for (const node of created) {
      if (node.parent && node.empty) {
        if (game.currentNode === node) game.setCurrentNode(node.parent);
        dropIfEmpty(node);
      }
    }
  }
  created = [];
  set({ setupTool: null });
  clearStatus();
  refresh();
}

export function toggleSetup() {
  if (get().setupTool) finishSetup();
  else startSetup();
}

export function setSetupTool(tool: SetupTool) {
  if (!get().setupTool) startSetup(tool);
  else set({ setupTool: tool });
}

/** Whether the current node can take setup stones itself, rather than in a new node after it. */
export function editsInPlace(): boolean {
  const game = get().game;
  return !!game && !game.currentNode.moves.length;
}

/**
 * A click on the board while editing. A stone tool puts a stone of its color on the point, or takes it off when
 * it is already there; `alt` (right click) uses the other color. A markup tool toggles its mark; `alt` erases any.
 */
export function editAt(coords: Coords, alt = false) {
  const { game, setupTool: tool } = get();
  if (!game || !tool) return;
  if (tool === "B" || tool === "W" || tool === "AE") {
    const other = tool === "B" ? "W" : "B";
    let player = tool === "AE" ? null : alt ? other : tool;
    if (player && game.stoneGrid[coords[1]][coords[0]] === player) player = null;
    const { node, created: isNew } = setupNodeAt(game);
    const result = setSetupStone(game, node, coords, player);
    if (result !== "changed") {
      if (isNew) dropIfEmpty(node);
      if (result === "illegal") setStatus(t("setup:illegal"), "error");
      refresh();
      return;
    }
    if (isNew) created.push(node);
    game.setCurrentNode(node);
    game.reanalyze(node.nodesInTree);
    clearStatus();
  } else {
    const node = game.currentNode;
    if (alt) clearMarkupAt(node, coords);
    else if (tool === "letters" || tool === "numbers") toggleMarkup(node, coords, "LB", nextLabel(node, tool));
    else toggleMarkup(node, coords, tool);
  }
  markDirty();
  refresh();
}

/** Switch who plays next at this position (PL), in a new node after a move. */
export function togglePlayerToMove() {
  const game = get().game;
  if (!game) return;
  const player = game.currentNode.nextPlayer === "B" ? "W" : "B";
  const { node, created: isNew } = setupNodeAt(game);
  if (isNew) created.push(node);
  setPlayerToMove(node, player);
  game.setCurrentNode(node);
  // the nodes after it that play no move follow it
  game.reanalyze(node.nodesInTree.filter((n) => n === node || !n.moves.length));
  markDirty();
  refresh();
}
