// The player performance report (GameReportPopup).

import { useState } from "react";
import { aiRankEstimation, rankLabel } from "../../core/ai";
import { PLAYER_AI, type Player } from "../../core/constants";
import { t } from "../../core/i18n";
import { gameReport, REPORT_FILTERS } from "../../core/report";
import { openDialog, useStore } from "../../state/store";
import { EVAL_COLORS } from "../theme";
import { Modal } from "./common";

const STAT_BETTER = "#337f1a";
const STAT_WORSE = "#cc6633";

function darken(hex: string, f = 0.75) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c.join(",")})`;
}

/** A table cell with a bar showing value/scale, growing from the middle column outwards (TableStatLabel). */
function StatCell({
  text,
  value,
  scale,
  color,
  side,
}: {
  text: string;
  value: number;
  scale: number;
  color: string;
  side: "left" | "right";
}) {
  const pct = Math.max(0, Math.min(1, value / scale)) * 100;
  return (
    <div className={`report-cell report-stat ${side}`}>
      <div
        className="report-bar"
        style={{ width: `${pct}%`, background: color, [side === "left" ? "right" : "left"]: 0 }}
      />
      <span>{text}</span>
    </div>
  );
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Player performance report (GameReportPopup), for the main branch through the current move. */
export function ReportDialog() {
  const game = useStore((s) => s.game);
  const config = useStore((s) => s.config);
  useStore((s) => s.tick); // refresh while analysis comes in
  const [filter, setFilter] = useState<keyof typeof REPORT_FILTERS>("Entire Game");
  const close = () => openDialog(null);
  if (!game) return null;
  const thresholds = config.trainer.eval_thresholds;
  const { sumStats, histogram, playerPtloss } = gameReport(game.currentNode, thresholds, REPORT_FILTERS[filter]);
  const colors = (EVAL_COLORS[config.trainer.theme] ?? EVAL_COLORS["theme:normal"]).map((c) => darken(c));
  const labels = thresholds.map((pt) => (pt > 0 ? `≥ ${pt}` : `< ${thresholds.at(-2)}`));
  const stats: [
    string,
    (v: number) => string,
    "accuracy" | "mean_ptloss" | "ai_top_move" | "ai_top5_move",
    number,
    boolean,
  ][] = [
    ["accuracy", (v) => v.toFixed(1), "accuracy", 100, true],
    ["meanpointloss", (v) => v.toFixed(2), "mean_ptloss", 5, false],
    ["aitopmove", pct1, "ai_top_move", 1, true],
    ["aitop5", pct1, "ai_top5_move", 1, true],
  ];
  const sides: [Player, "left" | "right"][] = [
    ["B", "left"],
    ["W", "right"],
  ];
  const players = config.ui.players;
  return (
    <Modal title={t("analysis:report")} onClose={close}>
      <div className="tabs report-filters" role="tablist">
        {Object.keys(REPORT_FILTERS).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {t(f)}
          </button>
        ))}
      </div>
      <div className="report-players">
        {sides.map(([p]) => {
          const setup = players[p];
          const isAi = setup.type === PLAYER_AI;
          const name = game.root.getProperty(`P${p}`);
          const rank = isAi
            ? rankLabel(aiRankEstimation(setup.strategy, config.ai[setup.strategy] ?? {}))
            : game.root.getProperty(`${p}R`);
          return (
            <div key={p} className={`report-player ${p === "W" ? "right" : ""}`}>
              <div className={`player-stone stone-${p}`} />
              <div>
                <div className="player-name">
                  {name && !name.includes("ㅤ") ? name : isAi ? t(setup.strategy) : t(setup.subtype)}
                </div>
                <div className="muted">
                  {t(setup.type)}
                  {rank ? ` · ${rank}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="report-table">
        <div className="report-cell report-header" />
        <div className="report-cell report-header">{t("header:keystats")}</div>
        <div className="report-cell report-header" />
        {stats.map(([label, fmt, key, scale, moreIsBetter]) =>
          sides.flatMap(([p, side], i) => {
            const v = sumStats[p][key];
            const other = sumStats[p === "B" ? "W" : "B"][key] ?? 0;
            const better = (v ?? 0) < other !== moreIsBetter;
            const cell = (
              <StatCell
                key={`${label}${p}`}
                side={side}
                text={v === undefined ? "" : fmt(v)}
                value={v ?? 0}
                scale={scale}
                color={better ? STAT_BETTER : STAT_WORSE}
              />
            );
            return i === 0
              ? [
                  cell,
                  <div key={label} className="report-cell report-label">
                    {t(`stat:${label}`)}
                  </div>,
                ]
              : [cell];
          }),
        )}
        <div className="report-cell report-header">{t("header:num moves")}</div>
        <div className="report-cell report-header">{t("stats:pointslost")}</div>
        <div className="report-cell report-header">{t("header:num moves")}</div>
        {[...thresholds.keys()].reverse().map((ti, i) => [
          <StatCell
            key={`hb${ti}`}
            side="left"
            text={String(histogram[i].B)}
            value={histogram[i].B}
            scale={playerPtloss.B.length + 1e-6}
            color={colors[ti]}
          />,
          <div key={`hl${ti}`} className="report-cell report-label" style={{ background: colors[ti] }}>
            {labels[ti]}
          </div>,
          <StatCell
            key={`hw${ti}`}
            side="right"
            text={String(histogram[i].W)}
            value={histogram[i].W}
            scale={playerPtloss.W.length + 1e-6}
            color={colors[ti]}
          />,
        ])}
      </div>
    </Modal>
  );
}
