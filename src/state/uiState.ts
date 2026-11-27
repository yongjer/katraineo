// UI state that is not part of the game or the config: dialogs, the mode tab, coordinates, selecting a region.

import type { UiMode } from "../core/constants";
import { t } from "../core/i18n";
import { get, refresh, set, setStatus, type DialogKind, type FocusMode } from "./appState";
import { clearStatus } from "./engineState";

/** A dialog can stop closing (Escape, the close button, a click outside) to ask about unsaved changes first. */
let dialogCloseGuard: (() => boolean) | null = null;
export function setDialogCloseGuard(guard: (() => boolean) | null) {
  dialogCloseGuard = guard;
}

/** Close the open dialog unless its close guard keeps it open. */
export function requestCloseDialog() {
  if (dialogCloseGuard?.()) return;
  openDialog(null);
}

export function openDialog(dialog: DialogKind) {
  set((s) => ({ dialog, timer: dialog ? { ...s.timer, paused: true } : s.timer })); // popups pause the clock, as in KaTrain
  if (dialog === null) refresh();
}

export function setMode(mode: UiMode) {
  set({ mode });
  refresh();
}

/** Cycle the focus modes: side panels hidden, then only the board, then everything again (KaTrain's zen mode). */
export function cycleFocusMode() {
  set((s) => ({ focusMode: ((s.focusMode + 1) % 3) as FocusMode }));
}

export function setFocusMode(focusMode: FocusMode) {
  set({ focusMode });
}

export function toggleCoordinates() {
  set((s) => ({ showCoords: !s.showCoords }));
}

// ---------------------------------------------------------------- region of interest
export function setRegionOfInterest(region: [number, number, number, number] | null) {
  get().game?.setRegionOfInterest(region);
  refresh();
}

export function startRegionSelect() {
  if (!get().game) return;
  set({ selectingRegion: true });
  setStatus(t("analysis:region:start"), "info");
}

export function finishRegionSelect(region: [number, number, number, number] | null) {
  const game = get().game;
  set({ selectingRegion: false });
  if (game && region) game.setRegionOfInterest(region);
  clearStatus();
  refresh();
}
