// Building blocks of the dialogs: the modal frame, a labelled field and a number input.

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { t } from "../../core/i18n";

/** `footer` stays in view below the scrolling body. */
export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label={t("a11y:close")} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/**
 * A number field that may be empty or half typed while editing. It reports only text that parses as a number, and
 * shows the value it settled on once it loses the focus; a plain controlled number input would jump to a default as
 * soon as it is cleared, so clearing it and typing a new number did not work.
 */
export function NumberInput({
  value,
  onValue,
  ...props
}: { value: number; onValue: (v: number) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      value={text ?? String(value)}
      onChange={(ev) => {
        setText(ev.target.value);
        const v = parseFloat(ev.target.value);
        if (!Number.isNaN(v)) onValue(v);
      }}
      onBlur={(ev) => {
        setText(null);
        props.onBlur?.(ev);
      }}
    />
  );
}
