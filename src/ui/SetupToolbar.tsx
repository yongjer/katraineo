// The position editor's toolbar, above the board while editing: stones, erase, marks, labels, who plays next.

import type { ReactNode } from "react";
import { t } from "../core/i18n";
import {
  SETUP_TOOLS,
  editsInPlace,
  finishSetup,
  setSetupTool,
  togglePlayerToMove,
  useStore,
  type SetupTool,
} from "../state/store";

const TOOL_LABELS: Record<SetupTool, string> = {
  B: "setup:black",
  W: "setup:white",
  AE: "setup:erase",
  TR: "setup:triangle",
  SQ: "setup:square",
  CR: "setup:circle",
  MA: "setup:cross",
  letters: "setup:letters",
  numbers: "setup:numbers",
};

function StoneIcon({ player }: { player: "B" | "W" }) {
  return <circle cx={8} cy={8} r={6} className={`tool-stone tool-stone-${player}`} />;
}

const ICONS: Record<SetupTool, ReactNode> = {
  B: <StoneIcon player="B" />,
  W: <StoneIcon player="W" />,
  AE: (
    <>
      <circle cx={8} cy={8} r={6} className="tool-shape dashed" />
      <path d="M5 5L11 11M11 5L5 11" className="tool-shape" />
    </>
  ),
  TR: <polygon points="8,2.5 13.5,12.5 2.5,12.5" className="tool-shape" />,
  SQ: <rect x={3} y={3} width={10} height={10} className="tool-shape" />,
  CR: <circle cx={8} cy={8} r={5.5} className="tool-shape" />,
  MA: <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" className="tool-shape" />,
  letters: (
    <text x={8} y={8.5} className="tool-text">
      A
    </text>
  ),
  numbers: (
    <text x={8} y={8.5} className="tool-text">
      1
    </text>
  ),
};

export function SetupToolbar() {
  const tool = useStore((s) => s.setupTool);
  const game = useStore((s) => s.game);
  useStore((s) => s.tick); // the player to move and the node follow the game
  if (!tool || !game) return null;
  const next = game.currentNode.nextPlayer;
  return (
    <div className="setup-toolbar" role="toolbar" aria-label={t("setup:title")}>
      <span className="setup-title">{t("setup:title")}</span>
      <div className="setup-tools">
        {SETUP_TOOLS.map((id, i) => (
          <button
            key={id}
            className={`setup-tool ${tool === id ? "active" : ""}`}
            aria-pressed={tool === id}
            title={`${t(TOOL_LABELS[id])} (${i + 1})`}
            aria-label={t(TOOL_LABELS[id])}
            onClick={() => setSetupTool(id)}
          >
            <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
              {ICONS[id]}
            </svg>
          </button>
        ))}
      </div>
      <button className="text-button setup-next" title={t("setup:to-play-hint")} onClick={togglePlayerToMove}>
        {t("setup:to-play")}{" "}
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          <StoneIcon player={next} />
        </svg>{" "}
        {t(next === "B" ? "setup:black-short" : "setup:white-short")}
      </button>
      {!editsInPlace() && <span className="setup-hint">{t("setup:new-node")}</span>}
      <button className="primary setup-done" onClick={finishSetup}>
        {t("setup:done")}
      </button>
    </div>
  );
}
