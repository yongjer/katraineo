// General, engine and teacher settings.

import { useEffect, useState } from "react";
import { TOP_MOVE_OPTIONS } from "../../core/constants";
import { ENGINE_BACKENDS, resolveEngineBackend } from "../../core/engine";
import { t } from "../../core/i18n";
import type { AppConfig } from "../../state/config";
import { platform, type DownloadProgress } from "../../state/platform";
import {
  getEngine,
  openDialog,
  requestCloseDialog,
  setDialogCloseGuard,
  updateConfig,
  useStore,
} from "../../state/store";
import { LANGUAGES } from "../i18nLoader";
import { ModelPicker } from "../ModelPicker";
import { EVAL_COLORS, IS_MAC } from "../theme";
import { Field, Modal, NumberInput } from "./common";

export function SettingsDialog() {
  const config = useStore((s) => s.config);
  const [draft, setDraft] = useState<AppConfig>(() => structuredClone(config));
  const close = () => openDialog(null);
  const edit = (f: (c: AppConfig) => void) =>
    setDraft((d) => {
      const c = structuredClone(d);
      f(c);
      return c;
    });
  const e = draft.engine;
  const backend = resolveEngineBackend(e);
  const tr = draft.trainer;
  const engine = getEngine();
  const localEngineDead = backend === "local" && !!engine && engine.state === "dead";
  const [cpuProgress, setCpuProgress] = useState<DownloadProgress | null>(null);
  const [cpuError, setCpuError] = useState<string | null>(null);
  useEffect(() => {
    let unlisten = () => {};
    void platform.onKatagoDownloadProgress((p) => setCpuProgress(p)).then((u) => (unlisten = u));
    return () => unlisten();
  }, []);
  const browseKatago = async () => {
    const path = await platform.pickFile({ title: t("engine:katago") });
    if (path) edit((c) => void (c.engine.katago = path));
  };
  const browseConfig = async () => {
    const path = await platform.pickFile({
      title: t("engine:config"),
      filterName: "KataGo config",
      extensions: ["cfg"],
    });
    if (path) edit((c) => void (c.engine.config = path));
  };
  const downloadEigen = async () => {
    setCpuError(null);
    setCpuProgress({ name: "KataGo (CPU)", received: 0, total: null, done: false, error: null, path: null });
    try {
      const path = await platform.downloadEigenKatago();
      setCpuProgress(null);
      edit((c) => void (c.engine.katago = path));
    } catch (err) {
      setCpuProgress(null);
      setCpuError(String(err));
    }
  };
  // Closing with unsaved changes asks first, instead of silently dropping them.
  const saved = (c: AppConfig) => JSON.stringify([c.general, c.engine, c.trainer]);
  const dirty = saved(draft) !== saved(config);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setDialogCloseGuard(() => {
      if (dirty) setConfirming(true);
      return dirty;
    });
    return () => setDialogCloseGuard(null);
  }, [dirty]);
  const apply = () => {
    close();
    // applying also retries an engine that has stopped, even with unchanged settings
    updateConfig(
      (c) => {
        c.general = draft.general;
        c.engine = draft.engine;
        c.trainer = draft.trainer;
      },
      { restartDeadEngine: true },
    );
  };
  const footer = (
    <div className="modal-actions">
      {confirming && (
        <>
          <span className="unsaved">{t("settings:unsaved")}</span>
          <button className="text-button" onClick={close}>
            {t("settings:discard")}
          </button>
        </>
      )}
      <button className="primary" onClick={apply}>
        {t("update settings")}
      </button>
    </div>
  );
  return (
    <Modal title={t("general settings title")} onClose={requestCloseDialog} footer={footer}>
      <h3>{t("general settings")}</h3>
      <Field label={t("menu:lang")}>
        <select value={draft.general.lang} onChange={(ev) => edit((c) => void (c.general.lang = ev.target.value))}>
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("load sgf rewind")}>
        <input
          type="checkbox"
          checked={draft.general.load_sgf_rewind}
          onChange={(ev) => edit((c) => void (c.general.load_sgf_rewind = ev.target.checked))}
        />
      </Field>
      <Field label={t("load sgf fast analysis")}>
        <input
          type="checkbox"
          checked={draft.general.load_fast_analysis}
          onChange={(ev) => edit((c) => void (c.general.load_fast_analysis = ev.target.checked))}
        />
      </Field>
      {platform.isDesktop && (
        <Field label={t("check for updates")}>
          <input
            type="checkbox"
            checked={draft.general.check_for_updates}
            onChange={(ev) => edit((c) => void (c.general.check_for_updates = ev.target.checked))}
          />
        </Field>
      )}

      <h3>{t("engine settings")}</h3>
      <div className="backend-tabs">
        <div className="tabs" role="tablist">
          {ENGINE_BACKENDS.map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={backend === b}
              className={backend === b ? "active" : ""}
              onClick={() => edit((c) => void (c.engine.backend = b))}
            >
              {t(`engine:tab:${b}`)}
            </button>
          ))}
        </div>
        <span className="backend-note">{t("engine:backend:note")}</span>
      </div>
      {backend === "local" && (
        <>
          {platform.isDesktop && !IS_MAC && (
            <div className={`engine-fallback ${localEngineDead ? "alert" : ""}`}>
              <span>{localEngineDead ? t("engine:cpu-fallback:failed") : t("engine:cpu-fallback:hint")}</span>
              {cpuProgress && !cpuProgress.done ? (
                <span className="download-inline">
                  <progress
                    max={cpuProgress.total ?? undefined}
                    value={cpuProgress.total ? cpuProgress.received : undefined}
                  />
                  <span>
                    {cpuProgress.total
                      ? `${Math.round(cpuProgress.received / 1e6)} / ${Math.round(cpuProgress.total / 1e6)} MB`
                      : "…"}
                  </span>
                </span>
              ) : (
                <button className="text-button small" onClick={() => void downloadEigen()}>
                  {t("engine:cpu-fallback:button")}
                </button>
              )}
              {cpuError && <span className="engine-fallback-error">{cpuError}</span>}
            </div>
          )}
          <Field label={t("engine:katago")} hint={t("engine:katago:hint")}>
            <span className="input-with-browse">
              <input
                value={e.katago}
                onChange={(ev) => edit((c) => void (c.engine.katago = ev.target.value))}
                spellCheck={false}
              />
              {platform.isDesktop && (
                <button type="button" className="text-button small" onClick={() => void browseKatago()}>
                  {t("settings:browse")}
                </button>
              )}
            </span>
          </Field>
          <ModelPicker
            model={e.model}
            humanlikeModel={e.humanlike_model}
            onModel={(v) => edit((c) => void (c.engine.model = v))}
            onHumanlikeModel={(v) => edit((c) => void (c.engine.humanlike_model = v))}
          />
          {!platform.isDesktop && (
            <>
              <Field label={t("engine:model")}>
                <input
                  value={e.model}
                  onChange={(ev) => edit((c) => void (c.engine.model = ev.target.value))}
                  spellCheck={false}
                />
              </Field>
              <Field label={t("engine:humanlike_model")}>
                <input
                  value={e.humanlike_model}
                  onChange={(ev) => edit((c) => void (c.engine.humanlike_model = ev.target.value))}
                  spellCheck={false}
                />
              </Field>
            </>
          )}
          <Field label={t("engine:config")}>
            <span className="input-with-browse">
              <input
                value={e.config}
                onChange={(ev) => edit((c) => void (c.engine.config = ev.target.value))}
                spellCheck={false}
              />
              {platform.isDesktop && (
                <button type="button" className="text-button small" onClick={() => void browseConfig()}>
                  {t("settings:browse")}
                </button>
              )}
            </span>
          </Field>
        </>
      )}
      {backend === "remote" && (
        <Field label={t("engine:remote_url")} hint={t("engine:remote_url:hint")}>
          <input
            value={e.remote_url ?? ""}
            placeholder="wss://"
            onChange={(ev) => edit((c) => void (c.engine.remote_url = ev.target.value))}
            spellCheck={false}
          />
        </Field>
      )}
      {backend === "custom" && (
        <Field label={t("engine:altcommand")} hint={t("engine:altcommand:hint")}>
          <input
            value={e.altcommand}
            onChange={(ev) => edit((c) => void (c.engine.altcommand = ev.target.value))}
            spellCheck={false}
          />
        </Field>
      )}
      <Field label={t("engine:max_visits")}>
        <NumberInput
          min={1}
          value={e.max_visits}
          onValue={(v) => edit((c) => void (c.engine.max_visits = Math.max(1, Math.round(v))))}
        />
      </Field>
      <Field label={t("engine:fast_visits")}>
        <NumberInput
          min={1}
          value={e.fast_visits}
          onValue={(v) => edit((c) => void (c.engine.fast_visits = Math.max(1, Math.round(v))))}
        />
      </Field>
      <Field label={t("engine:max_time")} hint={t("engine:time:hint")}>
        <NumberInput
          min={0.1}
          step={0.5}
          value={e.max_time}
          onValue={(v) => edit((c) => void (c.engine.max_time = v))}
        />
      </Field>
      <Field label={t("engine:wide_root_noise")} hint={t("engine:wide_root_noise:hint")}>
        <NumberInput
          min={0}
          step={0.01}
          value={e.wide_root_noise}
          onValue={(v) => edit((c) => void (c.engine.wide_root_noise = v))}
        />
      </Field>

      <h3>{t("teacher settings")}</h3>
      <Field label={t("theme")}>
        <select value={tr.theme} onChange={(ev) => edit((c) => void (c.trainer.theme = ev.target.value))}>
          {Object.keys(EVAL_COLORS).map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </Field>
      <div className="threshold-table">
        <span>{t("point loss threshold")}</span>
        <span>{t("dot color")}</span>
        <span>{t("show dots")}</span>
        <span>{t("save dots")}</span>
        <span>{t("num undos").replace(/\s*\n\s*/g, " ")}</span>
        {tr.eval_thresholds.map((thr, i) => (
          <ThresholdRow key={i} i={i} thr={thr} draft={draft} edit={edit} />
        ))}
      </div>
      <Field label={t("show last n dots")}>
        <NumberInput
          min={0}
          value={tr.eval_on_show_last}
          onValue={(v) => edit((c) => void (c.trainer.eval_on_show_last = Math.max(0, Math.round(v))))}
        />
      </Field>
      <Field label={t("show ai dots")}>
        <input
          type="checkbox"
          checked={tr.eval_show_ai}
          onChange={(ev) => edit((c) => void (c.trainer.eval_show_ai = ev.target.checked))}
        />
      </Field>
      <Field label={t("show move numbers")}>
        <input
          type="checkbox"
          checked={tr.show_move_numbers}
          onChange={(ev) => edit((c) => void (c.trainer.show_move_numbers = ev.target.checked))}
        />
      </Field>
      <Field label={t("stats on top move")}>
        <span className="pair">
          {(["top_moves_show", "top_moves_show_secondary"] as const).map((key) => (
            <select key={key} value={tr[key]} onChange={(ev) => edit((c) => void (c.trainer[key] = ev.target.value))}>
              {TOP_MOVE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {t(o)}
                </option>
              ))}
            </select>
          ))}
        </span>
      </Field>
      <Field label={t("show stats if")}>
        <NumberInput
          min={0}
          value={tr.low_visits}
          onValue={(v) => edit((c) => void (c.trainer.low_visits = Math.max(0, Math.round(v))))}
        />
      </Field>
      <Field label={t("show two digits for point loss near zero")}>
        <input
          type="checkbox"
          checked={tr.extra_precision}
          onChange={(ev) => edit((c) => void (c.trainer.extra_precision = ev.target.checked))}
        />
      </Field>
      <Field label={t("cache analysis to sgf")}>
        <input
          type="checkbox"
          checked={tr.save_analysis}
          onChange={(ev) => edit((c) => void (c.trainer.save_analysis = ev.target.checked))}
        />
      </Field>
      <p className="muted">
        {platform.isDesktop ? t("config file path") + " config.json" : "Settings are stored in this browser."}
      </p>
    </Modal>
  );
}

function ThresholdRow({
  i,
  thr,
  draft,
  edit,
}: {
  i: number;
  thr: number;
  draft: AppConfig;
  edit: (f: (c: AppConfig) => void) => void;
}) {
  const colors = EVAL_COLORS[draft.trainer.theme] ?? EVAL_COLORS["theme:normal"];
  return (
    <>
      <NumberInput
        step={0.5}
        min={0}
        value={thr}
        onValue={(v) => edit((c) => void (c.trainer.eval_thresholds[i] = Math.max(0, v)))}
      />
      <span className="swatch" style={{ background: colors[i] }} />
      <input
        type="checkbox"
        checked={draft.trainer.show_dots[i]}
        onChange={(ev) => edit((c) => void (c.trainer.show_dots[i] = ev.target.checked))}
      />
      <input
        type="checkbox"
        checked={draft.trainer.save_feedback[i]}
        onChange={(ev) => edit((c) => void (c.trainer.save_feedback[i] = ev.target.checked))}
      />
      <NumberInput
        step={0.1}
        min={0}
        value={draft.trainer.num_undo_prompts[i] ?? 0}
        onValue={(v) => edit((c) => void (c.trainer.num_undo_prompts[i] = Math.max(0, v)))}
      />
    </>
  );
}
