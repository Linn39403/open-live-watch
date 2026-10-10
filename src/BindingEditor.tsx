import type { Binding, Kind } from "./model";
import {
  catalogFor,
  compatibleSymbol,
  qualifiedKey,
  effectiveRefreshMs,
} from "./provider";
import type { Source } from "./model";
export function BindingEditor({
  label = "Binding",
  binding,
  sources,
  kind,
  disabled,
  onChange,
}: {
  label?: string;
  binding?: Binding;
  sources: Source[];
  kind: Kind;
  disabled: boolean;
  onChange: (b: Binding | undefined) => void;
}) {
  const catalog = catalogFor(sources).filter((c) => compatibleSymbol(kind, c));
  const symbol = catalog.find(
    (c) =>
      c.sourceId === binding?.sourceId && c.symbolPath === binding.symbolPath,
  );
  return (
    <fieldset disabled={disabled} className="binding-editor">
      <legend>{label}</legend>
      <label>
        Source / variable
        <select
          aria-label={label + " variable"}
          value={
            binding ? qualifiedKey(binding.sourceId, binding.symbolPath) : ""
          }
          onChange={(e) => {
            const c = catalog.find(
              (c) => qualifiedKey(c.sourceId, c.symbolPath) === e.target.value,
            );
            onChange(
              c
                ? {
                    sourceId: c.sourceId,
                    symbolPath: c.symbolPath,
                    gain: 1,
                    offset: 0,
                    units: c.units,
                    periodMs: 50,
                    writable:
                      c.writable &&
                      ["slider", "switch", "button"].includes(kind),
                  }
                : undefined,
            );
          }}
        >
          <option value="">Unbound</option>
          {catalog.map((c) => (
            <option
              key={qualifiedKey(c.sourceId, c.symbolPath)}
              value={qualifiedKey(c.sourceId, c.symbolPath)}
            >
              {c.sourceId} / {c.symbolPath} ({c.type})
            </option>
          ))}
        </select>
      </label>
      {binding && (
        <>
          <label>
            Units
            <input
              aria-label={label + " units"}
              value={binding.units}
              onChange={(e) => onChange({ ...binding, units: e.target.value })}
            />
          </label>
          {(["gain", "offset", "periodMs"] as const).map((key) => (
            <label key={key}>
              {key === "periodMs" ? "Refresh interval (ms)" : key}
              <input
                aria-label={label + " " + key}
                type="number"
                min={key === "periodMs" ? 1 : undefined}
                max={key === "periodMs" ? 30000 : undefined}
                disabled={symbol?.type === "boolean" && key !== "periodMs"}
                value={binding[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (
                    Number.isFinite(n) &&
                    (key !== "periodMs" ||
                      (Number.isInteger(n) && n >= 1 && n <= 30000))
                  )
                    onChange({ ...binding, [key]: n });
                }}
              />
            </label>
          ))}
          <p>
            Effective refresh: {effectiveRefreshMs(binding.periodMs)} ms.
            Catalog access:{" "}
            {symbol?.writable ? "manual writes permitted" : "read-only"}.
          </p>
          {["slider", "switch", "button"].includes(kind) && (
            <label>
              <input
                type="checkbox"
                checked={binding.writable}
                disabled={!symbol?.writable}
                onChange={(e) =>
                  onChange({ ...binding, writable: e.target.checked })
                }
              />
              Allow control writes
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
