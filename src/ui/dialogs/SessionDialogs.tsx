// Dialogs about the session: app updates, unsaved changes and recovering an autosave.

import { t, tf } from "../../core/i18n";
import {
  discardAutosave,
  installUpdate,
  recoverAutosave,
  requestCloseDialog,
  resolveUnsaved,
  useStore,
} from "../../state/store";
import { Modal } from "./common";

/** Checking for, and installing, a newer version of the app. */
export function UpdateDialog() {
  const { phase, currentVersion, info, progress, error } = useStore((s) => s.update);
  const installing = phase === "installing";
  const percent = progress?.total ? Math.min(100, (100 * progress.received) / progress.total) : undefined;
  const footer = info && (
    <div className="modal-actions">
      <button className="text-button" onClick={requestCloseDialog}>
        {t("update:later")}
      </button>
      <button className="primary" disabled={installing} onClick={() => void installUpdate()}>
        {t("update:install")}
      </button>
    </div>
  );
  return (
    <Modal title={t("update:title")} onClose={requestCloseDialog} footer={footer}>
      <div className="update">
        {phase === "checking" && <p>{t("update:checking")}</p>}
        {phase === "latest" && <p>{tf("update:latest", { version: currentVersion })}</p>}
        {info && (
          <>
            <p className="update-version">{tf("update:available", { version: info.version })}</p>
            <p className="field-hint">{tf("update:current", { version: info.currentVersion })}</p>
            {info.notes && <div className="update-notes">{info.notes}</div>}
            <p className="field-hint">{t("update:restart")}</p>
          </>
        )}
        {installing && (
          <div className="update-progress">
            <progress max={100} value={percent} />
            <span>{t("update:downloading")}</span>
          </div>
        )}
        {phase === "error" && (
          <p className="update-error">{tf(info ? "update:failed" : "update:check-failed", { error: error ?? "" })}</p>
        )}
      </div>
    </Modal>
  );
}

export function UnsavedDialog() {
  const cancel = () => void resolveUnsaved("cancel");
  const footer = (
    <div className="modal-actions">
      <button className="text-button" onClick={cancel}>
        {t("unsaved:cancel")}
      </button>
      <button className="text-button unsaved-discard" onClick={() => void resolveUnsaved("discard")}>
        {t("unsaved:discard")}
      </button>
      <button className="primary" onClick={() => void resolveUnsaved("save")}>
        {t("unsaved:save")}
      </button>
    </div>
  );
  return (
    <Modal title={t("unsaved:title")} onClose={cancel} footer={footer}>
      <p>{t("unsaved:message")}</p>
    </Modal>
  );
}

export function RecoveryDialog() {
  const footer = (
    <div className="modal-actions">
      <button className="text-button" onClick={discardAutosave}>
        {t("recovery:discard")}
      </button>
      <button className="primary" onClick={recoverAutosave}>
        {t("recovery:recover")}
      </button>
    </div>
  );
  return (
    <Modal title={t("recovery:title")} onClose={discardAutosave} footer={footer}>
      <p>{t("recovery:message")}</p>
    </Modal>
  );
}
