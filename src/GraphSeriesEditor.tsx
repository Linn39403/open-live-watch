import type { Widget, GraphConfig, Source } from "./model";
import { BindingEditor } from "./BindingEditor";
import { ColorControl } from "./ColorControl";
import { catalogFor } from "./provider";
export function GraphSeriesEditor({
  widget,
  sources,
  disabled,
  onChange,
}: {
  widget: Widget;
  sources: Source[];
  disabled: boolean;
  onChange: (graph: GraphConfig) => void;
}) {
  const graph: GraphConfig = {
      mode: "time",
      capacity: 200,
      windowMs: 10000,
      ...widget.settings.graph,
    },
    series = graph.series ?? [];
  const update = (index: number, patch: Partial<(typeof series)[number]>) =>
    onChange({
      ...graph,
      series: series.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  return (
    <fieldset disabled={disabled}>
      <legend>Graph series • up to 8</legend>
      <label>
        Primary series name
        <input
          aria-label="Primary graph series name"
          maxLength={64}
          value={graph.primaryName ?? "Y"}
          onChange={(e) => {
            if (e.target.value.trim())
              onChange({ ...graph, primaryName: e.target.value });
          }}
        />
      </label>
      {series.map((s, i) => (
        <div className="series-editor" key={s.id}>
          <label>
            Series {i + 2} name
            <input
              aria-label={`Graph series ${i + 2} name`}
              maxLength={64}
              value={s.name}
              onChange={(e) => {
                if (e.target.value.trim()) update(i, { name: e.target.value });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.visible}
              onChange={(e) => update(i, { visible: e.target.checked })}
            />
            Visible {s.name}
          </label>
          <ColorControl
            key={widget.id + "-" + s.id}
            label={s.name + " series color"}
            value={s.color}
            onCommit={(color) => update(i, { color })}
          />
          <BindingEditor
            label={s.name + " Y"}
            kind="graph"
            sources={sources}
            binding={s.binding}
            disabled={disabled}
            onChange={(binding) => update(i, { binding })}
          />
          <button
            onClick={() =>
              onChange({ ...graph, series: series.filter((_, j) => i !== j) })
            }
          >
            Remove {s.name}
          </button>
        </div>
      ))}
      <button
        disabled={series.length >= 7}
        onClick={() => {
          const symbol = catalogFor(sources).find((c) => c.type === "number");
          onChange({
            ...graph,
            series: [
              ...series,
              {
                id: crypto.randomUUID(),
                name: `Series ${series.length + 2}`,
                visible: true,
                color: [
                  "#da8426",
                  "#854fbd",
                  "#b83b35",
                  "#287fa0",
                  "#687b93",
                  "#497f43",
                  "#996844",
                ][series.length],
                ...(symbol
                  ? {
                      binding: {
                        sourceId: symbol.sourceId,
                        symbolPath: symbol.symbolPath,
                        gain: 1,
                        offset: 0,
                        units: symbol.units,
                        periodMs: 50,
                        writable: false,
                      },
                    }
                  : {}),
              },
            ],
          });
        }}
      >
        Add Y series
      </button>
      <p>
        All visible series share the X axis. Named traces and dash patterns
        supplement color; differing units are explicitly labeled.
      </p>
    </fieldset>
  );
}
