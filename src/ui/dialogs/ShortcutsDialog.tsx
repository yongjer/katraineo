// Keyboard shortcuts: every action with its keys, which can be changed, added, removed and reset. Changes apply at once.

import { useEffect, useState } from "react";
import { t, tf } from "../../core/i18n";
import { openDialog, updateConfig, useStore } from "../../state/store";
import {
  ACTIONS,
  SHORTCUT_GROUPS,
  actionLabel,
  assignKeys,
  comboFromEvent,
  comboLabel,
  normalizeCombo,
  resolveBindings,
} from "../shortcuts";
import { Modal } from "./common";

export function ShortcutsDialog() {
  const overrides = useStore((s) => s.config.shortcuts);
  const bindings = resolveBindings(overrides);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [note, setNote] = useState<{ action: string; text: string } | null>(null);
  const [filter, setFilter] = useState("");

  const setKeys = (action: string, keys: string[]) => {
    const { overrides: next, changed } = assignKeys(overrides, action, keys);
    updateConfig((c) => void (c.shortcuts = next));
    const names = changed.map((id) => actionLabel(ACTIONS.find((a) => a.id === id)!));
    setNote(names.length ? { action, text: tf("shortcuts:moved", { actions: names.join(", ") }) } : null);
  };

  // while waiting for a key, it goes here and nowhere else (not to the app's shortcuts, not to Escape closing us)
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setCapturing(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // a modifier on its own: wait for the key
      setCapturing(null);
      setKeys(capturing, [...(bindings.get(capturing) ?? []), combo]);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });

  const query = filter.trim().toLowerCase();
  const footer = (
    <div className="modal-actions">
      <button
        className="text-button"
        disabled={Object.keys(overrides).length === 0}
        onClick={() => {
          updateConfig((c) => void (c.shortcuts = {}));
          setNote(null);
        }}
      >
        {t("shortcuts:reset-all")}
      </button>
      <button className="primary" onClick={() => openDialog(null)}>
        {t("shortcuts:done")}
      </button>
    </div>
  );
  return (
    <Modal title={t("menu:shortcuts")} onClose={() => openDialog(null)} footer={footer}>
      <input
        className="shortcuts-filter"
        placeholder={t("shortcuts:filter")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label={t("shortcuts:filter")}
      />
      {SHORTCUT_GROUPS.map((group) => {
        const actions = ACTIONS.filter(
          (a) =>
            a.group === group &&
            (!query ||
              actionLabel(a).toLowerCase().includes(query) ||
              (bindings.get(a.id) ?? []).some((k) => comboLabel(k).toLowerCase().includes(query))),
        );
        if (!actions.length) return null;
        return (
          <section key={group}>
            <h3 className="shortcuts-group">{t(`shortcuts:group:${group}`)}</h3>
            {actions.map((a) => {
              const keys = bindings.get(a.id) ?? [];
              const changed = a.id in overrides;
              return (
                <div key={a.id} className={`shortcut-row ${changed ? "changed" : ""}`}>
                  <span className="shortcut-name">{actionLabel(a)}</span>
                  <span className="shortcut-keys">
                    {keys.map((k) => (
                      <span key={k} className="shortcut-key">
                        <kbd>{comboLabel(k)}</kbd>
                        <button
                          aria-label={tf("shortcuts:remove", { key: comboLabel(k) })}
                          title={tf("shortcuts:remove", { key: comboLabel(k) })}
                          onClick={() =>
                            setKeys(
                              a.id,
                              keys.filter((x) => x !== k),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {capturing === a.id ? (
                      <span className="shortcut-capture">{t("shortcuts:press")}</span>
                    ) : (
                      <button className="shortcut-add" title={t("shortcuts:add")} onClick={() => setCapturing(a.id)}>
                        +
                      </button>
                    )}
                    {changed && (
                      <button
                        className="shortcut-reset"
                        title={t("shortcuts:reset")}
                        aria-label={t("shortcuts:reset")}
                        onClick={() => setKeys(a.id, a.defaults.map(normalizeCombo))}
                      >
                        ↺
                      </button>
                    )}
                  </span>
                  {note?.action === a.id && <span className="shortcut-note">{note.text}</span>}
                </div>
              );
            })}
          </section>
        );
      })}
    </Modal>
  );
}
