// Application state and controller logic (the TypeScript counterpart of katrain/__main__.py's message loop).
// The state is a zustand store (appState.ts); the controller is split by domain, and this module gathers it all for
// the UI and the tests:
//
//   appState.ts     the store and its types, logging, the status bar, refresh()
//   engineState.ts  starting and restarting KataGo, what a Game needs from the app
//   configState.ts  changing and saving the config, player types, recent files
//   uiState.ts      dialogs, the mode tab, coordinates, selecting a region of interest
//   files.ts        new games, loading, saving, the clipboard, unsaved changes and autosave
//   moves.ts        playing, navigating, editing the move tree, notes, insert mode
//   analysis.ts     extra analysis, pondering, PVs, self-play, set up position, tsumego frame
//   trainer.ts      what runs after every change: teaching undos, AI moves, pondering
//   timer.ts        the game clock
//   updates.ts      updates of the app
//   lifecycle.ts    starting the app

export {
  useStore,
  refresh,
  setStatus,
  type DialogKind,
  type LogEntry,
  type State,
  type Status,
  type TimerState,
  type UpdateState,
} from "./appState";
export { clearStatus, getEngine, restartEngine } from "./engineState";
export { clearRecentFiles, setPlayer, toggleControl, updateConfig } from "./configState";
export {
  finishRegionSelect,
  openDialog,
  requestCloseDialog,
  setDialogCloseGuard,
  setMode,
  setRegionOfInterest,
  startRegionSelect,
  toggleCoordinates,
} from "./uiState";
export {
  copySgf,
  discardAutosave,
  flushAutosave,
  guardUnsaved,
  loadGame,
  loadGameFromString,
  newGame,
  openGamePath,
  pasteSgf,
  recoverAutosave,
  requestFileDrop,
  requestNewGame,
  requestOpenGamePath,
  requestWindowClose,
  resolveUnsaved,
  saveGame,
} from "./files";
export {
  editTree,
  findMistake,
  goTo,
  playAt,
  redo,
  resign,
  setNote,
  switchBranch,
  toggleInsertMode,
  undo,
  type TreeEdit,
} from "./moves";
export {
  addPvToTree,
  analyzeExtra,
  requestSetupPosition,
  resetAnalysis,
  selfplayToEnd,
  setupPosition,
  togglePondering,
  tsumegoFrame,
} from "./analysis";
export { aiMoveNow } from "./trainer";
export { resetTimer, tickTimer, toggleTimerPaused, updateTimerSettings } from "./timer";
export { checkForUpdates, installUpdate } from "./updates";
export { init } from "./lifecycle";
