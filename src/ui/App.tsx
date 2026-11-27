import { useEffect } from "react";
import { MODE_PLAY } from "../core/constants";
import {
  cycleFocusMode,
  init,
  redo,
  requestCloseDialog,
  requestFileDrop,
  requestOpenGamePath,
  requestWindowClose,
  setFocusMode,
  undo,
  useStore,
} from "../state/store";
import { platform } from "../state/platform";
import { t } from "../core/i18n";
import { ControlsBar, TopBar } from "./Bars";
import { Board } from "./Board";
import { Dialogs } from "./Dialogs";
import { Graph } from "./Graph";
import { MoveTree } from "./MoveTree";
import { handleKeyDown, useShortcutLabels } from "./shortcuts";
import { useAppearance } from "./theme";
import { TimerPanel } from "./Timer";
import { InfoPanel, PlayersPanel, StatsPanel } from "./Panels";
import { WheelStepper } from "./wheel";

function onKeyDown(e: KeyboardEvent) {
  const s = useStore.getState();
  if (s.dialog) {
    const target = e.target as HTMLElement;
    if (e.key === "Escape" && !target.closest?.("input, textarea, select, [contenteditable]")) requestCloseDialog();
    return;
  }
  handleKeyDown(e);
}

const wheel = new WheelStepper();
function onWheel(e: WheelEvent) {
  if (!(e.target as HTMLElement).closest(".board-wrap")) return;
  const step = wheel.step(e.deltaY, e.deltaMode, performance.now());
  if (step > 0) redo(1);
  else if (step < 0) undo(1);
}

export function App() {
  const ready = useStore((s) => s.ready);
  const lang = useStore((s) => s.lang);
  const mode = useStore((s) => s.mode);
  const focusMode = useStore((s) => s.focusMode);
  const label = useShortcutLabels();
  useAppearance();
  useEffect(() => {
    void init();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: true });
    // drop an .sgf / .gib / .ngf anywhere on the window to load it
    const stopDrop = platform.onFileDrop((f) => {
      if (/\.(sgf|gib|ngf)$/i.test(f.name)) requestFileDrop(f);
    });
    const stopOpen = platform.onOpenGameFile((path) => requestOpenGamePath(path));
    const stopClose = platform.onCloseRequested(() => requestWindowClose());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      void stopDrop.then((stop) => stop());
      void stopOpen.then((stop) => stop());
      void stopClose.then((stop) => stop());
    };
  }, []);
  if (!ready) return <div className="loading">Katraineo</div>;
  const focusKey = label("focus");
  return (
    <div className={`app focus-${focusMode}`} key={lang}>
      {focusMode < 2 && <TopBar />}
      <main className="main">
        <section className="board-area">
          <Board />
        </section>
        {focusMode === 0 && (
          <aside className="sidebar">
            <PlayersPanel />
            {mode === MODE_PLAY ? <TimerPanel /> : <MoveTree />}
            <Graph />
            <StatsPanel />
            <InfoPanel />
          </aside>
        )}
      </main>
      {focusMode < 2 && <ControlsBar />}
      {focusMode > 0 && (
        <div className="focus-controls">
          <button
            className="icon-button"
            title={`${t("focus:more")}${focusKey ? ` (${focusKey})` : ""}`}
            aria-label={t("focus:more")}
            onClick={cycleFocusMode}
          >
            ⤢
          </button>
          <button
            className="icon-button"
            title={t("focus:exit")}
            aria-label={t("focus:exit")}
            onClick={() => setFocusMode(0)}
          >
            ✕
          </button>
        </div>
      )}
      <Dialogs />
    </div>
  );
}
