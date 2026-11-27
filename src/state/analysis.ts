// Analysis and the tools built on it: extra analysis modes, pondering, principal variations, AI self-play,
// setting up a position and the tsumego frame.

import { MODE_ANALYZE } from "../core/constants";
import type { ExtraAnalysisMode, Game, NewGameSettings } from "../core/game";
import { Move } from "../core/move";
import { addTsumegoFrame } from "../core/tsumego";
import { get, refresh, set } from "./appState";
import { updateConfig } from "./configState";
import { clearStatus } from "./engineState";
import { guardUnsaved, markDirty, newGame } from "./files";

export function analyzeExtra(mode: ExtraAnalysisMode, kwargs: Parameters<Game["analyzeExtra"]>[1] = {}) {
  const game = get().game;
  if (!game) return;
  if (mode === "stop") {
    set({ pondering: false });
    if (get().status?.level === "analysis") clearStatus();
  }
  game.analyzeExtra(mode, kwargs);
  refresh();
}

export function togglePondering() {
  set((s) => ({ pondering: !s.pondering }));
  refresh();
}

export function resetAnalysis() {
  get().game?.resetCurrentAnalysis();
  refresh();
}

/** Add a principal variation (from the current position) to the move tree, as a middle click on it does. */
export function addPvToTree(moves: string[]) {
  const game = get().game;
  if (!game || !moves.length) return;
  let node = game.currentNode;
  for (const gtp of moves) {
    node = node.play(Move.fromGtp(gtp, node.nextPlayer));
    game.analyze(node, { analyzeFast: true });
  }
  markDirty();
  refresh();
}

export function selfplayToEnd() {
  const game = get().game;
  if (!game || !game.engine) return;
  game.selfplay("end");
  markDirty();
  refresh();
}

/** New game, then AI self-play until `untilMove` aiming for `blackScore` ("Set up Position"). */
export function setupPosition(settings: NewGameSettings, untilMove: number, blackScore: number) {
  updateConfig((c) => {
    c.game.setup_move = untilMove;
    c.game.setup_advantage = blackScore;
  });
  newGame(settings);
  const game = get().game!;
  const start = () => {
    if (get().game !== game || !game.active) return;
    if (!game.root.analysisExists) {
      setTimeout(start, 100); // self-play steers from the root score
      return;
    }
    game.selfplay(untilMove, blackScore);
  };
  start();
}

export function requestSetupPosition(settings: NewGameSettings, untilMove: number, blackScore: number) {
  guardUnsaved(() => setupPosition(settings, untilMove, blackScore));
}

export function tsumegoFrame(ko: boolean, margin: number) {
  const game = get().game;
  if (!game || !game.stones.length) return;
  const [node, region] = addTsumegoFrame(game, ko, margin);
  game.setCurrentNode(node);
  set({ mode: MODE_ANALYZE });
  if (region) game.setRegionOfInterest(region);
  game.analyze(node);
  markDirty();
  refresh();
}
