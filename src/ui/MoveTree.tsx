// The move tree, ported from katrain/gui/widgets/movetree.py: one column per move, one row per branch.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameNode } from "../core/gameNode";
import { t } from "../core/i18n";
import { editTree, goTo, useStore, type TreeEdit } from "../state/store";
import { useShortcutLabels } from "./shortcuts";

const SIZE = 22; // node diameter in px
const GAP = 5;
const STEP = SIZE + GAP;

interface Layout {
  pos: Map<GameNode, [number, number]>;
  children: Map<GameNode, GameNode[]>;
  width: number;
  height: number;
}

/** Children as drawn: a collapsed branch shows its end node in place of the first node on the way. */
function childrenWithShortcuts(node: GameNode): GameNode[] {
  const via = new Map(node.shortcutsTo.map(([to, v]) => [v, to]));
  return node.orderedChildren.map((c) => via.get(c) ?? c);
}

export function layoutTree(root: GameNode): Layout {
  const pos = new Map<GameNode, [number, number]>([[root, [0, 0]]]);
  const children = new Map<GameNode, GameNode[]>();
  const nextY = new Map<number, number>();
  const rootChildren = childrenWithShortcuts(root);
  children.set(root, rootChildren);
  const stack = [...rootChildren].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    const parent = node.shortcutFrom && pos.has(node.shortcutFrom) ? node.shortcutFrom : node.parent!;
    const [px, py] = pos.get(parent)!;
    const x = px + 1;
    const y = Math.max(nextY.get(x) ?? 0, py);
    nextY.set(x, y + 1);
    nextY.set(x - 1, Math.max(y + 1, nextY.get(x - 1) ?? 0));
    pos.set(node, [x, y]);
    const kids = childrenWithShortcuts(node);
    children.set(node, kids);
    stack.push(...[...kids].reverse()); // first child is processed first
  }
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pos.values()) {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { pos, children, width: (maxX + 1) * STEP + GAP, height: (maxY + 1) * STEP + GAP };
}

const cx = (x: number) => GAP + x * STEP + SIZE / 2;

/** The visible part of the tree, in px from its top left corner. */
export interface TreeViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Nodes and lines are drawn this far (px) outside the visible part too, so that scrolling a little shows no gap. */
export const CULL_MARGIN = 10 * STEP;

/**
 * The nodes and connecting lines to draw for a viewport: a tree of a long game with many variations has thousands of
 * nodes, and drawing only those near the visible part keeps re-rendering it cheap while analysis comes in.
 * `keep` nodes are drawn wherever they are (the current node and the one with an open menu).
 */
export function visibleTreeItems(
  layout: Layout,
  view: TreeViewport,
  keep: (GameNode | null)[] = [],
  margin = CULL_MARGIN,
): { nodes: [GameNode, [number, number]][]; lines: string } {
  const x0 = view.left - margin;
  const x1 = view.left + view.width + margin;
  const y0 = view.top - margin;
  const y1 = view.top + view.height + margin;
  const r = SIZE / 2;
  const nodes: [GameNode, [number, number]][] = [];
  const lines: string[] = [];
  for (const [node, p] of layout.pos) {
    const [x, y] = [cx(p[0]), cx(p[1])];
    if ((x + r >= x0 && x - r <= x1 && y + r >= y0 && y - r <= y1) || keep.includes(node)) nodes.push([node, p]);
    for (const c of layout.children.get(node) ?? []) {
      const q = layout.pos.get(c);
      if (!q) continue;
      // the line goes down from the parent to the child's row, then right to the child
      const [qx, qy] = [cx(q[0]), cx(q[1])];
      if (Math.max(x, qx) >= x0 && Math.min(x, qx) <= x1 && Math.max(y, qy) >= y0 && Math.min(y, qy) <= y1)
        lines.push(`M${x},${y}V${qy}H${qx}`);
    }
  }
  return { nodes, lines: lines.join("") };
}

/** The viewport of a scrolled element, as a state update that keeps the old object when nothing changed. */
function viewportOf(el: HTMLElement) {
  return (v: TreeViewport): TreeViewport => {
    const n = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight };
    return n.left === v.left && n.top === v.top && n.width === v.width && n.height === v.height ? v : n;
  };
}

export function MoveTree() {
  const game = useStore((s) => s.game);
  const tick = useStore((s) => s.tick);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ node: GameNode; x: number; y: number } | null>(null);
  const key = useShortcutLabels();
  const [view, setView] = useState<TreeViewport>({ left: 0, top: 0, width: 1000, height: 1000 });

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the game changes in place: tick counts its changes
  const layout = useMemo(() => (game ? layoutTree(game.root) : null), [game, tick]);
  const current = game?.currentNode ?? null;
  const hasTree = layout !== null;

  // keep the current move in view: when it changes or moves in the tree, not with every analysis update (the layout
  // is recomputed then), which would scroll back to it while the tree is being scrolled
  const shown = useRef<{ node: GameNode; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const p = current && layout?.pos.get(current);
    if (!el || !p) return;
    const last = shown.current;
    if (last && last.node === current && last.x === p[0] && last.y === p[1]) return;
    shown.current = { node: current, x: p[0], y: p[1] };
    const [x, y] = [cx(p[0]), cx(p[1])];
    if (x < el.scrollLeft + STEP || x > el.scrollLeft + el.clientWidth - STEP) el.scrollLeft = x - el.clientWidth / 2;
    if (y < el.scrollTop + SIZE / 2 || y > el.scrollTop + el.clientHeight - SIZE / 2)
      el.scrollTop = y - el.clientHeight / 2;
    setView(viewportOf(el)); // before the paint, rather than with the scroll event a frame later
  }, [current, layout]);

  // what is visible: follows scrolling and the size of the panel
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setView(viewportOf(el));
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [hasTree]); // the scroll element is rendered once there is a game

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  if (!game || !layout) return null;
  const { width, height } = layout;
  const visible = visibleTreeItems(layout, view, [current, menu?.node ?? null]);
  // insert mode: green = where the moves are inserted, orange = the inserted moves (current one darker)
  const insertClass = new Map<GameNode, string>();
  if (game.insertAfter) {
    insertClass.set(game.insertAfter.parent!, "insert-parent");
    for (let n: GameNode | null = current; n && n !== game.insertAfter.parent; n = n.parent) {
      insertClass.set(n, n === current ? "insert-current" : "insert-other");
    }
  }

  const act = (edit: TreeEdit) => {
    if (menu) editTree(edit, menu.node);
    setMenu(null);
  };

  return (
    <div className="move-tree panel">
      <div className="move-tree-scroll" ref={scrollRef} role="tree" aria-label={t("a11y:move-tree")}>
        <svg width={width} height={height} className="move-tree-svg">
          <path d={visible.lines} className="tree-line" />
          {visible.nodes.map(([node, [x, y]]) => {
            const placements = node.placements.length + node.clearPlacements.length > 0;
            const label = placements ? "+" : String(node.depth);
            const special =
              insertClass.get(node) ?? (node === current ? "current" : node === menu?.node ? "selected" : "");
            return (
              <g
                key={node.id}
                className={`tree-node ${special}`}
                onClick={() => goTo(node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!node.isRoot) setMenu({ node, x: e.clientX, y: e.clientY });
                }}
              >
                {special && (
                  <rect
                    x={cx(x) - STEP / 2}
                    y={cx(y) - STEP / 2}
                    width={STEP}
                    height={STEP}
                    rx={4}
                    className="tree-highlight"
                  />
                )}
                <circle
                  cx={cx(x)}
                  cy={cx(y)}
                  r={SIZE / 2 - 1}
                  className={`tree-stone ${node.shortcutFrom || placements ? "collapsed" : `stone-${node.player}`} ${node.autoUndo ? "undone" : ""}`}
                />
                <text
                  x={cx(x)}
                  y={cx(y)}
                  className={`tree-label on-${node.shortcutFrom ? "collapsed" : node.player}`}
                  fontSize={label.length > 2 ? 8 : 10}
                >
                  {label}
                </text>
                <title>{node.move ? `${node.depth}: ${node.move.player} ${node.move.gtp()}` : label}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {menu && (
        <div
          className="tree-menu dropdown"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="menu-item" onClick={() => act("delete")}>
            <span>{t("Delete Node")}</span>
            {key("delete-node") && <kbd>{key("delete-node")}</kbd>}
          </button>
          <button className="menu-item" onClick={() => act("main")}>
            <span>{t("Make Main Branch")}</span>
            {key("main-branch") && <kbd>{key("main-branch")}</kbd>}
          </button>
          <button className="menu-item" onClick={() => act("collapse")}>
            <span>{t("Toggle Collapse Branch")}</span>
            {key("collapse") && <kbd>{key("collapse")}</kbd>}
          </button>
          <button className="menu-item" onClick={() => act("prune")}>
            <span>{t("Prune Branch")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
