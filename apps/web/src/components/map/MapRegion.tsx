"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useWorldStore } from "@/stores/world-store";

const ROTATE = Math.PI / 12;
const TILT = Math.PI / 24;

/**
 * The focusable 3D map. It carries the accessible name, a description of the
 * controls and the keyboard shortcuts, which only act while the map has focus
 * (WCAG 2.1.4). Pointer gestures are handled by the camera rig on the canvas.
 */
export function MapRegion({ children, onSearchShortcut }: { children: React.ReactNode; onSearchShortcut(): void }) {
  const t = useTranslations("map");
  const helpId = useId();

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const { send, picking } = useWorldStore.getState();
    const step = e.shiftKey ? 2.5 : 1;
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        send({ kind: "pan", forward: step, right: 0 });
        break;
      case "ArrowDown":
      case "s":
      case "S":
        send({ kind: "pan", forward: -step, right: 0 });
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        send({ kind: "pan", forward: 0, right: -step });
        break;
      case "ArrowRight":
      case "d":
      case "D":
        send({ kind: "pan", forward: 0, right: step });
        break;
      case "+":
      case "=":
        send({ kind: "zoom", factor: 0.6 });
        break;
      case "-":
      case "_":
        send({ kind: "zoom", factor: 1 / 0.6 });
        break;
      case "q":
      case "Q":
        send({ kind: "rotate", radians: -ROTATE });
        break;
      case "e":
      case "E":
        send({ kind: "rotate", radians: ROTATE });
        break;
      case "PageUp":
        send({ kind: "tilt", radians: -TILT });
        break;
      case "PageDown":
        send({ kind: "tilt", radians: TILT });
        break;
      case "n":
      case "N":
        send({ kind: "resetNorth" });
        break;
      case "h":
      case "H":
      case "Home":
        send({ kind: "home" });
        break;
      case "/":
        onSearchShortcut();
        break;
      case "Enter":
        if (picking) pickMapCentre();
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
     role="application" is the ARIA pattern for a widget with its own keyboard
     model; jsx-a11y does not list it among interactive roles. */
  return (
    <div
      id="main"
      role="application"
      aria-roledescription={t("roleDescription")}
      aria-label={t("label")}
      aria-describedby={helpId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="absolute inset-0 outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:z-10 focus-visible:after:ring-4 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
    >
      <p id={helpId} className="sr-only">
        {t("help")}
      </p>
      {children}
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}

/** Choose the point under the centre of the view (keyboard alternative to clicking the map). */
export function pickMapCentre() {
  const { view, setPickedPoint } = useWorldStore.getState();
  if (!view) return false;
  setPickedPoint({ x: view.targetX, y: view.targetY, z: view.targetZ });
  return true;
}
