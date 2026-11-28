import { describe, expect, it, vi } from "vitest";

vi.mock("../src/state/platform", () => ({
  platform: { saveConfig: async () => {} },
}));

import { parseSavedConfig } from "../src/state/config";
import { updateConfig, useStore } from "../src/state/store";
import {
  ACTIONS,
  actionForCombo,
  assignKeys,
  comboFromEvent,
  comboLabel,
  handleKeyDown,
  normalizeCombo,
  resolveBindings,
} from "../src/ui/shortcuts";

const key = (
  code: string,
  key: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  code,
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("key combinations", () => {
  it("reads letters and digits by the physical key", () => {
    expect(comboFromEvent(key("KeyZ", "z"))).toBe("Z");
    expect(comboFromEvent(key("KeyI", "Process"))).toBe("I"); // an input method is active
    expect(comboFromEvent(key("KeyQ", "й"))).toBe("Q"); // a Cyrillic layout
    expect(comboFromEvent(key("Digit7", "&"))).toBe("7");
  });

  it("puts the modifiers first, Ctrl and Cmd both as Mod", () => {
    expect(comboFromEvent(key("KeyZ", "Z", { shiftKey: true }))).toBe("Shift+Z");
    expect(comboFromEvent(key("KeyS", "s", { ctrlKey: true }))).toBe("Mod+S");
    expect(comboFromEvent(key("KeyS", "s", { metaKey: true }))).toBe("Mod+S");
    expect(comboFromEvent(key("ArrowLeft", "ArrowLeft", { ctrlKey: true, shiftKey: true }))).toBe(
      "Mod+Shift+ArrowLeft",
    );
  });

  it("names the other keys", () => {
    expect(comboFromEvent(key("Backquote", "`"))).toBe("`");
    expect(comboFromEvent(key("Backquote", "~", { shiftKey: true }))).toBe("Shift+`");
    expect(comboFromEvent(key("F12", "F12"))).toBe("F12");
    expect(comboFromEvent(key("Space", " "))).toBe("Space");
    expect(comboFromEvent(key("Slash", "/", { ctrlKey: true }))).toBe("Mod+/");
  });

  it("ignores a modifier on its own", () => {
    expect(comboFromEvent(key("ShiftLeft", "Shift", { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(key("ControlLeft", "Control", { ctrlKey: true }))).toBeNull();
  });

  it("normalizes combinations written by hand", () => {
    expect(normalizeCombo("ctrl+shift+z")).toBe("Mod+Shift+Z");
    expect(normalizeCombo("Cmd+/")).toBe("Mod+/");
    expect(normalizeCombo("shift+alt+F2")).toBe("Alt+Shift+F2");
  });

  it("shows them the way each system writes them", () => {
    expect(comboLabel("Mod+Shift+Z", false)).toBe("Ctrl+Shift+Z");
    expect(comboLabel("Mod+Shift+Z", true)).toBe("⌘⇧Z");
    expect(comboLabel("Shift+ArrowLeft", false)).toBe("Shift+←");
    expect(comboLabel("Mod+Backspace", true)).toBe("⌘⌫");
  });
});

describe("bindings", () => {
  it("has no key on two actions by default", () => {
    const seen = new Map<string, string>();
    for (const [id, keys] of resolveBindings({})) {
      for (const k of keys) {
        expect(seen.get(k), `${k} is on ${seen.get(k)} and ${id}`).toBeUndefined();
        seen.set(k, id);
      }
    }
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });

  it("keeps the keys of KaTrain", () => {
    const b = resolveBindings({});
    const find = (combo: string) => actionForCombo(b, combo)?.id;
    expect(find("Z")).toBe("undo");
    expect(find("Shift+Z")).toBe("undo-10");
    expect(find("Mod+ArrowLeft")).toBe("start");
    expect(find("Tab")).toBe("mode");
    expect(find("F10")).toBe("tsumego-frame");
    expect(find("`")).toBe("focus");
    expect(find("F12")).toBe("focus");
  });

  it("falls back to the key without Shift, which KaTrain did not mind", () => {
    const b = resolveBindings({});
    expect(actionForCombo(b, "Shift+Q")?.id).toBe("show-children");
    expect(actionForCombo(b, "Shift+`")?.id).toBe("focus"); // "~"
    expect(actionForCombo(b, "Mod+Shift+S")?.id).toBe("save");
    expect(actionForCombo(b, "Alt+Q")).toBeNull();
  });

  it("moves a key to the action that is given it", () => {
    const { overrides, changed } = assignKeys({}, "redo", ["ArrowRight", "X", "Z"]);
    expect(changed).toEqual(["undo"]);
    expect(overrides).toEqual({ redo: ["ArrowRight", "X", "Z"], undo: ["ArrowLeft"] });
    expect(actionForCombo(resolveBindings(overrides), "Z")?.id).toBe("redo");
  });

  it("keeps only the actions whose keys differ from their defaults", () => {
    const moved = assignKeys({}, "redo", ["Z"]).overrides;
    const back = assignKeys(assignKeys(moved, "redo", ["ArrowRight", "X"]).overrides, "undo", ["ArrowLeft", "Z"]);
    expect(back.overrides).toEqual({});
  });

  it("can leave an action without keys", () => {
    const { overrides } = assignKeys({}, "pass", []);
    expect(overrides).toEqual({ pass: [] });
    expect(actionForCombo(resolveBindings(overrides), "P")).toBeNull();
  });
});

describe("the keyboard handler", () => {
  const press = (code: string, k: string, mods = {}) => {
    const prevented = { value: false };
    handleKeyDown({
      ...key(code, k, mods),
      target: { closest: () => null },
      preventDefault: () => void (prevented.value = true),
    } as unknown as KeyboardEvent);
    return prevented.value;
  };

  it("runs the action of a key, and follows changed keys", () => {
    updateConfig((c) => void (c.shortcuts = {}));
    const before = useStore.getState().showCoords;
    expect(press("KeyK", "k")).toBe(true);
    expect(useStore.getState().showCoords).toBe(!before);
    updateConfig((c) => void (c.shortcuts = { coordinates: ["J"] }));
    expect(press("KeyK", "k")).toBe(false);
    expect(useStore.getState().showCoords).toBe(!before);
    expect(press("KeyJ", "j")).toBe(true);
    expect(useStore.getState().showCoords).toBe(before);
    updateConfig((c) => void (c.shortcuts = {}));
  });

  it("cycles the focus modes", () => {
    useStore.setState({ focusMode: 0 });
    press("Backquote", "`");
    expect(useStore.getState().focusMode).toBe(1);
    press("F12", "F12");
    expect(useStore.getState().focusMode).toBe(2);
    press("Backquote", "~", { shiftKey: true });
    expect(useStore.getState().focusMode).toBe(0);
  });

  it("leaves keys alone while a dialog is open or a text field has the focus", () => {
    const before = useStore.getState().showCoords;
    useStore.setState({ dialog: "settings" });
    expect(press("KeyK", "k")).toBe(false);
    useStore.setState({ dialog: null });
    const inField = { ...key("KeyK", "k"), target: { closest: () => ({}) }, preventDefault: () => {} };
    handleKeyDown(inField as unknown as KeyboardEvent);
    expect(useStore.getState().showCoords).toBe(before);
  });
});

describe("saved shortcuts and appearance", () => {
  it("keeps the changed shortcuts and drops what is not a list of keys", () => {
    const config = parseSavedConfig(JSON.stringify({ shortcuts: { undo: ["Q"], redo: "X", pass: [1] } }));
    expect(config.shortcuts).toEqual({ undo: ["Q"] });
  });

  it("reads the appearance, with the defaults for what is missing", () => {
    const config = parseSavedConfig(JSON.stringify({ ui: { appearance: { board: "wood" } } }));
    expect(config.ui.appearance).toEqual({ theme: "dark", board: "wood", stones: "classic" });
    expect(parseSavedConfig(null).shortcuts).toEqual({});
  });
});
