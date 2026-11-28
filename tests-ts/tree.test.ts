import { describe, expect, it } from "vitest";
import { Game, type GameHost, type StatusLevel } from "../src/core/game";
import { GameNode, type KataGoResponse } from "../src/core/gameNode";
import { Move } from "../src/core/move";
import { parseSgf, writeSgf } from "../src/core/sgf";
import { layoutTree, visibleTreeItems } from "../src/ui/MoveTree";
import { host, TRAINER } from "./helpers";

function gameFrom(sgf: string, h: GameHost = host) {
  return new Game(h, null, { moveTree: parseSgf(sgf) });
}

const nodeAt = (g: Game, ...gtp: string[]) => {
  let n = g.root;
  for (const m of gtp) n = n.children.find((c) => c.move?.gtp() === m)!;
  return n;
};

// main line D4 Q16 C3 D3, variation at move 3: R4 Q4
const SGF = "(;GM[1]FF[4]SZ[19];B[dp];W[pd](;B[cq];W[dq])(;B[qp];W[pp]))";

describe("move tree editing (ported from movetree.py)", () => {
  it("makes a variation the main branch", () => {
    const g = gameFrom(SGF);
    const target = nodeAt(g, "D4", "Q16", "R4", "Q4");
    g.makeMainBranch(target);
    expect(g.root.children[0].children[0].children[0].move!.gtp()).toBe("R4");
    expect(g.currentNode).toBe(target);
  });

  it("deletes a node and its subtree", () => {
    const g = gameFrom(SGF);
    const target = nodeAt(g, "D4", "Q16", "C3");
    g.deleteNode(target);
    expect(target.parent!.children.map((c) => c.move!.gtp())).toEqual(["R4"]);
    expect(g.currentNode).toBe(target.parent);
  });

  it("prunes every other branch", () => {
    const g = gameFrom(SGF);
    const target = nodeAt(g, "D4", "Q16", "R4");
    g.pruneBranch(target);
    expect(target.parent!.children).toEqual([target]);
    expect(g.root.nodesInTree.length).toBe(5);
  });

  it("collapses a branch, navigates through it, and survives saving", () => {
    const g = gameFrom(SGF);
    const end = nodeAt(g, "D4", "Q16", "R4", "Q4");
    g.toggleCollapse(end);
    const branchPoint = nodeAt(g, "D4", "Q16");
    expect(end.shortcutFrom).toBe(branchPoint);
    expect(branchPoint.shortcutsTo.map(([to]) => to)).toEqual([end]);

    // the layout shows the collapsed end as a direct child of the branching point
    const layout = layoutTree(g.root);
    expect(layout.pos.get(end)![0]).toBe(layout.pos.get(branchPoint)![0] + 1);
    expect(layout.pos.has(nodeAt(g, "D4", "Q16", "R4"))).toBe(false);

    // undo from the collapsed node jumps back over it
    g.setCurrentNode(end);
    g.undo(1);
    expect(g.currentNode).toBe(branchPoint);

    // saved and reloaded, the shortcut is restored
    const again = gameFrom(writeSgf(g.root));
    const end2 = nodeAt(again, "D4", "Q16", "R4", "Q4");
    expect(end2.shortcutFrom).toBe(nodeAt(again, "D4", "Q16"));

    g.toggleCollapse(end);
    expect(end.shortcutFrom).toBeNull();
    expect(branchPoint.shortcutsTo).toEqual([]);
  });

  it("lays out branches below the main line", () => {
    const g = gameFrom(SGF);
    const layout = layoutTree(g.root);
    expect(layout.pos.get(nodeAt(g, "D4", "Q16", "C3", "D3"))).toEqual([4, 0]);
    expect(layout.pos.get(nodeAt(g, "D4", "Q16", "R4"))).toEqual([3, 1]);
    expect(layout.pos.get(nodeAt(g, "D4", "Q16", "R4", "Q4"))).toEqual([4, 1]);
  });
});

describe("drawing only the visible part of the move tree", () => {
  // a 300 move main line with a 5 move variation at every 20th move
  function bigTree() {
    const root = new GameNode(null, { SZ: 19 });
    let node = root;
    for (let i = 0; i < 300; i++) {
      const player = i % 2 ? "W" : "B";
      const next = new GameNode(node, undefined, new Move([i % 19, Math.floor(i / 19) % 19], player));
      if (i % 20 === 10) {
        let v = new GameNode(node, undefined, new Move([18 - (i % 19), 18], player));
        for (let k = 0; k < 4; k++)
          v = new GameNode(v, undefined, new Move([k, 17], k % 2 ? player : player === "B" ? "W" : "B"));
      }
      node = next;
    }
    return { root, last: node };
  }

  it("draws the nodes and lines near the viewport and the nodes it must keep", () => {
    const { root, last } = bigTree();
    const layout = layoutTree(root);
    const view = { left: 0, top: 0, width: 300, height: 200 };
    const { nodes, lines } = visibleTreeItems(layout, view, [last], 0);
    expect(nodes.length).toBeLessThan(40);
    expect(nodes.map(([n]) => n)).toContain(last);
    expect(nodes.map(([n]) => n)).toContain(root);
    // every line drawn starts or ends near the viewport
    for (const [, x] of lines.matchAll(/M(\d+)/g)) expect(Number(x)).toBeLessThan(340);
  });

  it("draws everything when the whole tree is visible", () => {
    const { root } = bigTree();
    const layout = layoutTree(root);
    const all = visibleTreeItems(layout, { left: 0, top: 0, width: layout.width, height: layout.height });
    expect(all.nodes.length).toBe(layout.pos.size);
    expect(all.lines.match(/M/g)!.length).toBe(layout.pos.size - 1);
  });

  it("follows the viewport when it scrolls", () => {
    const { root } = bigTree();
    const layout = layoutTree(root);
    const end = visibleTreeItems(layout, { left: layout.width - 300, top: 0, width: 300, height: 200 }, [], 0);
    const depths = end.nodes.map(([n]) => n.depth);
    expect(Math.min(...depths)).toBeGreaterThan(280);
  });
});

describe("teaching mode (analyze_undo)", () => {
  const analysis = (score: number): KataGoResponse => ({
    id: "q",
    moveInfos: [{ move: "D4", order: 0, visits: 50, winrate: 0.5, scoreLead: score, pv: ["D4"] }],
    rootInfo: { visits: 50, winrate: 0.5, scoreLead: score },
  });

  function setup(pointsLost: number, prompts = TRAINER.num_undo_prompts) {
    const statuses: [string, StatusLevel][] = [];
    const h: GameHost = {
      ...host,
      trainer: () => ({ ...TRAINER, num_undo_prompts: prompts }),
      setStatus: (m, l) => statuses.push([m, l]),
    };
    const g = new Game(h, null, { moveTree: new GameNode(null, { SZ: 9 }) });
    g.root.setAnalysis(analysis(0));
    const node = g.play(Move.fromGtp("A1", "B"))!;
    node.setAnalysis(analysis(-pointsLost)); // black lost `pointsLost` points
    return { g, node, statuses };
  }

  it("undoes a big mistake and reports it", () => {
    const { g, node, statuses } = setup(7);
    expect(g.analyzeUndo(node)).toBe(true);
    expect(node.autoUndo).toBe(true);
    expect(g.currentNode).toBe(g.root);
    expect(statuses.at(-1)![1]).toBe("teaching");
    // undone moves sort last, so a retry becomes the main line
    const retry = g.play(Move.fromGtp("E5", "B"))!;
    expect(g.root.orderedChildren[0]).toBe(retry);
  });

  it("keeps a good move", () => {
    const { g, node } = setup(0.2);
    expect(g.analyzeUndo(node)).toBe(false);
    expect(node.autoUndo).toBe(false);
    expect(g.currentNode).toBe(node);
  });

  it("allows only the configured number of retries", () => {
    const { g, node } = setup(7, [1, 1, 1, 0.5, 0, 0]);
    g.analyzeUndo(node);
    const second = g.play(Move.fromGtp("B1", "B"))!;
    second.setAnalysis(analysis(-7));
    expect(g.analyzeUndo(second)).toBe(false); // two children now, 1 undo allowed
  });

  it("does not run twice on the same node", () => {
    const { g, node } = setup(0.2);
    g.analyzeUndo(node);
    expect(g.analyzeUndo(node)).toBe(false);
  });
});
