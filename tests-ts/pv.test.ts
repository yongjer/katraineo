import { describe, expect, it } from "vitest";
import { clampMenuPosition } from "../src/ui/ContextMenu";
import { previewPv, shownMoves, stepPvDepth, usePvPreview, wheelPvDepth } from "../src/ui/pvPreview";
import { actionForCombo, resolveBindings } from "../src/ui/shortcuts";
import { WHEEL_GAP_MS, WHEEL_STEP } from "../src/ui/wheel";

describe("context menus", () => {
  const view = [1000, 800] as const;
  it("open at the mouse where they fit", () => {
    expect(clampMenuPosition(100, 200, 260, 150, ...view)).toEqual([100, 200]);
  });

  it("open to the left of the mouse, or above it, where they do not", () => {
    expect(clampMenuPosition(900, 200, 260, 150, ...view)).toEqual([640, 200]);
    expect(clampMenuPosition(100, 700, 260, 150, ...view)).toEqual([100, 550]);
    expect(clampMenuPosition(990, 790, 260, 150, ...view)).toEqual([730, 640]);
  });

  it("go against the edge of a window too small for either", () => {
    expect(clampMenuPosition(150, 100, 260, 150, 300, 200)).toEqual([36, 46]);
    expect(clampMenuPosition(10, 10, 500, 400, 300, 200)).toEqual([4, 4]); // larger than the window: top left
  });
});

describe("the previewed variation", () => {
  it("is shown whole at first", () => {
    previewPv("1:3,3", 8);
    expect(shownMoves(8, usePvPreview.getState().depth)).toBe(8);
  });

  it("shows fewer and more moves, from one to all", () => {
    previewPv("1:3,3", 8);
    stepPvDepth(-1);
    stepPvDepth(-1);
    expect(usePvPreview.getState().depth).toBe(6);
    for (let i = 0; i < 20; i++) stepPvDepth(-1);
    expect(usePvPreview.getState().depth).toBe(1);
    for (let i = 0; i < 20; i++) stepPvDepth(1);
    expect(usePvPreview.getState().depth).toBeNull(); // all of it
  });

  it("starts whole again for another move, and keeps its depth for the same one", () => {
    previewPv("1:3,3", 8);
    stepPvDepth(-3);
    previewPv("1:3,3", 8);
    expect(usePvPreview.getState().depth).toBe(5);
    previewPv("1:3,3", 12); // analysis found a longer variation
    expect(shownMoves(12, usePvPreview.getState().depth)).toBe(5);
    previewPv("1:4,4", 8);
    expect(usePvPreview.getState().depth).toBeNull();
    previewPv(null, 0);
    expect(stepPvDepth(-1)).toBe(false);
  });

  it("follows the wheel a step at a time, also from a touchpad", () => {
    previewPv("2:3,3", 10);
    let time = 0;
    wheelPvDepth(-3, 0, (time += 1000)); // the start of a scroll up: one fewer
    expect(usePvPreview.getState().depth).toBe(9);
    for (let i = 0; i < 10; i++) wheelPvDepth(-WHEEL_STEP / 10, 0, (time += 10)); // a touchpad's small deltas
    expect(usePvPreview.getState().depth).toBe(8);
    wheelPvDepth(100, 0, (time += WHEEL_GAP_MS + 1)); // a notch down: one more
    expect(usePvPreview.getState().depth).toBe(9);
  });

  it("has keys for fewer and more moves", () => {
    const b = resolveBindings({});
    expect(actionForCombo(b, ",")?.id).toBe("pv-shorter");
    expect(actionForCombo(b, ".")?.id).toBe("pv-longer");
  });
});
