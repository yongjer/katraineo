// Editing a position: setup stones (SGF AB, AW, AE), the player to move (PL) and markup (TR, SQ, CR, MA, LB).

import { Board, suicideAllowed } from "./board";
import type { Player } from "./constants";
import type { Game } from "./game";
import { GameNode, MARKUP_SHAPES, type MarkupKind } from "./gameNode";
import type { Coords } from "./move";

const SETUP_PROPERTIES = ["AB", "AW", "AE"] as const;
const same = (a: Coords, b: Coords) => a[0] === b[0] && a[1] === b[1];

/** A node can hold setup stones when it plays no move; otherwise they go into a new node after it. */
export function canHoldSetup(node: GameNode): boolean {
  return !node.moves.length;
}

/** The node that setup at the current position goes into: the current node, or a new node after it (`created`). */
export function setupNodeAt(game: Game): { node: GameNode; created: boolean } {
  const cn = game.currentNode;
  if (canHoldSetup(cn)) return { node: cn, created: false };
  return { node: new GameNode(cn), created: true };
}

/** Remove a node made by setupNodeAt that ended up with nothing in it. */
export function dropIfEmpty(node: GameNode): boolean {
  if (!node.parent || !node.empty) return false;
  node.parent.children = node.parent.children.filter((c) => c !== node);
  return true;
}

export type SetupResult = "changed" | "unchanged" | "illegal";

/**
 * Put a stone on a point of a setup node, or take it off (player null): the node's AB, AW and AE say how its
 * position differs from the one before it. Nothing changes, and the result is "illegal", when a later move in the
 * tree could no longer be played (a stone on its point, say).
 */
export function setSetupStone(game: Game, node: GameNode, coords: Coords, player: Player | null): SetupResult {
  const rules = game.rules;
  const before = node.parent
    ? Board.after(game.boardSize, node.parent.nodesFromRoot, () => suicideAllowed(rules))
    : null;
  const wasThere = before ? before.stoneGrid[coords[1]][coords[0]] : null;
  const saved = SETUP_PROPERTIES.map((p) => [p, node.getListProperty(p)] as const);
  const now = Board.after(game.boardSize, node.nodesFromRoot, () => suicideAllowed(rules)).stoneGrid;
  if (now[coords[1]][coords[0]] === player) return "unchanged";

  for (const p of SETUP_PROPERTIES) {
    const points = node.pointList(p);
    if (points.some((c) => same(c, coords)))
      node.setPointList(
        p,
        points.filter((c) => !same(c, coords)),
      );
  }
  if (player !== wasThere) {
    const property = player ? `A${player}` : "AE";
    node.setPointList(property, [...node.pointList(property), coords]);
  }
  if (!game.canReplay(node)) {
    for (const [p, values] of saved) {
      if (values) node.setProperty(p, values);
      else node.clearProperty(p);
    }
    return "illegal";
  }
  return "changed";
}

/** Set who plays next at a setup node (PL). */
export function setPlayerToMove(node: GameNode, player: Player) {
  node.setProperty("PL", player);
}

/** The markup on a point of the node, if any. */
export function markupAt(node: GameNode, coords: Coords) {
  return node.markup.find((m) => same(m.coords, coords)) ?? null;
}

/** Take any markup off a point. Returns whether there was some. */
export function clearMarkupAt(node: GameNode, coords: Coords): boolean {
  let found = false;
  for (const kind of MARKUP_SHAPES) {
    const points = node.pointList(kind);
    if (points.some((c) => same(c, coords))) {
      found = true;
      node.setPointList(
        kind,
        points.filter((c) => !same(c, coords)),
      );
    }
  }
  const labels = node.labels;
  if (labels.some((l) => same(l.coords, coords))) {
    found = true;
    node.setLabels(labels.filter((l) => !same(l.coords, coords)));
  }
  return found;
}

/**
 * Put a mark or label on a point, replacing any other markup there, or take it off when the point already has
 * this kind of markup (a label of any text).
 */
export function toggleMarkup(node: GameNode, coords: Coords, kind: MarkupKind, label = "") {
  const existing = markupAt(node, coords);
  clearMarkupAt(node, coords);
  if (existing?.kind === kind) return;
  if (kind === "LB") node.setLabels([...node.labels, { coords, text: label }]);
  else node.setPointList(kind, [...node.pointList(kind), coords]);
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** The next label not yet on the node: A, B, C, … (then a, b, c, …) or 1, 2, 3, …. */
export function nextLabel(node: GameNode, style: "letters" | "numbers"): string {
  const used = new Set(node.labels.map((l) => l.text));
  if (style === "letters") {
    for (const c of LETTERS) if (!used.has(c)) return c;
  }
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}
