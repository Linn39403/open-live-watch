import type { Widget } from "./model";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { instrumentPalette } from "./colors";
export function Instrument({
  w,
  value,
  onWrite,
  running,
}: {
  w: Widget;
  value: number | boolean;
  onWrite: (v: number | boolean) => void;
  running: boolean;
}) {
  const min = w.settings.min ?? 0,
    max = w.settings.max ?? 3000,
    p = Math.max(0, Math.min(1, (Number(value) - min) / (max - min))),
    angle = ((-135 + p * 270) * Math.PI) / 180;
  const display = Number(value).toFixed(w.settings.precision ?? 0);
  const id = "face-" + w.id;
  const palette = instrumentPalette(w.settings);
  const appearance = {
    "--instrument-color": palette.color,
    "--instrument-light": palette.light,
    "--instrument-dark": palette.dark,
    "--instrument-pale": palette.pale,
    "--instrument-ink": palette.ink,
    "--instrument-button-ink": palette.buttonInk,
  } as CSSProperties;
  const [draft, setDraft] = useState(Number(value));
  useEffect(() => {
    setDraft(Number(value));
  }, [value, running]);
  if (
    !w.binding ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    return (
      <div className="instrument">
        <div className="instrument-title">{w.title}</div>
        <output>Unresolved</output>
        <div className="binding-label">
          {w.binding?.symbolPath ?? "Unbound"}
        </div>
      </div>
    );
  return (
    <div className={"instrument " + w.kind} style={appearance}>
      <div className="instrument-title">{w.title}</div>
      {w.kind === "radial" ? (
        <svg
          viewBox="0 0 220 160"
          role="img"
          aria-label={w.title + " " + display}
        >
          <defs>
            <radialGradient id={id}>
              <stop stopColor="#fff" />
              <stop offset=".8" stopColor="#f5f6f4" />
              <stop offset="1" stopColor="#c2c9cb" />
            </radialGradient>
          </defs>
          <circle
            cx="110"
            cy="82"
            r="73"
            fill={"url(#" + id + ")"}
            stroke="#65777f"
            strokeWidth="5"
          />
          <path
            d="M 65 127 A 64 64 0 1 1 155 127"
            fill="none"
            stroke={palette.color}
            strokeWidth="7"
          />
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((-135 + i * 27) * Math.PI) / 180;
            return (
              <g key={i}>
                <line
                  x1={110 + Math.sin(a) * 53}
                  y1={82 - Math.cos(a) * 53}
                  x2={110 + Math.sin(a) * 61}
                  y2={82 - Math.cos(a) * 61}
                  stroke="#405057"
                  strokeWidth="2"
                />
                <text
                  x={110 + Math.sin(a) * 43}
                  y={86 - Math.cos(a) * 43}
                  textAnchor="middle"
                  fontSize="8"
                >
                  {Math.round(min + ((max - min) * i) / 10)}
                </text>
              </g>
            );
          })}
          <line
            x1="110"
            y1="82"
            x2={110 + Math.sin(angle) * 52}
            y2={82 - Math.cos(angle) * 52}
            stroke={palette.needle}
            strokeWidth="3"
          />
          <circle cx="110" cy="82" r="6" fill="#536068" />
          <rect
            x="80"
            y="111"
            width="60"
            height="20"
            rx="2"
            fill={palette.pale}
            stroke={palette.dark}
          />
          <text
            x="110"
            y="125"
            textAnchor="middle"
            fontSize="13"
            fill={palette.ink}
          >
            {display}
          </text>
          <text x="110" y="148" textAnchor="middle" fontSize="10">
            {w.binding?.units}
          </text>
        </svg>
      ) : w.kind === "led" ? (
        <div
          className={"led-face " + (value ? "lit" : "")}
          aria-label={value ? "On" : "Off"}
        />
      ) : w.kind === "switch" ? (
        <button
          className={"switch-face " + (value ? "on" : "")}
          disabled={!running || !w.binding?.writable}
          onClick={() => onWrite(!value)}
        >
          {value ? "ON" : "OFF"}
        </button>
      ) : w.kind === "button" ? (
        <button
          className="push-face"
          disabled={!running || !w.binding?.writable}
          onClick={() => onWrite(!value)}
        >
          Toggle
        </button>
      ) : w.kind === "slider" ? (
        <>
          <input
            aria-label={w.title}
            type="range"
            min={min}
            max={max}
            value={draft}
            disabled={!running || !w.binding?.writable}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => onWrite(draft)}
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(e.key)
              )
                onWrite(draft);
            }}
          />
          <output>
            {display} {w.binding?.units}
          </output>
        </>
      ) : w.kind === "linear" || w.kind === "thermometer" ? (
        <>
          <div className="linear-track">
            <div style={{ width: p * 100 + "%" }} />
          </div>
          <output>
            {display} {w.binding?.units}
          </output>
        </>
      ) : (
        <output className="numeric-face">
          {display}
          <small>{w.binding?.units}</small>
        </output>
      )}
      <div className="binding-label">{w.binding?.symbolPath ?? "Unbound"}</div>
    </div>
  );
}
