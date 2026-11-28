// Settings of the AI strategies.

import { useState } from "react";
import { aiRankEstimation, rankLabel } from "../../core/ai";
import { AI_STRATEGIES_AVAILABLE, AI_STRATEGIES_HUMAN_MODEL } from "../../core/constants";
import { t } from "../../core/i18n";
import { openDialog, updateConfig, useStore } from "../../state/store";
import { Field, Modal, NumberInput } from "./common";

export function AiSettingsDialog() {
  const config = useStore((s) => s.config);
  const players = config.ui.players;
  const [strategy, setStrategy] = useState<string>(
    players.W.type === "player:ai" ? players.W.strategy : players.B.strategy,
  );
  const [draft, setDraft] = useState(() => structuredClone(config.ai));
  const settings = draft[strategy] ?? {};
  const close = () => openDialog(null);
  return (
    <Modal title={t("ai settings")} onClose={close}>
      <Field label={t("Select AI")}>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          {AI_STRATEGIES_AVAILABLE.map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      </Field>
      <p className="ai-help">{t(`aihelp:${strategy.replace(/^ai:/, "")}`).replace(/\[\/?[a-z]+[^\]]*\]/g, "")}</p>
      {AI_STRATEGIES_HUMAN_MODEL.includes(strategy) && !config.engine.humanlike_model && (
        <p className="warning">
          {t("engine:humanlike_model")}: — {t("menu:settings")} → {t("download models button")}
        </p>
      )}
      {Object.keys(settings).length === 0 && <p className="muted">—</p>}
      {Object.entries(settings).map(([key, value]) => (
        <Field key={key} label={key.replace(/_/g, " ")}>
          {typeof value === "boolean" ? (
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setDraft((d) => ({ ...d, [strategy]: { ...d[strategy], [key]: e.target.checked } }))}
            />
          ) : (
            <NumberInput
              step="any"
              value={value as number}
              onValue={(v) => setDraft((d) => ({ ...d, [strategy]: { ...d[strategy], [key]: v } }))}
            />
          )}
        </Field>
      ))}
      <p>
        {t("estimated strength")}: <b>{rankLabel(aiRankEstimation(strategy, settings))}</b>
      </p>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => {
            close();
            updateConfig((c) => void (c.ai = draft));
          }}
        >
          {t("update ai settings")}
        </button>
      </div>
    </Modal>
  );
}
