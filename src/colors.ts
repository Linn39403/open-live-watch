import type { Kind, Widget } from "./model";
export const GREEN_COLOR = "#72a054";
export const DEFAULT_NEEDLE_COLOR = "#b52b25";
export const DEFAULT_COLORS: Readonly<Record<Kind, string>> = {
  radial: "#327fbd",
  linear: "#327fbd",
  slider: "#327fbd",
  numeric: "#268e94",
  led: "#da8426",
  button: "#da8426",
  switch: "#597a92",
  thermometer: "#bf443d",
};
export const defaultInstrumentColor = (kind: Kind) => DEFAULT_COLORS[kind];
export function resetInstrumentColors(settings: Widget["settings"]) {
  const { color, needleColor, ...rest } = settings;
  return rest;
}
export const colorPresets = [
  { name: "Green", color: GREEN_COLOR },
  { name: "Blue", color: "#327fbd" },
  { name: "Orange", color: "#da8426" },
  { name: "Red", color: "#bf443d" },
  { name: "Purple", color: "#8758b0" },
  { name: "Teal", color: "#268e94" },
  { name: "Slate blue", color: "#597a92" },
];
export const isHexColor = (color: string) =>
  color.length === 7 && /^#[0-9a-f]{6}$/i.test(color);
const safeColor = (color: string | undefined, fallback: string) =>
  isHexColor(color ?? "") ? color! : fallback;
function blend(color: string, target: number, amount: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) +
            target * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function instrumentPalette(
  settings: { color?: string; needleColor?: string },
  kind: Kind,
) {
  const color = safeColor(settings.color, defaultInstrumentColor(kind));
  const channels = [1, 3, 5]
    .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return {
    color,
    light: blend(color, 255, 0.45),
    dark: blend(color, 0, 0.4),
    pale: blend(color, 255, 0.88),
    ink: blend(color, 0, 0.72),
    buttonInk: luminance > 0.179 ? "#000000" : "#ffffff",
    needle: safeColor(settings.needleColor, DEFAULT_NEEDLE_COLOR),
  };
}
