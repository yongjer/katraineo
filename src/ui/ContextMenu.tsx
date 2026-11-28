// A menu at the mouse (right click), kept inside the window, closed by a click elsewhere, Escape or leaving the window.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const MARGIN = 4;

/**
 * Where to put a menu of the given size opened at (x, y), so that it stays inside the viewport: left of the point if
 * there is no room to its right, above it if there is no room below, and against the edge if neither fits.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewWidth: number,
  viewHeight: number,
): [number, number] {
  const place = (at: number, size: number, view: number) => {
    if (at + size <= view - MARGIN) return at;
    if (at - size >= MARGIN) return at - size;
    return Math.max(MARGIN, view - MARGIN - size);
  };
  return [place(x, width, viewWidth), place(y, height, viewHeight)];
}

export function ContextMenu({
  x,
  y,
  onClose,
  className = "",
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // measured before it is painted, then moved inside the window
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const [left, top] = clampMenuPosition(x, y, r.width, r.height, window.innerWidth, window.innerHeight);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [x, y]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation(); // Escape closes the menu, and does nothing else
      onClose();
    };
    window.addEventListener("mousedown", onClose);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      className={`context-menu dropdown ${className}`}
      style={{ left: x, top: y, visibility: "hidden" }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
