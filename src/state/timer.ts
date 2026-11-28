// The game clock (ControlsPanel.update_timer in KaTrain): main time, byo-yomi periods and their sounds.

import { MODE_PLAY, PLAYER_AI, type Player } from "../core/constants";
import type { GameNode } from "../core/gameNode";
import { sounds } from "../ui/sounds";
import { get, set, type TimerState } from "./appState";
import type { AppConfig } from "./config";
import { updateConfig } from "./configState";

const TIMER_INTERVAL = 0.07;
const BEEP_START = 5.2;
const periodsUsed: Record<Player, number> = { B: 0, W: 0 };
let lastTimerUpdate: { node: GameNode | null; time: number; beeping: boolean } = {
  node: null,
  time: 0,
  beeping: false,
};

export function resetTimer() {
  periodsUsed.B = periodsUsed.W = 0;
  const game = get().game;
  if (game) {
    game.mainTimeUsed = 0;
    game.currentNode.timeUsed = 0;
  }
  set((s) => ({ timer: { ...s.timer, paused: true } }));
  tickTimer();
}

export function toggleTimerPaused() {
  set((s) => ({ timer: { ...s.timer, paused: !s.timer.paused } }));
}

export function tickTimer() {
  const { game, config, mode, timer } = get();
  if (!game) return;
  const cn = game.currentNode;
  const now = performance.now() / 1000;
  const t = config.timer;
  const mainTime = t.main_time * 60;
  const byoLen = Math.max(1, t.byo_length);
  const byoNum = Math.max(1, t.byo_periods);
  const player = cn.nextPlayer;
  const ai = config.ui.players[player].type === PLAYER_AI;
  let { beeping } = lastTimerUpdate;
  let usedPeriod = false;
  const boingAt = byoLen - t.minimal_use;
  let mainRemaining = mainTime - game.mainTimeUsed;
  let remaining: number;
  if (!timer.paused && !ai && mode === MODE_PLAY && !game.endResult) {
    if (lastTimerUpdate.node === cn && !cn.children.length) {
      const dt = now - lastTimerUpdate.time;
      if (mainRemaining > 0) game.mainTimeUsed += dt;
      else cn.timeUsed += dt;
      mainRemaining = mainTime - game.mainTimeUsed;
    } else {
      cn.timeUsed = 0;
      beeping = false;
    }
    remaining = byoLen - cn.timeUsed;
    while (remaining < 0 && periodsUsed[player] < byoNum) {
      cn.timeUsed -= byoLen;
      remaining += byoLen;
      periodsUsed[player]++;
      usedPeriod = true;
    }
    const wasBeeping = beeping;
    if (BEEP_START - 2 * TIMER_INTERVAL < remaining && remaining < BEEP_START && periodsUsed[player] < byoNum)
      beeping = true;
    else if (remaining > BEEP_START) beeping = false;
    if (
      t.minimal_use &&
      !beeping &&
      boingAt - TIMER_INTERVAL < remaining &&
      remaining < boingAt + TIMER_INTERVAL &&
      periodsUsed[player] < byoNum &&
      t.sound
    ) {
      sounds.minimalTimePassed();
    }
    if (t.sound && mainRemaining <= 0) {
      const periodsLeft = byoNum - periodsUsed[player];
      if (wasBeeping && !beeping && !usedPeriod) sounds.stopCountdown();
      else if (!wasBeeping && beeping) sounds.countdown(periodsLeft > 1 ? 0.5 : 1);
    }
  } else {
    beeping = false;
  }
  remaining = periodsUsed[player] >= byoNum ? 0 : byoLen - cn.timeUsed;
  const periodsLeft = byoNum - periodsUsed[player];
  lastTimerUpdate = { node: cn, time: now, beeping };
  const next: TimerState =
    mainRemaining > 0
      ? { paused: timer.paused, remaining: mainRemaining, periods: null, ai }
      : { paused: timer.paused, remaining: Math.max(0, remaining), periods: Math.max(0, periodsLeft), ai };
  const cur = get().timer;
  if (
    cur.paused !== next.paused ||
    cur.periods !== next.periods ||
    cur.ai !== next.ai ||
    Math.floor(cur.remaining * 10) !== Math.floor(next.remaining * 10)
  ) {
    set({ timer: next });
  }
}

export function updateTimerSettings(timer: AppConfig["timer"]) {
  updateConfig((c) => void (c.timer = timer));
  resetTimer();
}
