import { describe, expect, it, vi } from "vitest";

vi.mock("../src/state/platform", () => ({
  platform: { saveConfig: async () => {}, autosave: async () => {}, clearAutosave: async () => {} },
}));

import { Board } from "../src/core/board";
import { KataGoEngine, type EngineSettings, type EngineTransport } from "../src/core/engine";
import { Game } from "../src/core/game";
import { GameNode } from "../src/core/gameNode";
import { Move, type Coords } from "../src/core/move";
import { parseSgf, writeSgf } from "../src/core/sgf";
import { clearMarkupAt, nextLabel, setSetupStone, setupNodeAt, toggleMarkup } from "../src/core/setup";
import { editAt, finishSetup, startSetup, togglePlayerToMove, useStore } from "../src/state/store";
import { host } from "./helpers";

type Query = Record<string, unknown>;

const gameOf = (sgf: string) => new Game(host, null, { moveTree: parseSgf(sgf) });
const at = (gtp: string): Coords => Move.fromGtp(gtp).coords!;
const stoneAt = (g: Game, gtp: string) => g.stoneGrid[at(gtp)[1]][at(gtp)[0]];
const end = (g: Game) => {
  g.redo(999);
  return g;
};

describe("setup stones (AB, AW, AE)", () => {
  it("replace what is on their point, as SGF says", () => {
    const g = end(gameOf("(;SZ[9];B[ee];W[dd];AB[dd])"));
    expect(stoneAt(g, "D6")).toBe("B");
    expect(g.stones.length).toBe(2);
  });

  it("capture nothing", () => {
    // a white stone surrounded by black setup stones stays on the board
    const g = end(gameOf("(;SZ[9]AW[ee]AB[de][fe][ed][ef])"));
    expect(stoneAt(g, "E5")).toBe("W");
    expect(g.prisoners.length).toBe(0);
  });

  it("are set up before the move of their node, and keep the prisoners so far", () => {
    const g = end(gameOf("(;SZ[9];B[ba];W[aa];B[ab];AE[ee]AB[cc]W[ee])"));
    expect(g.prisoners.map((m) => m.gtp())).toEqual(["A9"]);
    expect(stoneAt(g, "E5")).toBe("W"); // AE first, then the move
    expect(stoneAt(g, "C7")).toBe("B");
  });

  it("take stones off with AE, and moves go on from there", () => {
    const g = end(gameOf("(;SZ[9];B[ee];W[dd];AE[ee];B[ee])"));
    expect(stoneAt(g, "E5")).toBe("B");
    expect(g.stones.length).toBe(2);
  });

  it("let the player to move be set on a node after the root (PL)", () => {
    const tree = parseSgf("(;SZ[9];B[ee];AB[cc]PL[B];B[gg])");
    const setup = tree.children[0].children[0];
    expect(setup.isSetup).toBe(true);
    expect(setup.nextPlayer).toBe("B");
    expect(tree.children[0].nextPlayer).toBe("W");
  });

  it("build the same position on a board of their own", () => {
    const g = end(gameOf("(;SZ[9]AB[aa:bb];W[ee];AE[aa]AW[cc])"));
    const board = Board.after([9, 9], g.currentNode.nodesFromRoot);
    expect(board.stoneGrid).toEqual(g.stoneGrid);
  });
});

describe("markup (TR, SQ, CR, MA, LB)", () => {
  it("is read from the node, with compressed point lists", () => {
    const node = parseSgf("(;SZ[9]TR[aa:bb]SQ[cc]CR[dd]MA[ee]LB[ff:A][gg:12])");
    const marks = node.markup.map((m) => `${m.kind} ${new Move(m.coords).gtp()}${m.label ? ` ${m.label}` : ""}`);
    expect(marks.sort()).toEqual(
      ["CR D6", "LB F4 A", "LB G3 12", "MA E5", "SQ C7", "TR A8", "TR A9", "TR B8", "TR B9"].sort(),
    );
  });

  it("is toggled, one markup per point", () => {
    const node = new GameNode(null, { SZ: 9 });
    toggleMarkup(node, at("C3"), "TR");
    expect(node.getListProperty("TR")).toEqual(["cg"]);
    toggleMarkup(node, at("C3"), "SQ"); // replaces the triangle
    expect(node.hasProperty("TR")).toBe(false);
    expect(node.getListProperty("SQ")).toEqual(["cg"]);
    toggleMarkup(node, at("C3"), "SQ"); // and off again
    expect(node.markup).toEqual([]);
    toggleMarkup(node, at("D4"), "LB", nextLabel(node, "letters"));
    toggleMarkup(node, at("E5"), "LB", nextLabel(node, "letters"));
    toggleMarkup(node, at("F6"), "LB", nextLabel(node, "numbers"));
    expect(node.getListProperty("LB")).toEqual(["df:A", "ee:B", "fd:1"]);
    expect(clearMarkupAt(node, at("D4"))).toBe(true);
    expect(nextLabel(node, "letters")).toBe("A");
    expect(clearMarkupAt(node, at("D4"))).toBe(false);
  });

  it("is kept in the SGF", () => {
    const tree = parseSgf("(;SZ[9]LB[aa:x\\]y]TR[bb])");
    expect(tree.labels).toEqual([{ coords: at("A9"), text: "x]y" }]);
    const again = parseSgf(writeSgf(tree));
    expect(again.markup).toEqual(tree.markup);
  });
});

describe("editing setup stones", () => {
  it("edits a node without a move in place, as differences from the position before it", () => {
    const g = end(gameOf("(;SZ[9];B[ee];W[dd];AB[cc])"));
    const setup = g.currentNode;
    expect(setupNodeAt(g)).toEqual({ node: setup, created: false });
    expect(setSetupStone(g, setup, at("E5"), null)).toBe("changed"); // a stone from before: AE
    expect(setup.getListProperty("AE")).toEqual(["ee"]);
    expect(setSetupStone(g, setup, at("E5"), "W")).toBe("changed"); // AW replaces the AE
    expect(setup.hasProperty("AE")).toBe(false);
    expect(setup.getListProperty("AW")).toEqual(["ee"]);
    expect(setSetupStone(g, setup, at("E5"), "B")).toBe("changed"); // back to what was there: nothing to set up
    expect(setup.hasProperty("AW")).toBe(false);
    expect(setSetupStone(g, setup, at("C7"), null)).toBe("changed");
    expect(setup.hasProperty("AB")).toBe(false);
    expect(setSetupStone(g, setup, at("C7"), null)).toBe("unchanged");
  });

  it("puts setup after a move into a new node", () => {
    const g = end(gameOf("(;SZ[9];B[ee])"));
    const { node, created } = setupNodeAt(g);
    expect(created).toBe(true);
    expect(node.parent).toBe(g.currentNode);
  });

  it("refuses a stone where a later move is played", () => {
    const g = gameOf("(;SZ[9];B[ee];W[dd])");
    expect(setSetupStone(g, g.root, at("D6"), "B")).toBe("illegal");
    expect(g.root.hasProperty("AB")).toBe(false);
    expect(setSetupStone(g, g.root, at("A1"), "B")).toBe("changed");
    expect(g.root.getListProperty("AB")).toEqual(["ai"]);
  });
});

describe("analysis after setup", () => {
  const settings = {
    max_visits: 100,
    fast_visits: 10,
    max_time: 8,
    wide_root_noise: 0,
    _enable_ownership: true,
  } as unknown as EngineSettings;
  const queryFor = (node: GameNode): Query => {
    const engine = new KataGoEngine({ setHandlers: () => {} } as unknown as EngineTransport, settings);
    let sent: Query | null = null;
    vi.spyOn(engine, "sendQuery").mockImplementation((q) => void (sent = q));
    engine.requestAnalysis(node, { callback: () => {} });
    return sent!;
  };
  const stonesOf = (q: Query) => (q.initialStones as string[][]).map((s) => s.join(" ")).sort();

  it("starts from the root's stones when only the root sets up", () => {
    const tree = parseSgf("(;SZ[9]HA[2]AB[cc][gg];W[ee];B[dd])");
    const q = queryFor(tree.children[0].children[0]);
    expect(stonesOf(q)).toEqual(["B C7", "B G3"]);
    expect(q.moves).toEqual([
      ["W", "E5"],
      ["B", "D6"],
    ]);
    expect(q.initialPlayer).toBe("W");
  });

  it("starts from the whole position at a setup node later in the game", () => {
    // white's stone at A9 was captured; the setup puts a black stone there, which replaying the game could not do
    const tree = parseSgf("(;SZ[9];B[ba];W[aa];B[ab];AB[aa]AE[ab]PL[B];B[ee];W[dd])");
    const last = tree.nodesInTree.at(-1)!;
    const q = queryFor(last);
    expect(stonesOf(q)).toEqual(["B A9", "B B9"]);
    expect(q.moves).toEqual([
      ["B", "E5"],
      ["W", "D6"],
    ]);
    expect(q.initialPlayer).toBe("B");
    expect(q.analyzeTurns).toEqual([2]);
    // and at the setup node itself, the player to move is the one it sets
    const setup = tree.children[0].children[0].children[0].children[0];
    expect(queryFor(setup).initialPlayer).toBe("B");
    expect(queryFor(setup).moves).toEqual([]);
  });
});

describe("the position editor", () => {
  const load = (sgf: string) => {
    const game = end(gameOf(sgf));
    useStore.setState({ game, setupTool: null, dialog: null });
    return game;
  };

  it("adds a setup node after a move, and drops it again if it ends up empty", () => {
    const g = load("(;SZ[9];B[ee])");
    const move = g.currentNode;
    startSetup("W");
    editAt(at("C3"));
    const setup = g.currentNode;
    expect(setup.parent).toBe(move);
    expect(setup.getListProperty("AW")).toEqual(["cg"]);
    editAt(at("C3")); // off again
    expect(setup.empty).toBe(true);
    finishSetup();
    expect(useStore.getState().setupTool).toBeNull();
    expect(move.children).toEqual([]);
    expect(g.currentNode).toBe(move);
  });

  it("puts the other color with a right click, and marks without changing the stones", () => {
    const g = load("(;SZ[9])");
    startSetup("B");
    editAt(at("D4"), true);
    expect(g.root.getListProperty("AW")).toEqual(["df"]);
    useStore.setState({ setupTool: "TR" });
    editAt(at("D4"));
    expect(g.root.getListProperty("TR")).toEqual(["df"]);
    editAt(at("D4"), true); // right click erases the mark
    expect(g.root.hasProperty("TR")).toBe(false);
    expect(g.currentNode).toBe(g.root);
    finishSetup();
  });

  it("switches the player to move", () => {
    const g = load("(;SZ[9]AB[cc])");
    expect(g.currentNode.nextPlayer).toBe("W");
    startSetup();
    togglePlayerToMove();
    expect(g.root.getProperty("PL")).toBe("B");
    expect(g.currentNode.nextPlayer).toBe("B");
    finishSetup();
  });

  it("says why a stone cannot go where a later move is played", () => {
    const g = load("(;SZ[9];B[ee];W[dd])");
    g.setCurrentNode(g.root);
    startSetup("B");
    editAt(at("D6"));
    expect(g.root.hasProperty("AB")).toBe(false);
    expect(useStore.getState().status?.level).toBe("error");
    finishSetup();
  });
});
