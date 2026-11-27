// The logic that runs after every change (refresh): the mistake sound, teaching undos, AI moves and pondering.

import { generateAiMove } from "../core/ai";
import { MODE_PLAY, PLAYER_AI, PLAYER_HUMAN, PLAYING_TEACHING } from "../core/constants";
import type { GameNode } from "../core/gameNode";
import { tf } from "../core/i18n";
import { sounds } from "../ui/sounds";
import { get, log, refresh, set, setStatus, setUpdateLogic } from "./appState";
import { getEngine } from "./engineState";
import { markDirty } from "./files";

const mistakeSoundPlayed = new WeakSet<GameNode>();

function updateState() {
  const { game, mode, config, aiThinking, pondering } = get();
  if (!game) return;
  const cn = game.currentNode;
  const players = config.ui.players;
  if (mode === MODE_PLAY && cn.move) {
    const last = players[cn.player];
    const pl = cn.pointsLost;
    if (
      last.type === PLAYER_HUMAN &&
      cn.analysisComplete &&
      pl !== null &&
      pl > config.trainer.eval_thresholds.at(-4)! &&
      !mistakeSoundPlayed.has(cn)
    ) {
      mistakeSoundPlayed.add(cn);
      sounds.mistake();
    }
  }
  // teaching games: undo the human's move if it lost too many points
  const teaching =
    mode === MODE_PLAY &&
    !!cn.move &&
    !!cn.parent &&
    players[cn.player].type === PLAYER_HUMAN &&
    players[cn.player].subtype === PLAYING_TEACHING;
  if (teaching && cn.analysisComplete && cn.parent!.analysisComplete && !cn.children.length && !game.endResult) {
    if (game.analyzeUndo(cn)) {
      refresh();
      return;
    }
  }
  if (
    mode === MODE_PLAY &&
    !aiThinking &&
    get().dialog === null &&
    get().setupTool === null &&
    cn.analysisComplete &&
    players[cn.nextPlayer].type === PLAYER_AI &&
    !cn.children.length &&
    !game.endResult &&
    !(teaching && cn.autoUndo === null)
  ) {
    void aiMove(cn);
  }
  const engine = getEngine();
  if (engine && engine.isAlive) {
    if (pondering) game.analyzeExtra("ponder");
    else engine.stopPondering();
  }
}
setUpdateLogic(updateState);

async function aiMove(node: GameNode) {
  const { game, config } = get();
  if (!game || game.currentNode !== node) return;
  const strategy = config.ui.players[node.nextPlayer].strategy;
  set({ aiThinking: true });
  try {
    const played = await generateAiMove(game, strategy, config.ai[strategy] ?? {});
    if (played && get().game === game) {
      sounds.stone();
      markDirty();
    }
  } catch (e) {
    log(`AI move failed: ${e}`, "error");
    setStatus(tf("AI move failed", { error: String(e) }), "error");
  } finally {
    set({ aiThinking: false });
    refresh();
  }
}

export function aiMoveNow() {
  const game = get().game;
  if (!game || get().aiThinking) return;
  void aiMove(game.currentNode);
}
