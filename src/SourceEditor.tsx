import { useState, useEffect, useRef } from "react";
import type { Source, OfflineVariable } from "./model";
const variable = (id: string): OfflineVariable => ({
  id,
  type: "number",
  units: "",
  initial: 0,
  min: 0,
  max: 100,
  writable: true,
  waveform: "constant",
  periodMs: 2000,
});
export function SourceEditor({
  sources,
  onApply,
  onCancel,
}: {
  sources: Source[];
  onApply: (sources: Source[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(sources));
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>("input,button")?.focus();
  }, []);
  function patchSource(index: number, patch: Partial<Source>) {
    setDraft((s) => s.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
  function patchVariable(
    index: number,
    vi: number,
    patch: Partial<OfflineVariable>,
  ) {
    const source = draft[index];
    patchSource(index, {
      variables: source.variables!.map((v, i) =>
        i === vi ? { ...v, ...patch } : v,
      ),
    });
  }
  return (
    <div className="modal-backdrop">
      <form
        ref={form}
        className="project-dialog source-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Configure offline data sources"
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const items = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              "input:not(:disabled),select:not(:disabled),button:not(:disabled)",
            ),
          ];
          if (!items.length) return;
          const first = items[0],
            last = items.at(-1)!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(draft);
          } catch (error) {
            setError(String(error));
          }
        }}
      >
        <h2>Offline data sources</h2>
        <p>
          Define typed variables for your instruments. Generated waveforms are
          read-only; constant variables allow manual writes during Run. No
          device connection is created.
        </p>
        <div className="source-list">
          {draft.map((s, si) => (
            <section key={si}>
              <header>
                <label>
                  Source ID
                  <input
                    aria-label={"Source " + (si + 1) + " ID"}
                    value={s.id}
                    disabled={s.provider !== "offline"}
                    onChange={(e) => patchSource(si, { id: e.target.value })}
                  />
                </label>
                <strong>{s.provider}</strong>
                <button
                  type="button"
                  onClick={() => setDraft(draft.filter((_, i) => i !== si))}
                >
                  Remove source
                </button>
              </header>
              {s.provider === "offline" ? (
                <>
                  <div className="variable-list">
                    {s.variables?.map((v, vi) => (
                      <fieldset key={vi}>
                        <legend>Variable {vi + 1}</legend>
                        <label>
                          Name / ID
                          <input
                            aria-label={`Source ${si + 1} variable ${vi + 1} ID`}
                            value={v.id}
                            maxLength={80}
                            onChange={(e) =>
                              patchVariable(si, vi, { id: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Type
                          <select
                            value={v.type}
                            onChange={(e) =>
                              patchVariable(
                                si,
                                vi,
                                e.target.value === "boolean"
                                  ? {
                                      type: "boolean",
                                      initial: false,
                                      min: 0,
                                      max: 1,
                                      waveform: "constant",
                                      units: "",
                                    }
                                  : {
                                      type: "number",
                                      initial: 0,
                                      min: 0,
                                      max: 100,
                                      waveform: "constant",
                                    },
                              )
                            }
                          >
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </label>
                        <label>
                          Waveform
                          <select
                            value={v.waveform}
                            onChange={(e) =>
                              patchVariable(si, vi, {
                                waveform: e.target
                                  .value as OfflineVariable["waveform"],
                                writable:
                                  e.target.value === "constant"
                                    ? v.writable
                                    : false,
                              })
                            }
                          >
                            <option value="constant">Constant / manual</option>
                            {v.type === "number" ? (
                              <>
                                <option value="sine">Sine</option>
                                <option value="ramp">Ramp</option>
                              </>
                            ) : (
                              <option value="toggle">Toggle</option>
                            )}
                          </select>
                        </label>
                        <label>
                          Initial value
                          {v.type === "boolean" ? (
                            <select
                              value={String(v.initial)}
                              onChange={(e) =>
                                patchVariable(si, vi, {
                                  initial: e.target.value === "true",
                                })
                              }
                            >
                              <option value="false">False</option>
                              <option value="true">True</option>
                            </select>
                          ) : (
                            <input
                              type="number"
                              value={Number(v.initial)}
                              onChange={(e) =>
                                patchVariable(si, vi, {
                                  initial: Number(e.target.value),
                                })
                              }
                            />
                          )}
                        </label>
                        {v.type === "number" && (
                          <>
                            {(["min", "max"] as const).map((key) => (
                              <label key={key}>
                                {key}
                                <input
                                  type="number"
                                  value={v[key]}
                                  onChange={(e) =>
                                    patchVariable(si, vi, {
                                      [key]: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                            ))}
                            <label>
                              Units
                              <input
                                value={v.units}
                                maxLength={40}
                                onChange={(e) =>
                                  patchVariable(si, vi, {
                                    units: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label>
                          Waveform cycle (ms)
                          <input
                            type="number"
                            min={100}
                            max={3600000}
                            value={v.periodMs}
                            onChange={(e) =>
                              patchVariable(si, vi, {
                                periodMs: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={v.writable}
                            disabled={v.waveform !== "constant"}
                            onChange={(e) =>
                              patchVariable(si, vi, {
                                writable: e.target.checked,
                              })
                            }
                          />
                          Allow manual writes
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            patchSource(si, {
                              variables: s.variables!.filter(
                                (_, i) => i !== vi,
                              ),
                            })
                          }
                        >
                          Remove variable
                        </button>
                      </fieldset>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchSource(si, {
                        variables: [
                          ...(s.variables ?? []),
                          variable(
                            "variable" + ((s.variables?.length ?? 0) + 1),
                          ),
                        ],
                      })
                    }
                  >
                    Add variable
                  </button>
                </>
              ) : (
                <p>
                  Legacy source configuration is preserved; only offline sources
                  are editable here.
                </p>
              )}
            </section>
          ))}
        </div>
        <button
          type="button"
          disabled={draft.length >= 8}
          onClick={() =>
            setDraft([
              ...draft,
              {
                id: "source" + (draft.length + 1),
                provider: "offline",
                path: "inline",
                variables: [variable("value")],
              },
            ])
          }
        >
          Add offline source
        </button>
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
        <p>
          Up to 8 sources and 128 variables. Apply validates all bindings;
          unbind an instrument before removing its referenced variable.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Apply sources</button>
        </div>
      </form>
    </div>
  );
}
