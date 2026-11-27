// The principal variation shown while the mouse is over a top move or next move: how many of its moves are shown.
// Scrolling over the move (with a mouse wheel or a touchpad) and the keys , and . show fewer or more of them.

import { create } from "zustand";
import { WheelStepper } from "./wheel";

interface PvPreview {
  /** what is previewed (a key for the node and point), or null */
  target: string | null;
  /** the moves of the previewed variation */
  length: number;
  /** how many of them are shown; null: all */
  depth: number | null;
}

export const usePvPreview = create<PvPreview>(() => ({ target: null, length: 0, depth: null }));

/**
 * The board shows a variation (or none). Another move's starts out whole; the same move's keeps how many moves are
 * shown when analysis changes it.
 */
export function previewPv(target: string | null, length: number) {
  const s = usePvPreview.getState();
  if (s.target === target) {
    if (s.length !== length) usePvPreview.setState({ length });
    return;
  }
  usePvPreview.setState({ target, length, depth: null });
}

/** The number of moves shown of a variation of `length` moves. */
export function shownMoves(length: number, depth: number | null): number {
  return depth === null ? length : Math.max(1, Math.min(length, depth));
}

/** Show `delta` more moves of the previewed variation (fewer if negative). Returns false if there is none. */
export function stepPvDepth(delta: number): boolean {
  const { target, length, depth } = usePvPreview.getState();
  if (!target || !length) return false;
  const next = shownMoves(length, shownMoves(length, depth) + delta);
  usePvPreview.setState({ depth: next === length ? null : next });
  return true;
}

const wheel = new WheelStepper();

/** A wheel event over the previewed move: scrolling down shows more moves, up fewer. */
export function wheelPvDepth(deltaY: number, deltaMode: number, time: number) {
  const step = wheel.step(deltaY, deltaMode, time);
  if (step) stepPvDepth(step);
}
