import type { Widget } from "./model";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PressController } from "./PressController";
import { instrumentPalette } from "./colors";
export function Instrument({
  w,
  value,
  onWrite,
  running,
  thumbnail = false,
  sessionEpoch = 0,
}: {
  w: Widget;
  value: number | boolean;
  onWrite: (
    value: number | boolean,
    safetyRelease?: boolean,
    finalRelease?: boolean,
  ) => void;
  sessionEpoch?: number;
  running: boolean;
  thumbnail?: boolean;
}) {
  const palette = instrumentPalette(w.settings, w.kind),
    id = "instrument-" + w.id;
  const min = w.settings.min ?? 0,
    max = w.settings.max ?? 100;
  const resolved =
    !!w.binding &&
    value !== undefined &&
    (typeof value === "boolean" || Number.isFinite(value));
  const preview = !running && !resolved;
  const actual = preview
    ? ["led", "switch", "button"].includes(w.kind)
      ? true
      : min + (max - min) * 0.58
    : resolved
      ? value
      : 0;
  const p = Math.max(0, Math.min(1, (Number(actual) - min) / (max - min)));
  const display =
    running && !resolved
      ? "—"
      : Number(actual).toFixed(w.settings.precision ?? 0);
  const units =
    w.binding?.units ?? (preview && w.kind === "thermometer" ? "°C" : "");
  const canWrite = running && resolved && !!w.binding?.writable;
  const writeRef = useRef(onWrite);
  writeRef.current = onWrite;
  const press = useRef<PressController | null>(null);
  if (!press.current)
    press.current = new PressController((v, safety, final) =>
      writeRef.current(v, safety, final),
    );
  const buttonMode = w.settings.buttonMode ?? "toggle";
  const validity = useRef({ canWrite, sessionEpoch, id: w.id });
  validity.current = { canWrite, sessionEpoch, id: w.id };
  useEffect(() => {
    press.current?.cancel();
    return () => {
      if (
        validity.current.canWrite &&
        validity.current.sessionEpoch === sessionEpoch &&
        validity.current.id === w.id
      )
        press.current?.release();
      else press.current?.cancel();
    };
  }, [canWrite, sessionEpoch, w.id, buttonMode]);
  useEffect(() => {
    const release = () => {
      if (canWrite) press.current?.release();
      else press.current?.cancel();
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [canWrite]);
  const [draft, setDraft] = useState(Number(actual));
  useEffect(() => setDraft(Number(actual)), [actual, running]);
  const style = {
    "--instrument-color": palette.color,
    "--instrument-light": palette.light,
    "--instrument-dark": palette.dark,
    "--instrument-pale": palette.pale,
    "--instrument-ink": palette.ink,
    "--instrument-button-ink": palette.buttonInk,
  } as CSSProperties;
  const status = preview
    ? w.binding
      ? "Design preview • unresolved binding"
      : "Design preview • unbound"
    : !resolved
      ? "Unresolved • no reading"
      : running
        ? "Simulated reading"
        : "Stopped • simulated";
  const number = (n: number) =>
    Number(n.toFixed(Math.abs(max - min) < 10 ? 1 : 0)).toLocaleString();
  const defs = (
    <defs>
      <linearGradient id={id + "-metal"} x2="0" y2="1">
        <stop stopColor="#eef3f5" />
        <stop offset=".3" stopColor="#9baab3" />
        <stop offset=".55" stopColor="#eef1f3" />
        <stop offset="1" stopColor="#627680" />
      </linearGradient>
      <radialGradient id={id + "-glass"} cx="35%" cy="25%">
        <stop stopColor="#fff" />
        <stop offset=".85" stopColor="#f3f5f2" />
        <stop offset="1" stopColor="#d5dee1" />
      </radialGradient>
      <linearGradient id={id + "-accent"} x2="0" y2="1">
        <stop stopColor={palette.light} />
        <stop offset=".5" stopColor={palette.color} />
        <stop offset="1" stopColor={palette.dark} />
      </linearGradient>
    </defs>
  );
  const metal = "url(#" + id + "-metal)",
    accent = "url(#" + id + "-accent)";
  const label = `${w.title}: ${display} ${units}. ${status}`;
  function svg(
    content: React.ReactNode,
    viewBox = "0 0 220 150",
    className = "instrument-face",
  ) {
    return (
      <svg
        className={className}
        viewBox={viewBox}
        role="img"
        aria-label={label}
      >
        {defs}
        {content}
      </svg>
    );
  }
  function rocker() {
    return svg(
      <>
        <rect
          x="66"
          y="14"
          width="88"
          height="107"
          rx="11"
          fill={metal}
          stroke="#647983"
          strokeWidth="2"
        />
        <rect x="73" y="21" width="74" height="93" rx="8" fill="#263a44" />
        <path
          d={actual ? "M78 24H142L145 105H75Z" : "M75 27H145L142 110H78Z"}
          fill={(actual && resolved) || preview ? palette.color : "#596a71"}
          stroke="#1f343e"
        />
        <path
          d={actual ? "M79 25H141V45H79Z" : "M77 28H143V44H77Z"}
          fill="#ffffff40"
        />
        <line x1="87" y1="70" x2="134" y2="70" stroke="#ffffff30" />
        <text
          x="110"
          y="53"
          textAnchor="middle"
          fontSize="17"
          fontWeight="bold"
          fill={actual ? palette.buttonInk : "#ffffff"}
        >
          {actual ? "I" : "O"}
        </text>
        <circle
          cx="110"
          cy="91"
          r="6"
          fill={actual ? palette.pale : "#29383e"}
          stroke="#afbec5"
        />
        <text x="110" y="142" textAnchor="middle" fontSize="13" fill="#415962">
          {running && !resolved ? "—" : actual ? "ON" : "OFF"}
        </text>
      </>,
    );
  }
  function push() {
    return svg(
      <>
        <circle
          cx="110"
          cy="70"
          r="51"
          fill={metal}
          stroke="#607781"
          strokeWidth="2"
        />
        <circle cx="110" cy="70" r="43" fill={palette.dark} stroke="#293e48" />
        <circle cx="110" cy="67" r="38" fill={palette.color} />
        <ellipse cx="103" cy="45" rx="24" ry="12" fill="#ffffff40" />
        <text
          x="110"
          y="75"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill={palette.buttonInk}
        >
          {buttonMode === "toggle"
            ? "Toggle"
            : buttonMode === "repeat"
              ? "Repeat"
              : "Hold"}
        </text>
        <text x="110" y="139" textAnchor="middle" fontSize="11" fill="#526974">
          {buttonMode === "toggle"
            ? "TOGGLE CONTROL"
            : buttonMode === "repeat"
              ? "REPEAT WHILE HELD"
              : "MOMENTARY CONTROL"}
        </text>
      </>,
    );
  }
  function sliderFace() {
    return svg(
      <>
        <rect
          x="15"
          y="50"
          width="190"
          height="26"
          rx="5"
          fill={metal}
          stroke="#8a9da7"
        />
        <rect x="22" y="58" width="176" height="10" rx="4" fill="#a9b5bc" />
        <rect
          x="22"
          y="58"
          width={176 * p}
          height="10"
          rx="4"
          fill={palette.color}
        />
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line
              x1={22 + i * 17.6}
              x2={22 + i * 17.6}
              y1="88"
              y2={i % 5 === 0 ? 100 : 94}
              stroke="#607780"
            />
            {i % 5 === 0 && (
              <text
                x={22 + i * 17.6}
                y="115"
                textAnchor="middle"
                fontSize="11"
                fill="#425d68"
              >
                {number(min + ((max - min) * i) / 10)}
              </text>
            )}
          </g>
        ))}
        {thumbnail && (
          <rect
            x={15 + p * 176}
            y="42"
            width="15"
            height="41"
            rx="3"
            fill={metal}
            stroke="#57717f"
          />
        )}
        <text
          x="110"
          y="140"
          textAnchor="middle"
          fontFamily="Consolas,monospace"
          fontSize="15"
          fill={palette.ink}
        >
          {display} {units}
        </text>
      </>,
    );
  }
  let face;
  if (w.kind === "radial") {
    const a = ((-135 + p * 270) * Math.PI) / 180;
    face = svg(
      <>
        <circle
          cx="120"
          cy="101"
          r="94"
          fill={metal}
          stroke="#6b818b"
          strokeWidth="2"
        />
        <circle
          cx="120"
          cy="101"
          r="86"
          fill={"url(#" + id + "-glass)"}
          stroke="#73868e"
        />
        <path
          d="M65 156A78 78 0 1 1 175 156"
          fill="none"
          stroke={palette.color}
          strokeWidth="7"
        />
        {Array.from({ length: 21 }, (_, i) => {
          const t = ((-135 + i * 13.5) * Math.PI) / 180;
          return (
            <g key={i}>
              <line
                x1={120 + Math.sin(t) * (i % 2 === 0 ? 65 : 69)}
                y1={101 - Math.cos(t) * (i % 2 === 0 ? 65 : 69)}
                x2={120 + Math.sin(t) * 76}
                y2={101 - Math.cos(t) * 76}
                stroke="#405860"
                strokeWidth={i % 2 === 0 ? 1.8 : 1}
              />
              {i % 4 === 0 && (
                <text
                  x={120 + Math.sin(t) * 53}
                  y={105 - Math.cos(t) * 53}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#314953"
                >
                  {number(min + ((max - min) * i) / 20)}
                </text>
              )}
            </g>
          );
        })}
        <path
          d="M57 64A73 73 0 0 1 151 37"
          fill="none"
          stroke="#fff"
          strokeWidth="9"
          opacity=".5"
        />
        {!(running && !resolved) && (
          <>
            <line
              x1={120 - Math.sin(a) * 13}
              y1={101 + Math.cos(a) * 13}
              x2={120 + Math.sin(a) * 63}
              y2={101 - Math.cos(a) * 63}
              stroke={palette.needle}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="120" cy="101" r="7" fill={metal} stroke="#536e7a" />
          </>
        )}
        <rect
          x="80"
          y="140"
          width="80"
          height="28"
          rx="3"
          fill={palette.pale}
          stroke={palette.dark}
        />
        <text
          x="120"
          y="159"
          textAnchor="middle"
          fontSize="17"
          fontFamily="Consolas,monospace"
          fill={palette.ink}
        >
          {display}
        </text>
        <text x="120" y="184" textAnchor="middle" fontSize="12" fill="#425b65">
          {units || "VALUE"}
        </text>
      </>,
      "0 0 240 202",
    );
  } else if (w.kind === "thermometer") {
    face = svg(
      <>
        <rect
          x="35"
          y="12"
          width="92"
          height="190"
          rx="12"
          fill={"url(#" + id + "-glass)"}
          stroke="#96aab3"
        />
        <path
          d="M60 147V34A13 13 0 0 1 86 34V147A24 24 0 1 1 60 147Z"
          fill={metal}
          stroke="#5d7782"
        />
        <path
          d="M66 154V35A7 7 0 0 1 80 35V154A18 18 0 1 1 66 154Z"
          fill="#e8eeef"
        />
        <rect
          x="68"
          y={143 - 107 * p}
          width="10"
          height={17 + 107 * p}
          rx="4"
          fill={accent}
        />
        <circle cx="73" cy="166" r="16" fill={accent} />
        <path d="M69 40V141" stroke="#fff" strokeWidth="2" opacity=".65" />
        {Array.from({ length: 15 }, (_, i) => (
          <g key={i}>
            <line
              x1="89"
              x2={i % 2 === 0 ? 100 : 95}
              y1={143 - (i * 107) / 14}
              y2={143 - (i * 107) / 14}
              stroke="#506d7a"
            />
            {i % 2 === 0 && (
              <text
                x="104"
                y={147 - (i * 107) / 14}
                fontSize="9"
                fill="#395362"
              >
                {number(min + ((max - min) * i) / 14)}
              </text>
            )}
          </g>
        ))}
        <text
          x="80"
          y="221"
          textAnchor="middle"
          fontSize="17"
          fontFamily="Consolas,monospace"
          fill={palette.ink}
        >
          {display} {units}
        </text>
      </>,
      "0 0 160 230",
      "instrument-face thermometer-face",
    );
  } else if (w.kind === "linear") {
    face = svg(
      <>
        <rect
          x="12"
          y="32"
          width="196"
          height="41"
          rx="4"
          fill={metal}
          stroke="#758e9a"
        />
        <rect x="20" y="40" width="180" height="25" rx="2" fill="#d7e0e5" />
        <rect x="20" y="40" width={180 * p} height="25" fill={accent} />
        <path d="M20 41H200V49H20Z" fill="#ffffff45" />
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line
              x1={20 + i * 18}
              x2={20 + i * 18}
              y1="78"
              y2={i % 2 === 0 ? 88 : 84}
              stroke="#5c7987"
            />
            {i % 2 === 0 && (
              <text
                x={20 + i * 18}
                y="101"
                textAnchor="middle"
                fontSize="10"
                fill="#3b5968"
              >
                {number(min + ((max - min) * i) / 10)}
              </text>
            )}
          </g>
        ))}
        <text
          x="110"
          y="130"
          textAnchor="middle"
          fontSize="20"
          fontFamily="Consolas,monospace"
          fill={palette.ink}
        >
          {display} {units}
        </text>
      </>,
    );
  } else if (w.kind === "numeric") {
    face = svg(
      <>
        <rect
          x="10"
          y="25"
          width="200"
          height="90"
          rx="7"
          fill={metal}
          stroke="#637b87"
        />
        <rect
          x="18"
          y="33"
          width="184"
          height="74"
          rx="4"
          fill={palette.dark}
        />
        <rect x="24" y="39" width="172" height="62" rx="2" fill="#f2f3ed" />
        <path d="M26 41H194V59H26Z" fill="#ffffff50" />
        <text
          x="184"
          y="80"
          textAnchor="end"
          fontSize="35"
          fontFamily="Consolas,monospace"
          fill={palette.ink}
          textLength={Math.min(150, display.length * 20)}
          lengthAdjust="spacingAndGlyphs"
        >
          {display}
        </text>
        <text x="186" y="95" textAnchor="end" fontSize="10" fill={palette.ink}>
          {units}
        </text>
        <circle cx="18" cy="70" r="2" fill="#405b68" />
        <circle cx="202" cy="70" r="2" fill="#405b68" />
      </>,
    );
  } else if (w.kind === "led") {
    face = svg(
      <>
        <circle cx="110" cy="63" r="41" fill={metal} stroke="#6c838e" />
        <circle
          cx="110"
          cy="63"
          r="34"
          fill={actual && (resolved || preview) ? accent : "#42515a"}
          stroke="#334852"
        />
        <ellipse cx="102" cy="49" rx="20" ry="10" fill="#ffffff60" />
        <circle
          cx="119"
          cy="76"
          r="14"
          fill={actual && (resolved || preview) ? palette.light : "#5d6a70"}
          opacity=".35"
        />
        <text
          x="110"
          y="125"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill="#425d6a"
        >
          {running && !resolved ? "—" : actual ? "ON" : "OFF"}
        </text>
      </>,
      "0 0 220 150",
      "led-face " + (actual ? "lit" : ""),
    );
  } else if (w.kind === "switch") {
    face = thumbnail ? (
      rocker()
    ) : (
      <button
        className="physical-control rocker-control"
        disabled={!canWrite}
        aria-label={w.title}
        aria-pressed={Boolean(actual)}
        onClick={() => onWrite(!value)}
      >
        {rocker()}
      </button>
    );
  } else if (w.kind === "button") {
    face = thumbnail ? (
      push()
    ) : (
      <button
        className="physical-control push-control"
        disabled={!canWrite}
        aria-label={w.title}
        onClick={() => {
          if (buttonMode === "toggle") onWrite(!value);
        }}
        onPointerDown={(e) => {
          if (buttonMode === "toggle" || !canWrite) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          press.current?.begin(buttonMode, w.settings.repeatMs ?? 500);
        }}
        onPointerUp={() => press.current?.release()}
        onPointerCancel={() => press.current?.release()}
        onLostPointerCapture={() => press.current?.release()}
        onBlur={() => press.current?.release()}
        onKeyDown={(e) => {
          if (
            buttonMode !== "toggle" &&
            canWrite &&
            [" ", "Enter"].includes(e.key)
          ) {
            e.preventDefault();
            if (!e.repeat)
              press.current?.begin(buttonMode, w.settings.repeatMs ?? 500);
          }
        }}
        onKeyUp={(e) => {
          if (buttonMode !== "toggle" && [" ", "Enter"].includes(e.key)) {
            e.preventDefault();
            press.current?.release();
          }
        }}
      >
        {push()}
      </button>
    );
  } else {
    face = thumbnail ? (
      sliderFace()
    ) : (
      <div className="slider-panel">
        {sliderFace()}
        <input
          className="slider-input"
          aria-label={w.title}
          type="range"
          min={min}
          max={max}
          value={Number.isFinite(draft) ? draft : min}
          disabled={!canWrite}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={() => {
            if (canWrite) onWrite(draft);
          }}
          onKeyUp={(e) => {
            if (
              canWrite &&
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
      </div>
    );
  }
  return (
    <div
      className={
        "instrument " + w.kind + (thumbnail ? " instrument-thumbnail" : "")
      }
      style={style}
    >
      {!thumbnail && <div className="instrument-title">{w.title}</div>}
      {face}
      {!thumbnail && (
        <div
          className={
            "binding-label " +
            (preview ? "preview-label" : !resolved ? "unresolved-label" : "")
          }
          title={status}
        >
          {preview ? status : !resolved ? status : w.binding?.symbolPath}
          {!preview && resolved && (
            <span className="reading-mode">
              {" "}
              • {running ? "simulated" : "stopped"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
