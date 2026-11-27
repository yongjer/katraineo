// Smaller dialogs: the engine log, the clock settings, the tsumego frame and reanalyzing the game.

import { useState } from "react";
import { t } from "../../core/i18n";
import { analyzeExtra, openDialog, tsumegoFrame, updateTimerSettings, useStore } from "../../state/store";
import { Field, Modal, NumberInput } from "./common";

export function LogDialog() {
  const logs = useStore((s) => s.logs);
  return (
    <Modal title={t("menu:katago-log")} onClose={() => openDialog(null)}>
      <pre className="log">
        {logs.slice(-300).map((l, i) => (
          <div key={i} className={`log-${l.level}`}>
            {l.message}
          </div>
        ))}
      </pre>
    </Modal>
  );
}

export function TimerDialog() {
  const timer = useStore((s) => s.config.timer);
  const [draft, setDraft] = useState(() => ({ ...timer }));
  const close = () => openDialog(null);
  const num = (key: keyof typeof draft, v: number, min: number) => setDraft((d) => ({ ...d, [key]: Math.max(min, v) }));
  return (
    <Modal title={t("timer settings")} onClose={close}>
      <Field label={t("main time")}>
        <NumberInput min={0} value={draft.main_time} onValue={(v) => num("main_time", v, 0)} />
      </Field>
      <Field label={t("byoyomi length")}>
        <NumberInput min={1} value={draft.byo_length} onValue={(v) => num("byo_length", v, 1)} />
      </Field>
      <Field label={t("byoyomi periods")}>
        <NumberInput min={1} value={draft.byo_periods} onValue={(v) => num("byo_periods", v, 1)} />
      </Field>
      <Field label={t("minimal time use")}>
        <NumberInput min={0} value={draft.minimal_use} onValue={(v) => num("minimal_use", v, 0)} />
      </Field>
      <Field label={t("count down sound")}>
        <input
          type="checkbox"
          checked={draft.sound}
          onChange={(e) => setDraft((d) => ({ ...d, sound: e.target.checked }))}
        />
      </Field>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => {
            close();
            updateTimerSettings(draft);
          }}
        >
          {t("update timer")}
        </button>
      </div>
    </Modal>
  );
}

export function TsumegoDialog() {
  const [margin, setMargin] = useState("4");
  const [ko, setKo] = useState(false);
  const close = () => openDialog(null);
  return (
    <Modal title={t("analysis:tsumegoframe")} onClose={close}>
      <Field label={t("tsumego:walldistance")}>
        <input type="number" min={1} max={8} value={margin} onChange={(e) => setMargin(e.target.value)} />
      </Field>
      <Field label={t("tsumego:ko")}>
        <input type="checkbox" checked={ko} onChange={(e) => setKo(e.target.checked)} />
      </Field>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => {
            close();
            tsumegoFrame(ko, Math.max(1, parseInt(margin, 10) || 4));
          }}
        >
          {t("analysis:tsumegoframe")}
        </button>
      </div>
    </Modal>
  );
}

/** Deeper full game analysis (ReAnalyzeGamePopup). */
export function ReanalyzeDialog() {
  const depth = useStore((s) => s.game?.currentNode.depth ?? 0);
  const [visits, setVisits] = useState("2500");
  const [limit, setLimit] = useState(false);
  const [from, setFrom] = useState(String(depth));
  const [to, setTo] = useState("999");
  const [mistakes, setMistakes] = useState(false);
  const close = () => openDialog(null);
  const int = (v: string, fallback: number) => (Number.isNaN(parseInt(v, 10)) ? fallback : parseInt(v, 10));
  return (
    <Modal title={t("analysis:game")} onClose={close}>
      <Field label={t("reanalyze max visits")}>
        <input type="number" min={1} value={visits} onChange={(e) => setVisits(e.target.value)} />
      </Field>
      <Field label={t("limit to moves")}>
        <input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} />
      </Field>
      <Field label={t("from move")}>
        <input type="number" min={0} value={from} disabled={!limit} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label={t("to move")}>
        <input type="number" min={0} value={to} disabled={!limit} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Field label={t("reanalyze mistakes only")}>
        <input type="checkbox" checked={mistakes} onChange={(e) => setMistakes(e.target.checked)} />
      </Field>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => {
            close();
            analyzeExtra("game", {
              visits: Math.max(1, int(visits, 2500)),
              moveRange: limit ? [int(from, 0), int(to, 999)] : null,
              mistakesOnly: mistakes,
            });
          }}
        >
          {t("analysis:game")}
        </button>
      </div>
    </Modal>
  );
}
