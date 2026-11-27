// Top bar (menu, mode tabs, analysis toggles) and bottom bar (navigation, status, engine indicator).

import { useEffect, useRef, useState } from "react";
import { MODE_ANALYZE, MODE_PLAY } from "../core/constants";
import { t, tf } from "../core/i18n";
import type { AnalysisToggles } from "../state/config";
import {
  aiMoveNow,
  analyzeExtra,
  checkForUpdates,
  clearRecentFiles,
  copySgf,
  cycleFocusMode,
  pasteSgf,
  selfplayToEnd,
  toggleInsertMode,
  findMistake,
  getEngine,
  loadGame,
  openDialog,
  requestOpenGamePath,
  playAt,
  redo,
  resetAnalysis,
  resign,
  restartEngine,
  saveGame,
  setMode,
  toggleControl,
  togglePondering,
  undo,
  useStore,
} from "../state/store";
import { platform } from "../state/platform";
import { useShortcutLabels } from "./shortcuts";
import { THEME } from "./theme";

/** The analysis toggles: config key, label, shortcut action. */
const TOGGLES: [keyof AnalysisToggles, string, string][] = [
  ["show_children", "analysis:nextmoves", "show-children"],
  ["eval", "analysis:dots", "eval"],
  ["hints", "analysis:topmoves", "hints"],
  ["policy", "analysis:policy", "policy"],
  ["ownership", "analysis:territory", "ownership"],
];

/** " (key)" for a tooltip, or nothing when the action has no key. */
const keyHint = (key: string) => (key ? ` (${key})` : "");

function oneLine(s: string) {
  return s.replace(/\s*\n\s*/g, " ");
}

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const toggles = useStore((s) => s.config.ui[s.mode]);
  const recentFiles = useStore((s) => s.config.general.recent_files);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const key = useShortcutLabels();
  return (
    <header className="topbar">
      <div className="menu-anchor">
        <button className="icon-button" aria-label={t("a11y:menu")} onClick={() => setMenuOpen((o) => !o)}>
          ☰
        </button>
        {menuOpen && (
          <Dropdown onClose={() => setMenuOpen(false)}>
            <MenuItem label={t("menu:newgame")} shortcut={key("new-game")} onClick={() => openDialog("newgame")} />
            <MenuItem label={t("menu:load")} shortcut={key("load")} onClick={() => void loadGame()} />
            <MenuItem label={t("menu:save")} shortcut={key("save")} onClick={() => void saveGame(false)} />
            <MenuItem label={t("menu:save-as")} shortcut={key("save-as")} onClick={() => void saveGame(true)} />
            {platform.isDesktop && recentFiles.length > 0 && (
              <>
                <hr />
                <div className="menu-section-label">{t("menu:recent")}</div>
                {recentFiles.slice(0, 6).map((path) => (
                  <MenuItem
                    key={path}
                    label={path.split(/[\\/]/).pop() ?? path}
                    title={path}
                    onClick={() => requestOpenGamePath(path)}
                  />
                ))}
                <MenuItem label={t("menu:recent-clear")} onClick={clearRecentFiles} />
              </>
            )}
            <hr />
            <MenuItem label={t("menu:settings")} shortcut={key("settings")} onClick={() => openDialog("settings")} />
            <MenuItem label={t("menu:aisettings")} shortcut={key("ai-settings")} onClick={() => openDialog("ai")} />
            <MenuItem
              label={t("menu:clocksettings")}
              shortcut={key("timer-settings")}
              onClick={() => openDialog("timer")}
            />
            <hr />
            <MenuItem label={t("menu:copy-sgf")} shortcut={key("copy-sgf")} onClick={() => void copySgf()} />
            <MenuItem label={t("menu:paste-sgf")} shortcut={key("paste-sgf")} onClick={() => void pasteSgf()} />
            <MenuItem label={t("menu:katago-log")} onClick={() => openDialog("log")} />
            <hr />
            <MenuItem label={t("shortcuts:focus")} shortcut={key("focus")} onClick={cycleFocusMode} />
            <MenuItem label={t("menu:shortcuts")} shortcut={key("shortcuts")} onClick={() => openDialog("shortcuts")} />
            {platform.isDesktop && (
              <>
                <hr />
                <MenuItem label={t("update:check")} onClick={checkUpdatesFromMenu} />
              </>
            )}
          </Dropdown>
        )}
      </div>
      <div className="mode-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === MODE_PLAY}
          className={mode === MODE_PLAY ? "active" : ""}
          onClick={() => setMode(MODE_PLAY)}
        >
          {t("btn:Play")}
        </button>
        <button
          role="tab"
          aria-selected={mode === MODE_ANALYZE}
          className={mode === MODE_ANALYZE ? "active" : ""}
          onClick={() => setMode(MODE_ANALYZE)}
        >
          {t("btn:Analysis")}
        </button>
      </div>
      <div className="toggles">
        {TOGGLES.map(([toggle, label, action]) => (
          <button
            key={toggle}
            className={`toggle ${toggles[toggle] ? "on" : ""}`}
            onClick={() => toggleControl(toggle)}
            title={`${oneLine(t(label))}${keyHint(key(action))}`}
          >
            <span className="check">{toggles[toggle] ? "●" : "○"}</span>
            {oneLine(t(label))}
            {key(action) && <kbd>{key(action)}</kbd>}
          </button>
        ))}
      </div>
      <UpdateNotice />
      <div className="menu-anchor right">
        <button className="text-button" onClick={() => setExtraOpen((o) => !o)}>
          {t("btn:Analyze")} ▾
        </button>
        {extraOpen && (
          <Dropdown onClose={() => setExtraOpen(false)} align="right">
            <MenuItem label={t("analysis:extra")} shortcut={key("extra")} onClick={() => analyzeExtra("extra")} />
            <MenuItem
              label={t("analysis:equalize")}
              shortcut={key("equalize")}
              onClick={() => analyzeExtra("equalize")}
            />
            <MenuItem label={t("analysis:sweep")} shortcut={key("sweep")} onClick={() => analyzeExtra("sweep")} />
            <MenuItem
              label={t("analysis:alternatives")}
              shortcut={key("alternatives")}
              onClick={() => analyzeExtra("alternative")}
            />
            <MenuItem label={t("analysis:reset")} shortcut={key("reset-analysis")} onClick={resetAnalysis} />
            <hr />
            <MenuItem label={t("analysis:continuous")} shortcut={key("ponder")} onClick={togglePondering} />
            <MenuItem label={t("analysis:game")} shortcut={key("reanalyze")} onClick={() => openDialog("reanalyze")} />
            <MenuItem label={t("analysis:report")} shortcut={key("report")} onClick={() => openDialog("report")} />
            <MenuItem label={t("analysis:aimove")} shortcut={key("ai-move")} onClick={aiMoveNow} />
            <MenuItem label={t("analysis:playtoend")} shortcut={key("play-to-end")} onClick={selfplayToEnd} />
            <MenuItem label={t("analysis:insert")} shortcut={key("insert")} onClick={toggleInsertMode} />
            <MenuItem
              label={t("analysis:tsumegoframe")}
              shortcut={key("tsumego-frame")}
              onClick={() => openDialog("tsumego")}
            />
          </Dropdown>
        )}
      </div>
    </header>
  );
}

function checkUpdatesFromMenu() {
  openDialog("update");
  if (useStore.getState().update.phase !== "available") void checkForUpdates(true);
}

/** Shown in the top bar once a newer version has been found. */
function UpdateNotice() {
  const update = useStore((s) => s.update);
  if (!update.info || (update.phase !== "available" && update.phase !== "installing" && update.phase !== "error"))
    return null;
  return (
    <button
      className="update-notice"
      title={tf("update:available", { version: update.info.version })}
      onClick={() => openDialog("update")}
    >
      {t("update:notice")}
    </button>
  );
}

function Dropdown({
  children,
  onClose,
  align = "left",
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div ref={ref} className={`dropdown ${align}`} onClick={onClose}>
      {children}
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  title,
  onClick,
}: {
  label: string;
  shortcut?: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button className="menu-item" title={title} onClick={onClick}>
      <span className="menu-item-label">{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

export function ControlsBar() {
  const key = useShortcutLabels();
  const status = useStore((s) => s.status);
  const pondering = useStore((s) => s.pondering);
  useStore((s) => s.tick);
  const engine = getEngine();
  const remaining = engine?.queriesRemaining() ?? 0;
  let engineColor: string = THEME.engine.ready;
  let engineTitle = t("engine:ready");
  const engineStopped = !engine || engine.state === "dead" || engine.state === "stopped";
  if (engineStopped) {
    engineColor = THEME.engine.dead;
    engineTitle = `${engine?.lastError ?? t("engine:not-running")}\n${t("engine:restart:hint")}`;
  } else if (engine.isReconnecting) {
    engineColor = THEME.engine.busy;
    engineTitle = engine.connectionMessage ?? "";
  } else if (pondering) {
    engineColor = THEME.engine.pondering;
    engineTitle = t("engine:pondering");
  } else if (engine.state === "starting" || remaining > 0) {
    engineColor = THEME.engine.busy;
    engineTitle =
      engine.state === "starting" ? t("engine:starting") : t("engine:queries").replace("{count}", String(remaining));
  }
  return (
    <footer className="controls">
      <div className="nav">
        <NavButton
          label="⇤✗"
          title={`${t("nav:previous-mistake")}${keyHint(key("previous-mistake"))}`}
          onClick={() => findMistake("undo")}
          mistake
        />
        <NavButton label="⏮" title={`${t("nav:start")}${keyHint(key("start"))}`} onClick={() => undo(9999)} />
        <NavButton label="⏪" title={`${t("nav:back-10")}${keyHint(key("undo-10"))}`} onClick={() => undo(10)} />
        <NavButton label="◀" title={`${t("nav:previous")}${keyHint(key("undo"))}`} onClick={() => undo(1)} />
        <NavButton label="▶" title={`${t("nav:next")}${keyHint(key("redo"))}`} onClick={() => redo(1)} />
        <NavButton label="⏩" title={`${t("nav:forward-10")}${keyHint(key("redo-10"))}`} onClick={() => redo(10)} />
        <NavButton label="⏭" title={`${t("nav:end")}${keyHint(key("end"))}`} onClick={() => redo(9999)} />
        <NavButton
          label="✗⇥"
          title={`${t("nav:next-mistake")}${keyHint(key("next-mistake"))}`}
          onClick={() => findMistake("redo")}
          mistake
        />
      </div>
      <div className="actions">
        <button className="text-button" onClick={() => playAt(null)} title={key("pass")}>
          {t("pass-button-text")}
        </button>
        <button className="text-button" onClick={() => undo("smart")}>
          {t("undo-button-text")}
        </button>
        <button className="text-button" onClick={resign}>
          {t("resign")}
        </button>
      </div>
      <div className={`status ${status?.level ?? ""}`} title={status?.message}>
        {status?.message.replace(/\n/g, " ")}
      </div>
      {engineStopped && (
        <button className="text-button small" onClick={() => openDialog("settings")}>
          {t("engine settings")}
        </button>
      )}
      <button
        className="engine-dot"
        style={{ background: engineColor }}
        title={engineTitle}
        aria-label={engineTitle}
        onClick={() => (engineStopped && engine ? void restartEngine() : togglePondering())}
      />
    </footer>
  );
}

function NavButton({
  label,
  title,
  onClick,
  mistake = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  mistake?: boolean;
}) {
  return (
    <button className={`nav-button ${mistake ? "mistake" : ""}`} title={title} aria-label={title} onClick={onClick}>
      {label}
    </button>
  );
}
