// The stones on the board, grouped into chains: moves with captures, ko and suicide, and SGF setup (AE, AB, AW).

import type { Player } from "./constants";
import type { Rules } from "./engine";
import type { GameNode } from "./gameNode";
import { Move, type Coords } from "./move";

export class IllegalMoveException extends Error {}

/** Whether the rules let a move capture its own group (rather than being illegal). */
export function suicideAllowed(rules: Rules): boolean {
  return (
    (typeof rules === "string" && ["tromp-taylor", "new zealand"].includes(rules)) ||
    (typeof rules === "object" && Boolean(rules.suicide))
  );
}

export class Board {
  /** board[y][x] = chain id or -1 */
  board: number[][] = [];
  chains: Move[][] = [];
  prisoners: Move[] = [];
  lastCapture: Move[] = [];

  constructor(
    readonly size: [number, number],
    private readonly allowSuicide: () => boolean = () => false,
  ) {
    this.clear();
  }

  /** The position after the nodes, from the root: each node's setup first, then its move. */
  static after(size: [number, number], nodes: GameNode[], allowSuicide: () => boolean = () => false): Board {
    const board = new Board(size, allowSuicide);
    for (const node of nodes) board.applyNode(node);
    return board;
  }

  clear() {
    const [sx, sy] = this.size;
    this.board = Array.from({ length: sy }, () => new Array<number>(sx).fill(-1));
    this.chains = [];
    this.prisoners = [];
    this.lastCapture = [];
  }

  get stones(): Move[] {
    return this.chains.flat();
  }

  /** player at each point, indexed [y][x]. */
  get stoneGrid(): (Player | null)[][] {
    return this.board.map((line) => line.map((c) => (c >= 0 ? this.chains[c][0].player : null)));
  }

  /** A node's setup, then its moves (ko unknown when replaying). */
  applyNode(node: GameNode) {
    this.applySetup(node);
    for (const m of node.moves) this.play(m, true);
  }

  /** A node's setup properties: AE clears points, AB and AW put stones on them. */
  applySetup(node: GameNode) {
    const clear = node.clearPlacements;
    const placements = node.placements;
    if (clear.length || placements.length) this.setup(clear, placements);
  }

  /**
   * Put stones on points or take them off, as SGF setup does: a stone replaces whatever was on its point, nothing
   * is captured, and the prisoners so far stay. There is no ko after a setup.
   */
  setup(clear: Move[], stones: Move[]) {
    const grid = this.stoneGrid;
    for (const m of clear) if (m.coords) grid[m.coords[1]][m.coords[0]] = null;
    for (const m of stones) if (m.coords) grid[m.coords[1]][m.coords[0]] = m.player;
    const prisoners = this.prisoners;
    this.clear();
    this.prisoners = prisoners;
    const [sx, sy] = this.size;
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const player = grid[y][x];
        if (!player || this.board[y][x] !== -1) continue;
        // a new chain: every stone of this color connected to this one
        const id = this.chains.length;
        const chain: Move[] = [];
        const stack: Coords[] = [[x, y]];
        this.board[y][x] = id;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          chain.push(new Move([cx, cy], player));
          for (const [nx, ny] of this.neighbours(cx, cy)) {
            if (grid[ny][nx] === player && this.board[ny][nx] === -1) {
              this.board[ny][nx] = id;
              stack.push([nx, ny]);
            }
          }
        }
        this.chains.push(chain);
      }
    }
  }

  private neighbours(x: number, y: number): Coords[] {
    const [sx, sy] = this.size;
    const out: Coords[] = [];
    if (x > 0) out.push([x - 1, y]);
    if (x < sx - 1) out.push([x + 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (y < sy - 1) out.push([x, y + 1]);
    return out;
  }

  /** The chains next to the stones (-1 for an empty point). */
  private chainsAround(moves: Move[]): Set<number> {
    const out = new Set<number>();
    for (const m of moves) for (const [x, y] of this.neighbours(...m.coords!)) out.add(this.board[y][x]);
    return out;
  }

  /** Play a move, capturing what it takes. Throws IllegalMoveException (and leaves a half-played move behind). */
  play(move: Move, ignoreKo: boolean) {
    const koOrSnapback = this.lastCapture.length === 1 && this.lastCapture[0].equals(move);
    this.lastCapture = [];
    if (move.isPass) return;
    const [mx, my] = move.coords!;
    if (this.board[my][mx] !== -1) throw new IllegalMoveException("Space occupied");

    // merge chains connected by this move, or create a new one
    const nbChains = [...this.chainsAround([move])].filter((c) => c >= 0 && this.chains[c][0].player === move.player);
    let thisChain: number;
    if (nbChains.length) {
      thisChain = nbChains[0];
      const others = new Set(nbChains);
      for (const line of this.board) for (let x = 0; x < line.length; x++) if (others.has(line[x])) line[x] = thisChain;
      for (const oc of nbChains.slice(1)) {
        this.chains[thisChain].push(...this.chains[oc]);
        this.chains[oc] = [];
      }
      this.chains[thisChain].push(move);
    } else {
      thisChain = this.chains.length;
      this.chains.push([move]);
    }
    this.board[my][mx] = thisChain;

    // captures
    const oppChains = [...this.chainsAround([move])].filter((c) => c >= 0 && this.chains[c][0].player !== move.player);
    for (const c of oppChains) {
      if (!this.chainsAround(this.chains[c]).has(-1)) {
        this.lastCapture.push(...this.chains[c]);
        for (const om of this.chains[c]) this.board[om.coords![1]][om.coords![0]] = -1;
        this.chains[c] = [];
      }
    }
    if (koOrSnapback && this.lastCapture.length === 1 && !ignoreKo) throw new IllegalMoveException("Ko");
    this.prisoners.push(...this.lastCapture);

    // suicide
    if (!this.chainsAround(this.chains[thisChain]).has(-1)) {
      if (this.chains[thisChain].length === 1) throw new IllegalMoveException("Single stone suicide");
      if (!this.allowSuicide()) throw new IllegalMoveException("Suicide");
      this.lastCapture.push(...this.chains[thisChain]);
      for (const om of this.chains[thisChain]) this.board[om.coords![1]][om.coords![0]] = -1;
      this.chains[thisChain] = [];
      this.prisoners.push(...this.lastCapture);
    }
  }
}
