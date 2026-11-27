// New game and "set up position".

import { useState } from "react";
import { t } from "../../core/i18n";
import { openDialog, requestNewGame, requestSetupPosition, useStore } from "../../state/store";
import { Field, Modal } from "./common";

const RULES = ["japanese", "chinese", "korean", "aga", "tromp-taylor", "new zealand", "stone_scoring"];

export function NewGameDialog() {
  const cfg = useStore((s) => s.config.game);
  const [mode, setMode] = useState<"newgame" | "setupposition">("newgame");
  const [setupMove, setSetupMove] = useState(String(cfg.setup_move));
  const [setupScore, setSetupScore] = useState(String(cfg.setup_advantage));
  const [size, setSize] = useState(String(cfg.size));
  const [komi, setKomi] = useState(String(cfg.komi));
  const [handicap, setHandicap] = useState(String(cfg.handicap));
  const [rules, setRules] = useState(cfg.rules);
  const close = () => openDialog(null);
  const valid =
    /^\d{1,2}(:\d{1,2})?$/.test(size.trim()) &&
    size.split(":").every((v) => +v >= 2 && +v <= 52) &&
    !Number.isNaN(parseFloat(komi));
  const setupValid = mode === "newgame" || (parseInt(setupMove, 10) > 0 && !Number.isNaN(parseFloat(setupScore)));
  const settings = () => ({ size: size.trim(), komi: parseFloat(komi), handicap: parseInt(handicap, 10), rules });
  return (
    <Modal title={t("New Game title")} onClose={close}>
      <div className="tabs" role="tablist">
        {(["newgame", "setupposition"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {t(m)}
          </button>
        ))}
      </div>
      <Field label={t("board size")} hint={t("non square board hint")}>
        <input value={size} onChange={(e) => setSize(e.target.value)} list="board-sizes" />
        <datalist id="board-sizes">
          {["9", "13", "19"].map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label={t("handicap")}>
        <select value={handicap} onChange={(e) => setHandicap(e.target.value)}>
          {Array.from({ length: 10 }, (_, i) => i)
            .filter((i) => i !== 1)
            .map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
        </select>
      </Field>
      <Field label={t("komi")}>
        <input type="number" step={0.5} value={komi} onChange={(e) => setKomi(e.target.value)} />
      </Field>
      <Field label={t("ruleset")}>
        <select value={rules} onChange={(e) => setRules(e.target.value)}>
          {RULES.map((r) => (
            <option key={r} value={r}>
              {t(r)}
            </option>
          ))}
        </select>
      </Field>
      {mode === "setupposition" && (
        <>
          <p className="muted">{t("setup position explanation")}</p>
          <Field label={t("setup position move number")}>
            <input type="number" min={1} value={setupMove} onChange={(e) => setSetupMove(e.target.value)} />
          </Field>
          <Field label={t("setup position black score")}>
            <input type="number" step={0.5} value={setupScore} onChange={(e) => setSetupScore(e.target.value)} />
          </Field>
        </>
      )}
      <div className="modal-actions">
        <button
          className="primary"
          disabled={!valid || !setupValid}
          onClick={() => {
            close();
            if (mode === "newgame") requestNewGame(settings());
            else requestSetupPosition(settings(), parseInt(setupMove, 10), parseFloat(setupScore));
          }}
        >
          {t(mode)}
        </button>
      </div>
    </Modal>
  );
}
