// Ported from katrain/core/game.py: board state with capture rules, navigation and analysis requests.

import {
  PRIORITY_ALTERNATIVES,
  PRIORITY_DEFAULT,
  PRIORITY_EQUALIZE,
  PRIORITY_EXTRA_ANALYSIS,
  PRIORITY_GAME_ANALYSIS,
  PRIORITY_SWEEP,
  PROGRAM_NAME,
  type Player,
} from "./constants";
import { Board, IllegalMoveException, suicideAllowed } from "./board";
import { getRules, type KataGoEngine, type Rules } from "./engine";
import { GameNode, type SgfSaveOptions } from "./gameNode";
import { t, tf } from "./i18n";
import { Move, type Coords } from "./move";
import { writeSgf } from "./sgf";
import { varToGrid, weightedSelectionWithoutReplacement } from "./utils";

export { IllegalMoveException };

export type StatusLevel = "analysis" | "info" | "teaching" | "error";

export interface TrainerSettings {
  eval_thresholds: number[];
  /** per evaluation class: undos allowed in teaching games (fractions are probabilities) */
  num_undo_prompts: number[];
  show_dots: boolean[];
  save_feedback: boolean[];
  save_analysis: boolean;
  save_marks: boolean;
  eval_show_ai: boolean;
  eval_on_show_last: number;
  low_visits: number;
  top_moves_show: string;
  top_moves_show_secondary: string;
  extra_precision: boolean;
  theme: string;
}

/** What a Game needs from the application around it. */
export interface GameHost {
  trainer(): TrainerSettings;
  isAi(player: Player): boolean;
  setStatus(message: string, level: StatusLevel): void;
  log(message: string): void;
}

export interface NewGameSettings {
  size: string;
  komi: number;
  handicap: number;
  rules: string;
}

export type ExtraAnalysisMode = "stop" | "ponder" | "extra" | "game" | "sweep" | "equalize" | "alternative" | "local";

function timestampId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())} ${p(d.getMinutes())} ${p(d.getSeconds())}`;
}

export class Game {
  readonly gameId = timestampId();
  root: GameNode;
  currentNode!: GameNode;
  sgfFilename: string | null;
  externalGame = false;
  regionOfInterest: number[] | null = null;
  /** insert mode: the original next move, whose line gets copied after the inserted moves */
  insertAfter: GameNode | null = null;
  /** seconds of main time used (timer) */
  mainTimeUsed = 0;
  /** cleared when the app moves on to another game, so background work (self-play) stops */
  active = true;

  /** the stones at the current node */
  private position!: Board;

  constructor(
    private host: GameHost,
    public engine: KataGoEngine | null,
    opts: { moveTree?: GameNode; newGame?: NewGameSettings; sgfFilename?: string | null; analyzeFast?: boolean } = {},
  ) {
    this.sgfFilename = opts.sgfFilename ?? null;
    if (opts.moveTree) {
      this.root = opts.moveTree;
      this.externalGame = !/katrain/i.test(this.root.getProperty("AP", "")); // also games saved by the original KaTrain
      const handicap = Math.trunc(this.root.handicap);
      let numStartingMovesBlack = 0;
      let node = this.root;
      while (node.children.length) {
        node = node.children[0];
        if (node.player === "B") numStartingMovesBlack++;
        else break;
      }
      if (
        handicap >= 2 &&
        !this.root.placements.length &&
        numStartingMovesBlack !== handicap &&
        !(this.root.children.length && this.root.children[0].placements.length)
      ) {
        this.root.placeHandicapStones(handicap);
      }
    } else {
      const s = opts.newGame ?? { size: "19", komi: 6.5, handicap: 0, rules: "japanese" };
      this.root = new GameNode(null, { GM: 1, FF: 4, DT: this.gameId, SZ: s.size, KM: s.komi, RU: s.rules });
      if (s.handicap) {
        this.root.setProperty("HA", s.handicap);
        this.root.placeHandicapStones(s.handicap);
      }
    }
    if (!this.root.getProperty("RU")) this.root.setProperty("RU", opts.newGame?.rules ?? "japanese");
    // restore collapsed branches saved by KaTrain
    const nodes = this.root.nodesInTree;
    const byShortcutId = new Map(nodes.filter((n) => n.hasProperty("KTSID")).map((n) => [n.getProperty("KTSID")!, n]));
    for (const n of nodes) {
      const from = n.getProperty("KTSF");
      if (from && byShortcutId.has(from)) byShortcutId.get(from)!.addShortcut(n);
    }
    this.setCurrentNode(this.root);
    this.analyzeAllNodes(PRIORITY_GAME_ANALYSIS, opts.analyzeFast ?? !opts.moveTree, false);
  }

  // ---------------------------------------------------------------- board state
  private newBoard(): Board {
    return new Board(this.boardSize, () => suicideAllowed(this.rules));
  }

  /** The position at the current node, replayed from the root. */
  private calculateGroups() {
    this.position = this.newBoard();
    try {
      for (const node of this.currentNode.nodesFromRoot) this.position.applyNode(node);
    } catch (e) {
      if (e instanceof IllegalMoveException) throw new Error(`Unexpected illegal move (${e.message})`);
      throw e;
    }
  }

  /** Whether every line through the node can still be replayed, e.g. after its setup stones changed. */
  canReplay(node: GameNode): boolean {
    const leaves = node.nodesInTree.filter((n) => !n.children.length);
    try {
      for (const leaf of leaves) Board.after(this.boardSize, leaf.nodesFromRoot, () => suicideAllowed(this.rules));
      return true;
    } catch (e) {
      if (e instanceof IllegalMoveException) return false;
      throw e;
    }
  }

  get board(): number[][] {
    return this.position.board;
  }
  get chains(): Move[][] {
    return this.position.chains;
  }
  get prisoners(): Move[] {
    return this.position.prisoners;
  }
  get lastCapture(): Move[] {
    return this.position.lastCapture;
  }

  get boardSize(): [number, number] {
    return this.root.boardSize;
  }
  get komi(): number {
    return this.root.komi;
  }
  get rules(): Rules {
    return getRules(this.root.ruleset);
  }
  get stones(): Move[] {
    return this.position.stones;
  }

  /** player at each point, indexed [y][x]. */
  get stoneGrid(): (Player | null)[][] {
    return this.position.stoneGrid;
  }

  get prisonerCount(): Record<Player, number> {
    return {
      B: this.prisoners.filter((m) => m.player === "B").length,
      W: this.prisoners.filter((m) => m.player === "W").length,
    };
  }

  // ---------------------------------------------------------------- navigation
  get insertMode(): boolean {
    return this.insertAfter !== null;
  }

  setCurrentNode(node: GameNode) {
    if (this.insertMode && node !== this.currentNode) {
      this.host.setStatus(t("finish inserting before navigating"), "error");
      return;
    }
    this.currentNode = node;
    this.calculateGroups();
  }

  /** Play a move from the current position. Throws IllegalMoveException if invalid. */
  play(move: Move, opts: { ignoreKo?: boolean; analyze?: boolean; expectedNode?: GameNode } = {}): GameNode | null {
    const [sx, sy] = this.boardSize;
    if (
      !move.isPass &&
      !(move.coords![0] >= 0 && move.coords![0] < sx && move.coords![1] >= 0 && move.coords![1] < sy)
    ) {
      throw new IllegalMoveException(`Move ${move} outside of board coordinates`);
    }
    if (opts.expectedNode && this.currentNode !== opts.expectedNode) return null;
    try {
      this.position.play(move, opts.ignoreKo ?? false);
    } catch (e) {
      this.calculateGroups(); // roll the half-applied move back off the board
      throw e;
    }
    const played = this.currentNode.play(move);
    this.currentNode = played;
    if (opts.analyze ?? true) {
      if (this.regionOfInterest) {
        this.analyze(played, { analyzeFast: true });
        this.analyze(played, { regionOfInterest: this.regionOfInterest });
      } else {
        this.analyze(played);
      }
    }
    return played;
  }

  undo(nTimes: number | "branch" | "main-branch" = 1, stopOnMistake: number | null = null) {
    if (this.insertMode) {
      // in insert mode, undo deletes the last inserted move
      const cn = this.currentNode;
      if (nTimes === 1 && cn.parent && !this.insertAfter!.nodesFromRoot.includes(cn)) {
        cn.parent.children = cn.parent.children.filter((c) => c !== cn);
        this.currentNode = cn.parent;
        this.calculateGroups();
      }
      return;
    }
    let cn = this.currentNode;
    let breakOnBranch = false;
    let breakOnMainBranch = false;
    let lastBranchingNode = cn;
    let n: number;
    if (nTimes === "branch") {
      n = 9999;
      breakOnBranch = true;
    } else if (nTimes === "main-branch") {
      n = 9999;
      breakOnMainBranch = true;
    } else n = nTimes;
    for (let i = 0; i < n; i++) {
      const pl = cn.pointsLost;
      if (stopOnMistake !== null && pl !== null && pl >= stopOnMistake && !this.host.isAi(cn.player)) {
        this.setCurrentNode(cn.parent!);
        return;
      }
      const previous = cn;
      if (cn.shortcutFrom) cn = cn.shortcutFrom;
      else if (!cn.isRoot) cn = cn.parent!;
      else break;
      if (breakOnBranch && cn.children.length > 1) break;
      if (breakOnMainBranch && cn.orderedChildren[0] !== previous) lastBranchingNode = cn;
    }
    if (breakOnMainBranch) cn = lastBranchingNode;
    if (cn !== this.currentNode) this.setCurrentNode(cn);
  }

  redo(nTimes = 1, stopOnMistake: number | null = null) {
    if (this.insertMode) return;
    let cn = this.currentNode;
    for (let i = 0; i < nTimes; i++) {
      if (cn.children.length) {
        const child = cn.orderedChildren[0];
        const shortcut = cn.shortcutsTo.find(([, via]) => via === child); // jump over a collapsed branch
        cn = shortcut ? shortcut[0] : child;
      }
      const pl = cn.pointsLost;
      if (i > 0 && stopOnMistake !== null && pl !== null && pl >= stopOnMistake && !this.host.isAi(cn.player)) {
        this.setCurrentNode(cn.parent!);
        return;
      }
    }
    if (stopOnMistake === null) this.setCurrentNode(cn);
  }

  /** Move to the sibling branch above/below the current one at the nearest branching point. */
  switchBranch(direction: 1 | -1) {
    const path = this.currentNode.nodesFromRoot;
    for (let i = path.length - 1; i > 0; i--) {
      const parent = path[i - 1];
      if (parent.children.length > 1) {
        const siblings = parent.orderedChildren;
        const ix = siblings.indexOf(path[i]);
        const target = siblings[ix + direction];
        if (!target) return;
        // keep the same depth below the branching point if possible
        let node = target;
        for (let k = i + 1; k < path.length && node.children.length; k++) node = node.orderedChildren[0];
        this.setCurrentNode(node);
        return;
      }
    }
  }

  /** The main line through the current node: root..current, then first children to the end. */
  get mainLineThroughCurrent(): GameNode[] {
    const nodes = this.currentNode.nodesFromRoot;
    let n = this.currentNode;
    while (n.children.length) {
      n = n.orderedChildren[0];
      nodes.push(n);
    }
    return nodes;
  }

  get endResult(): string | null {
    const cn = this.currentNode;
    if (cn.endState) return cn.endState;
    if (cn.parent && cn.isPass && cn.parent.isPass) return this.manualScore ?? t("board-game-end");
    return null;
  }

  get manualScore(): string | null {
    const cn = this.currentNode;
    const rules = this.rules;
    if (
      !cn.ownership ||
      !["jp", "japanese"].includes(String(rules).toLowerCase()) ||
      !cn.parent ||
      !cn.parent.ownership
    ) {
      if (!cn.score) return null;
      return cn.formatScore(Math.round(2 * cn.score) / 2) + "?";
    }
    const [sx, sy] = this.boardSize;
    const mean = cn.ownership.map((c, i) => (c + cn.parent!.ownership![i]) / 2);
    const grid = varToGrid(mean, [sx, sy]);
    const stones = new Map(this.stones.map((m) => [`${m.coords![0]},${m.coords![1]}`, m.player]));
    const lo = 0.15;
    const hi = 0.85;
    const scoreSquare = (key: string, owner: number): number => {
      const player = stones.get(key);
      if ((player === "B" && owner > hi) || (player === "W" && owner < -hi) || Math.abs(owner) < lo) return 0;
      if (player === undefined && Math.abs(owner) >= hi) return Math.round(owner);
      if ((player === "B" && owner < -hi) || (player === "W" && owner > hi)) return 2 * Math.round(owner);
      return NaN;
    };
    const scored: number[] = [];
    for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) scored.push(scoreSquare(`${x},${y}`, grid[y][x]));
    const count = (v: number) => scored.filter((s) => s === v).length;
    const unknown = scored.filter((s) => Number.isNaN(s)).length;
    const prisoners = this.prisonerCount;
    const score = [-2, -1, 0, 1, 2].reduce((acc, v) => acc + v * count(v), 0) + prisoners.W - prisoners.B - this.komi;
    if (unknown > 10 || count(0) - stones.size > 4 * (sx + sy)) return null;
    return cn.formatScore(score);
  }

  // ---------------------------------------------------------------- insert mode
  /**
   * Insert mode (Game.set_insert_mode): play extra moves before the next move of the game, then on leaving
   * insert mode copy the rest of the original line after them.
   */
  setInsertMode(mode: boolean | "toggle") {
    const on = mode === "toggle" ? !this.insertMode : mode;
    if (on === this.insertMode) return;
    if (on) {
      const children = this.currentNode.orderedChildren;
      if (!children.length) return;
      this.insertAfter = children[0];
      this.host.setStatus(t("starting insert mode"), "info");
      return;
    }
    const insertAfter = this.insertAfter!;
    this.insertAfter = null;
    let copyFrom = insertAfter;
    let copyTo = this.currentNode;
    let numCopied = 0;
    if (copyTo === insertAfter.parent) {
      this.host.setStatus("", "info");
      return;
    }
    const aboveInsertionRoot = new Set(insertAfter.parent!.nodesFromRoot);
    const alreadyInserted = copyTo.nodesFromRoot
      .filter((n) => !aboveInsertionRoot.has(n) && n.move)
      .map((n) => n.move!);
    try {
      for (;;) {
        for (const m of copyFrom.moveWithPlacements) {
          if (alreadyInserted.some((a) => a.equals(m))) continue;
          this.position.play(m, true);
          const props = Object.fromEntries([...copyFrom.properties].map(([k, v]) => [k, [...v]]));
          copyTo = new GameNode(copyTo, props);
          numCopied++;
        }
        if (!copyFrom.children.length) break;
        copyFrom = copyFrom.orderedChildren[0];
      }
    } catch (e) {
      if (!(e instanceof IllegalMoveException)) throw e; // an illegal move ends the copy
    }
    this.calculateGroups();
    this.host.setStatus(tf("ending insert mode", { num_copied: numCopied }), "info");
    this.analyzeAllNodes(PRIORITY_GAME_ANALYSIS, true, false);
  }

  // ---------------------------------------------------------------- self-play
  /**
   * AI self-play from the current node (Game.selfplay). With untilMove "end", plays the best move to the end of
   * the game in a collapsed branch. With a move number and target score, generates a game that reaches roughly
   * that score for Black by that move ("Set up Position").
   */
  selfplay(untilMove: number | "end", targetBAdvantage: number | null = null) {
    const engine = this.engine;
    if (!engine) return;
    const cn = this.currentNode;
    const setup = untilMove !== "end" && targetBAdvantage !== null;
    const analysisOpts = setup ? { visits: Math.max(25, engine.settings.fast_visits) } : {};
    const extraSettings = setup ? { wideRootNoise: 0.03 } : {};
    const generation = engine.queryGeneration;

    const request = (node: GameNode) => {
      engine.requestAnalysis(node, {
        callback: (result, partial) => {
          if (partial) return;
          node.setAnalysis(result);
          analyzeAndPlay(node);
        },
        priority: PRIORITY_DEFAULT,
        analyzeFast: true,
        extraSettings,
        ...analysisOpts,
      });
    };

    const analyzeAndPlay = (node: GameNode) => {
      if (!this.active || engine.queryGeneration !== generation) return; // a new game happened
      const cands = node.candidateMoves;
      let thoughts = "Move generated by AI self-play\n";
      let move: Move;
      if (setup) {
        if (node.depth >= (untilMove as number) || cands[0]?.move === "pass") {
          this.setCurrentNode(node);
          return;
        }
        const until = untilMove as number;
        const target = cn.score! + ((node.depth - cn.depth + 1) * (targetBAdvantage! - cn.score!)) / (until - cn.depth);
        const maxLoss = 5;
        const stddev = Math.min(3, 0.5 + (until - node.depth) * 0.15);
        thoughts += `Selecting moves aiming at score ${target.toFixed(1)} +/- ${stddev.toFixed(2)} with < ${maxLoss} points lost\n`;
        let info;
        if (Math.abs(node.score! - target) < 3 * stddev) {
          const weighted = cands
            .filter((d, i) => d.pointsLost < maxLoss || i === 0)
            .map(
              (d) =>
                [
                  d,
                  Math.exp(-0.5 * (Math.abs(d.scoreLead - target) / stddev) ** 2) *
                    Math.exp(-0.5 * (Math.min(0, d.pointsLost) / maxLoss) ** 2),
                ] as const,
            );
          info = weightedSelectionWithoutReplacement([...weighted], (w) => w[1], 1)[0][0];
          for (const [d, wt] of weighted) {
            thoughts += `Move option: ${d.move} score ${d.scoreLead.toFixed(2)} loss ${d.pointsLost.toFixed(2)} weight ${wt.toExponential(3)}\n`;
          }
        } else {
          info = cands.reduce((best, d) =>
            Math.abs(d.scoreLead - target) < Math.abs(best.scoreLead - target) ? d : best,
          );
          thoughts += `Move played to close difference between score ${node.score!.toFixed(1)} and target ${target.toFixed(1)} quickly.`;
        }
        move = Move.fromGtp(info.move, node.nextPlayer);
      } else if (cands.length) {
        move = Move.fromGtp(cands[0].move, node.nextPlayer);
      } else {
        const pol = node.policyRanking;
        move = pol ? pol[0][1] : Move.pass(node.nextPlayer);
      }
      if (move.isPass) {
        if (this.currentNode === cn) this.setCurrentNode(node);
        return;
      }
      const next = new GameNode(node, undefined, move);
      next.aiThoughts = thoughts;
      if (setup) {
        this.setCurrentNode(next);
        this.host.setStatus(tf("setup game status message", { move: next.depth, until_move: untilMove }), "info");
      } else {
        if (node !== cn) node.removeShortcut();
        cn.addShortcut(next);
      }
      request(next);
    };

    request(cn);
  }

  // ---------------------------------------------------------------- tree editing (move tree menu)
  /** Delete a node and its subtree, then go to its parent. */
  deleteNode(node: GameNode) {
    if (!node.parent) return;
    let parent: GameNode;
    if (node.shortcutFrom) {
      parent = node.shortcutFrom;
      const via = parent.shortcutsTo.find(([m]) => m === node)?.[1];
      node.removeShortcut();
      if (via) via.parent!.children = via.parent!.children.filter((c) => c !== via);
    } else {
      parent = node.parent;
      parent.children = parent.children.filter((c) => c !== node);
    }
    this.setCurrentNode(parent);
  }

  /** Remove every branch except the line leading to this node. */
  pruneBranch(node: GameNode) {
    if (!node.parent) return;
    for (let n = node; n.parent; n = n.parent) n.parent.children = [n];
    this.setCurrentNode(node);
  }

  /** Make the line leading to this node the main line. */
  makeMainBranch(node: GameNode) {
    if (!node.parent) return;
    for (let n = node; n.parent; n = n.parent) {
      n.parent.children = [n, ...n.parent.children.filter((c) => c !== n)];
    }
    this.setCurrentNode(node);
  }

  /** Collapse the branch leading to this node into a single edge, or expand it again. */
  toggleCollapse(node: GameNode) {
    if (!node.parent) return;
    if (node.shortcutFrom) {
      node.removeShortcut();
      return;
    }
    let n = node.parent;
    while (n.children.length === 1 && !n.isRoot && !n.shortcutFrom) n = n.parent!;
    n.addShortcut(node);
  }

  // ---------------------------------------------------------------- teaching
  /**
   * Teaching games: once a human's move and its parent are analyzed, undo it when it lost too many
   * points (per trainer.num_undo_prompts). Returns true when the move was undone.
   */
  analyzeUndo(node: GameNode): boolean {
    const trainer = this.host.trainer();
    const move = node.move;
    if (node !== this.currentNode || node.autoUndo !== null || !node.analysisComplete || !move) return false;
    const pointsLost = node.pointsLost!;
    const thresholds = trainer.eval_thresholds;
    const prompts = trainer.num_undo_prompts;
    let i = 0;
    while (i < thresholds.length && pointsLost < thresholds[i]) i++;
    const numUndos = i < prompts.length ? prompts[i] : 0;
    let undo: boolean;
    if (numUndos === 0) undo = false;
    else if (numUndos < 1)
      undo = node.undoThreshold < numUndos && node.parent!.children.length === 1; // probability
    else undo = node.parent!.children.length <= numUndos;
    node.autoUndo = undo;
    if (undo) {
      this.undo(1);
      this.host.setStatus(tf("teaching undo message", { move: move.gtp(), points_lost: pointsLost }), "teaching");
    }
    return undo;
  }

  // ---------------------------------------------------------------- analysis
  analyze(
    node: GameNode,
    opts: {
      priority?: number;
      visits?: number;
      ponder?: boolean;
      timeLimit?: boolean;
      refineMove?: Move | null;
      analyzeFast?: boolean;
      findAlternatives?: boolean;
      regionOfInterest?: number[] | null;
      reportEvery?: number | null;
    } = {},
  ) {
    if (!this.engine) return;
    const refineMove = opts.refineMove ?? null;
    this.engine.requestAnalysis(node, {
      callback: (result, partial) =>
        node.setAnalysis(result, refineMove, opts.findAlternatives ?? false, opts.regionOfInterest ?? null, partial),
      priority: opts.priority ?? PRIORITY_DEFAULT,
      visits: opts.visits,
      ponder: opts.ponder,
      analyzeFast: opts.analyzeFast,
      timeLimit: opts.timeLimit,
      nextMove: refineMove,
      findAlternatives: opts.findAlternatives,
      regionOfInterest: opts.regionOfInterest,
      reportEvery: opts.reportEvery === undefined ? 1 : opts.reportEvery,
    });
  }

  analyzeAllNodes(priority = PRIORITY_GAME_ANALYSIS, analyzeFast = false, evenIfPresent = true) {
    for (const node of this.root.nodesInTree) {
      // forced, or not present, or something went wrong in loading
      if (evenIfPresent || !node.analysisFromSgf || !node.loadAnalysis()) {
        node.clearAnalysis();
        this.analyze(node, { priority, analyzeFast });
      }
    }
  }

  /** Forget the analysis of these nodes and analyze them again, e.g. after their position was edited. */
  reanalyze(nodes: GameNode[]) {
    for (const node of nodes) {
      this.engine?.terminateQueries(node);
      node.clearAnalysis();
      if (node === this.currentNode) this.analyze(node);
      else this.analyze(node, { priority: PRIORITY_GAME_ANALYSIS, analyzeFast: true });
    }
  }

  resetCurrentAnalysis() {
    const cn = this.currentNode;
    this.engine?.terminateQueries(cn);
    cn.clearAnalysis();
    this.analyze(cn);
  }

  setRegionOfInterest(region: [number, number, number, number] | null) {
    if (!region) {
      this.regionOfInterest = null;
      return;
    }
    const [x1, x2, y1, y2] = region;
    const [xmin, xmax] = [Math.min(x1, x2), Math.max(x1, x2)];
    const [ymin, ymax] = [Math.min(y1, y2), Math.max(y1, y2)];
    const [szx, szy] = this.boardSize;
    if (!(xmin === xmax && ymin === ymax) && !(xmax - xmin + 1 >= szx && ymax - ymin + 1 >= szy)) {
      this.regionOfInterest = [xmin, xmax, ymin, ymax];
    } else {
      this.regionOfInterest = null;
    }
  }

  analyzeExtra(
    mode: ExtraAnalysisMode,
    kwargs: { mistakesOnly?: boolean; visits?: number; moveRange?: [number, number] | null } = {},
  ) {
    const engine = this.engine;
    if (!engine) return;
    const cn = this.currentNode;
    const stoneKeys = new Set(this.stones.map((s) => `${s.coords![0]},${s.coords![1]}`));

    if (mode === "stop") {
      engine.stopPondering();
      engine.terminateQueries();
      return;
    }
    if (mode === "ponder") {
      this.analyze(cn, {
        ponder: true,
        priority: PRIORITY_EXTRA_ANALYSIS,
        regionOfInterest: this.regionOfInterest,
        timeLimit: false,
      });
      return;
    }
    if (mode === "extra") {
      const visits = cn.analysisVisitsRequested + engine.settings.max_visits;
      this.host.setStatus(tf("extra analysis", { visits }), "analysis");
      this.analyze(cn, {
        visits,
        priority: PRIORITY_EXTRA_ANALYSIS,
        regionOfInterest: this.regionOfInterest,
        timeLimit: false,
      });
      return;
    }
    if (mode === "game") {
      const nodes = this.root.nodesInTree;
      const threshold = this.host.trainer().eval_thresholds.at(-4)!;
      const visits =
        kwargs.visits ?? Math.min(...nodes.map((n) => n.analysisVisitsRequested)) + engine.settings.max_visits;
      const range = kwargs.moveRange ? [Math.min(...kwargs.moveRange), Math.max(...kwargs.moveRange)] : null;
      for (const node of nodes) {
        const maxLoss = Math.max(...[node, ...node.children].map((c) => c.pointsLost ?? 0));
        if (kwargs.mistakesOnly && maxLoss <= threshold) continue;
        if (range && !(node.depth - 1 >= range[0] && node.depth - 1 <= range[1])) continue;
        this.analyze(node, { visits, priority: -1_000_000, timeLimit: false, reportEvery: null });
      }
      this.host.setStatus(
        range
          ? tf("move range analysis", { start_move: range[0], end_move: range[1], visits })
          : tf("game re-analysis", { visits }),
        "analysis",
      );
      return;
    }

    let analyzeMoves: Move[];
    let visits: number;
    let priority: number;
    const [sx, sy] = this.boardSize;
    if (mode === "sweep") {
      analyzeMoves = [];
      const policyGrid = cn.policy ? varToGrid(cn.policy, [sx, sy]) : null;
      for (let x = 0; x < sx; x++) {
        for (let y = 0; y < sy; y++) {
          if (policyGrid ? policyGrid[y][x] >= 0 : !stoneKeys.has(`${x},${y}`)) {
            analyzeMoves.push(new Move([x, y], cn.nextPlayer));
          }
        }
      }
      if (policyGrid)
        analyzeMoves.sort((a, b) => policyGrid[b.coords![1]][b.coords![0]] - policyGrid[a.coords![1]][a.coords![0]]);
      visits = engine.settings.fast_visits;
      this.host.setStatus(tf("sweep analysis", { visits }), "analysis");
      priority = PRIORITY_SWEEP;
    } else {
      if (!cn.analysisComplete && mode !== "local") {
        this.host.setStatus(t("wait-before-extra-analysis"), "info");
        return;
      }
      if (mode === "alternative") {
        this.host.setStatus(t("alternative analysis"), "analysis");
        this.analyze(cn, { priority: PRIORITY_ALTERNATIVES, timeLimit: false, findAlternatives: true });
        visits = engine.settings.fast_visits;
      } else {
        visits = Math.max(...Object.values(cn.analysis.moves).map((d) => d.visits));
        this.host.setStatus(tf("equalizing analysis", { visits }), "analysis");
      }
      priority = PRIORITY_EQUALIZE;
      analyzeMoves = Object.keys(cn.analysis.moves).map((gtp) => Move.fromGtp(gtp, cn.nextPlayer));
    }
    for (const move of analyzeMoves) {
      if ((cn.analysis.moves[move.gtp()]?.visits ?? 0) < visits) {
        this.analyze(cn, { priority, visits, refineMove: move, timeLimit: false }); // explicitly requested
      }
    }
  }

  // ---------------------------------------------------------------- saving
  updateRootProperties(playerNames: Record<Player, string | null>) {
    for (const bw of ["B", "W"] as Player[]) {
      const name = playerNames[bw];
      if (!this.externalGame && name) this.root.setProperty("P" + bw, name);
    }
    const result = this.endResult;
    if (result && result.includes("+")) this.root.setProperty("RE", result);
  }

  generateFilename(): string {
    const clean = (s: string) => s.replace(/[​ㅤ'<>:"/\\|?*]/g, "");
    const b = clean(this.root.getProperty("PB", "B"));
    const w = clean(this.root.getProperty("PW", "W"));
    return `${PROGRAM_NAME}_${b} vs ${w} ${this.gameId}.sgf`;
  }

  toSgf(trainer: TrainerSettings, showDotsFor: Record<Player, boolean>): string {
    const opts: SgfSaveOptions = {
      saveCommentsPlayer: showDotsFor,
      saveCommentsClass: trainer.save_feedback,
      evalThresholds: trainer.eval_thresholds,
      saveAnalysis: trainer.save_analysis,
      saveMarks: trainer.save_marks,
    };
    return writeSgf(this.root, opts);
  }

  isStoneAt(c: Coords): boolean {
    return this.board[c[1]]?.[c[0]] !== undefined && this.board[c[1]][c[0]] >= 0;
  }
}
