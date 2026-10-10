# Provider and GUI data contract v1

Status: bounded configurable offline-source and one-series 2D-graph implementation built and independently reviewed. See docs/16-offline-run-guide.md for automated, browser and native verification evidence. Device adapters remain future work. This contract is original; it is not the Micrium protocol.

## One data interface for every element

GUI elements resolve source-qualified variable identifiers (`sourceId`, `symbolPath`) through a catalog. Gauges, readouts, indicators and controls consume the same typed samples as graphs. An element never opens a transport or reads an arbitrary memory address itself. Provider adapters translate their transport into this interface. The offline provider implements it first; debug adapters and the device service described in docs/06-target-protocol.md are future adapters, with no hardware connection in this milestone.

The main application owns one project session. Only its worker generates samples. Floating inspectors share this session and cannot create a second provider. Project replacement and changes to a catalog invalidate earlier commands and frames. Opening a project validates declarative configuration; it does not execute code or connect a device.

## Persisted offline configuration

Provider `offline` defines inline variables. Each variable has a stable ID/name, number or boolean type, units, numeric limits, initial value, writable intent, a declarative waveform (`constant`, `sine`, `ramp`, or `toggle`) and waveform period in milliseconds. The exact serialized schema is `schemas/workspace.schema.json`; its executable field names take precedence over prose. Constant/manual variables may permit writes. Generated waveforms are read-only. Numeric sine/ramp ranges remain within declared limits; boolean toggle is never coerced into a numeric signal. Initial values are project configuration, whereas runtime control writes are session state.

Use finite bounded values and periods; reject duplicate source/variable identifiers, mismatched values/types, incompatible waveforms, invalid ranges, unsupported provider configurations and dangling bindings. Cap at eight sources and 128 configured variables in total. Legacy Motor lab projects must remain loadable. Custom colors and source-free projects retain their existing contracts.

A scalar binding defines source ID, variable path, gain, offset, units, requested update interval and writable intent. Numeric display value is `raw * gain + offset`; numeric writes invert this mapping and reject zero gain or values outside source limits. Boolean bindings require boolean signals and identity mapping. Catalog permission is authoritative; an element's writable flag cannot grant permission. Properties also configure display limits and precision separately from provider limits.

The waveform period and the requested display update interval are distinct settings. The offline engine operates at a 50 ms base tick; requested faster updates are visibly clamped to this limit. Each element/graph must honor its effective update interval rather than presenting an ignored configuration field.

## Runtime protocol

Messages carry `protocolVersion: 1` and a `kind` discriminator. Validate message structure and semantics at receiving boundaries; TypeScript declarations alone are insufficient. Unknown versions, invalid numbers, excessive arrays and malformed discriminators are rejected. Runtime integer counters are nonnegative safe integers.

All messages identify `epoch` and `catalogRevision`. An epoch identifies a runtime project session. A catalog revision identifies the variables and their types/permissions. A separate `commandRevision` prevents a delayed worker frame from undoing an acknowledged control write. Sequence numbers are monotonic within the current session/revision.

- `configure`: the validated sources, current running state and command revision. Reconfiguration publishes the associated catalog and resets incompatible runtime history. Stop disables acquisition and writes.
- `catalog`: source-qualified entries with variable path/type/units/limits/access. Lookup is by the full pair, so equal variable names in different sources do not collide.
- `sampleBatch`: command revision, sequence, `timeMs`, and typed samples containing source ID, variable path, value, quality and optional reason. All samples in one batch share a simulation timestamp and coherent sequence. `timeMs` is elapsed simulation time, explicitly not wall-clock or proven target time.
- `write`: operation ID, command revision, source-qualified variable, typed raw value. The authority resolves access and checks Run mode, current epoch/catalog, expected type, finite value and range. Writes are never replayed after project changes.
- `writeResult`: operation ID and status `acknowledged`, `rejected`, or `unknown`, with a reason where appropriate. Unknown means the effect could not be established; it never triggers an automatic retry. The offline provider normally produces acknowledged/rejected results. Future transports must preserve this distinction.

Good quality is required for a usable reading. Unresolved, stale, unsupported or failed data cannot silently become zero, false or a plausible preview value. Layout previews are explicitly labeled and never enter acquired graph history. Stopped readings remain visibly stopped. Boundaries reject stale epoch/catalog/command revisions, duplicate/reversed sequences and timestamps that move backward.

## 2D graph element

A graph is a designer object with the same move/resize/rotation, undo, color and save/reopen behavior as other elements. The graph uses a primary Y binding plus up to seven additional named/color/visibility-controlled numeric Y bindings, sharing X in XY mode. Time-series mode plots elapsed simulation time on X and a numeric Y binding. XY mode selects a numeric X binding and a numeric Y binding, paired from the same coherent frame. It must not combine independently stale samples or convert boolean values to numbers.

Show axes, labels/units and series color. Apply the bindings' gain/offset transformations consistently. Preserve optional manual axis ranges and sampling configuration in the project schema; if automatic axes are used, label that behavior. Keep a bounded history of at most 600 frames/points in the implemented offline milestone. Stop retains the captured view; a new session/catalog clears incompatible history. Missing/bad-quality samples produce a gap or explicit no-data state, never a connecting segment across invalid values. Avoid drawing a line from a new session back to the previous session.

This is an offline plot, not target-triggered oscilloscope acquisition, continuous durable logging or proof of device timing. Exported data must identify its simulated timing/quality honestly.

## Device wire protocol bridge

The binary OLW1 framing/opcodes in docs/06-target-protocol.md remain a draft for a later milestone. An adapter will negotiate device identity and capabilities, resolve symbols, publish a catalog, translate reads/scope frames to typed sample batches, and translate writes/results with current epoch and catalog checks. The GUI binds to catalog identities, not wire opcodes or addresses. The legacy host timestamp integer/string contracts remain relevant when a real adapter provides nanosecond timestamps; this bounded offline protocol uses safe integer simulation milliseconds.

Do not claim that a serial/TCP server, firmware codec, ELF resolver or memory-access provider exists merely because the GUI interface is defined. Freeze wire byte vectors and perform actual hardware validation when that separate implementation begins.

## Acceptance evidence required

A new blank project must let a user define a numeric waveform and a writable manual variable, bind a gauge and a control, configure time and XY graphs, Run/Stop, and save/reopen all settings. Tests cover namespace collisions, type/range/write rejection, stale frames/results, version/schema failures, waveform bounds, inverse mapping, effective refresh intervals, graph coherent pairing/gaps/bounds and legacy workspace loading. Record automated checks, independent review and Windows native GUI observations separately from other-platform CI and runtime evidence.

## Implemented bounds and mapping

`src/provider.ts` implements the validated v1 envelope/catalog/binding boundary and source-qualified identities; `src/engine.ts` implements the pure worker provider, used by `src/simulator.worker.ts`. The main window sends configure/write commands and accepts correlated catalog/sample/write-result events. Runtime write acknowledgement is distinct from saved initial configuration. `src/Graph.tsx` consumes coherent timestamped frames, including quality gaps and both X/Y transforms. Sources and graph settings persist in the shared workspace schema; Rust performs matching native load/save validation.

The implemented graph retains 600 global frames, uses default capacity 200 and allows 10–600 points, with at most 30,000 ms visible history. Effective refresh is rounded upward to the 50 ms acquisition cadence. Waveform cycles are 100–3,600,000 ms and configured numeric values/ranges are bounded to ±10¹². X axes auto-scale; optional manual Y limits use widget Display scale. Writes use canonical `epoch:counter` IDs with a monotonic consumed-counter high-water mark and one pending operation; there is no128-operation Run cap. Unknown results invalidate the session without retry. Graphs support up to eight named Y series with bounded peak-preserving reduction. Native continuous CSV recording consumes accepted frames before reduction, under ADR22 bounds. No hardware, external network transport or target-triggered capture is implemented.

Windows native acceptance: custom-source graph/control/gauge Run/Stop, native Save As and reopen passed; see [focused review and GUI evidence](reviews/offline-milestone.md). The offline subset is implemented and reviewed. Device transport remains future work.
