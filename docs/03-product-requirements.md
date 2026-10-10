# Product requirements

Revision: 2026-10-10. This is the product requirement baseline, including future requirements. A requirement listed here is not a completion claim. Current implementation, priorities and milestone gates are tracked in [the project plan](18-project-plan.md), with evidence in [the run guide](16-offline-run-guide.md) and [review report](reviews/offline-milestone.md).

## Owner requirements and current delivery scope

| ID | Required behavior | Acceptance boundary |
|---|---|---|
| R01 | Run on Windows, macOS and Linux with one portable project format | Actual install/launch/edit/save/runtime evidence on each declared platform; CI alone is insufficient |
| R02 | Use a light engineering editor organized similarly to µC/Probe | Ribbon, explorer/toolbox, white ruled canvas, symbol browser and inspector; independently authored artwork |
| R03 | Freely place and manipulate GUI elements like a visual GUI designer | Arbitrary position/overlap, move/resize/rotate, selection, undo and keyboard operation; complete advanced editing remains required |
| R04 | Create a new independent project without a mandatory motor demo | Named blank project, explicitly configured sources and bindings, save/reopen and unsaved-change protection |
| R05 | Give users independent natural and custom instrument colors | Per-element saved colors, original vector faces, readable values and state indications beyond color |
| R06 | Configure how a data source controls each element | Typed source-qualified variables, engineering mapping, units, rate, quality and authoritative access checks |
| R07 | Provide a freely placeable 2D graph | Time-series and coherent XY mode, configurable bindings/axes/color/history, bounded samples and quality gaps |
| R08 | Define one protocol/interface for providers and all elements | Versioned validated catalog/sample/write/result contract; future transports adapt to it |
| R09 | Deliver the first milestone without embedded-device integration | Configurable offline provider and optional motor example; opening a project never connects a device |
| R10 | Provide an open-source implementation with original assets and a coding-agent plan | Public MIT repository, architecture, contracts, milestones, tests and documented remaining gaps |

R01–R10 are mandatory owner requirements. R04–R08 have implemented offline slices; R01 and the complete R03 docking/editing scope remain open. Current graphs have one series. Generic logging, richer plotting and hardware support below are future requirements. Full roadmap M0/M1 acceptance remains open until its cross-platform and editor gates pass; the bounded Windows offline slice is already accepted.

## Primary workflow

First offline workflow: create a blank project, declare typed constant or waveform variables, insert instruments and graphs, configure each binding, Run/Stop, and save/reopen. Users control writable manual variables through bound controls. Generated signals are read-only. The motor simulator is an optional example, not the project model.

Later embedded workflow:

An embedded engineer opens an ELF or mock symbol source, finds `motor.speed`, drops a radial gauge on a screen, binds it, chooses a probe/target, and starts reading the running firmware. A slider bound to `motor.setpoint` changes only that validated variable after a deliberate input commit. A logger records values and acquisition times. Saving/reopening preserves the dashboard and symbolic binding, even if an ELF rebuild moves the variable.

## Scope and goals

Windows, macOS and Linux are equally required desktop platforms, sharing one portable application core and workspace format. Local/offline use must work without an account or cloud dependency. First deliverable: end-to-end simulator dashboard; second: real ELF and one tested Cortex-M debug transport. No mandatory RTOS, no mandatory target firmware for supported debug-memory polling. Target firmware is required for custom serial/network communication and deterministic scope capture.

Do not make legacy .wsp, CSF/CDF, µC/Probe wire protocol, vendor DLL, or script-language compatibility an MVP requirement. Add such compatibility only through separate documented parsers/adapters and licensed fixtures.

## Editor

The required visual direction and docking behavior are defined in [designer and platforms](14-designer-and-platforms.md). Use a light µC/Probe-like ribbon, dense toolbox, white ruled/grid canvas, bottom symbol browser, instrument-style widgets and contextual property controls. The earlier dark card-dashboard direction is superseded. Widgets use arbitrary canvas coordinates and can overlap; they must not be constrained to cards, responsive rows or a fixed tile grid.

- Panels: freely dock/undock/reorder/split/tab/auto-hide the explorer, toolbox, symbol browser and property inspector; float them as native desktop windows; persist layouts and recover offscreen windows. Document screens can be rearranged or floated.
- Workspace tree: projects/groups/screens; screen type dashboard/scope/memory/awareness. Rename, move, duplicate, import/export; duplicate regenerates node/widget IDs and preserves intentional source bindings.
- Toolbox: filter by name/category; keyboard insertion; symbol drag/drop onto selected widget with compatibility preview.
- Canvas: SVG instruments, optional grid and rulers, snapping, move/resize/rotation, selection rectangle, multi-select, align/distribute, group, z-order, locked items, text/image/connector/shape objects. Undo each completed gesture as one operation.
- Inspector tabs: binding, appearance, range/colors, input behavior, series. Show unresolved/error/stale status separately from numeric values. Validate before committing properties.
- Save versioned JSON with atomic replacement, recovery copy, relative source paths, dirty indicator, and explicit unsaved-changes flow. Opening/importing must not initiate connections or writes.
- Shortcuts: Ctrl on Windows/Linux and Command on macOS for save, undo/redo and copy/paste, Esc cancel gesture, arrows nudge, Shift for coarse nudge. Keyboard alternatives for dragging and numeric properties.

## Runtime

Use orthogonal states: editor mode (`design`/`run`/`locked`) and connection state (`disconnected`/`connecting`/`connected`/`fault`). Locking layout is not permission to write. Target writes only when run mode, live session, compatible writable source, valid type/range and user input all agree.

Indicators retain last value with stale age and reason on failure; never substitute zero. Distinguish transport errors, decoding errors, unresolved symbols, unsupported types, and hardware restrictions. Display actual read rate, byte rate, latency, lost samples and selected target; requested rate is not measured rate.

One scheduler shares reads among consumers. Hidden screens can lower visualization subscriptions while active logs keep acquiring. Memory polling at different addresses is generally not a coherent snapshot. UI must not imply simultaneous samples unless a provider guarantees them.

## Input semantics

Slider writes on release by default; optional rate-limited live updates are explicit. Text/numeric writes on Enter or apply. Toggle writes configured state values. Push/momentary writes press and release values while session is valid. Repeat uses bounded interval and cancels on focus loss/stop/disconnect. Readback updates confirmed state. A lost release cannot be guaranteed to reach disconnected hardware; offer target-side watchdog/deadman for actuation.

Validate engineering-to-raw inverse `(value-offset)/gain`; gain zero is read-only. Integer writes require an explicit rounding rule, range/width check and no silent truncation. NaN/Inf require explicit handling. Enum inputs use declared values. Strings require encoding/capacity/termination policy. Do not allow implicit writes through read-only indicators.

## Charts, logs, scope

Chart data stores acquisition timestamps and quality independent of rendering. Ring buffers are bounded; display min/max decimation preserves spikes. Modes: strip, sweep, scalar XY pairs and full-array burst. Configure axes/units/scaling/color/legend/buffer capacity; use original instrument artwork with bevels, highlights, needles and colored scales visually close to µC/Probe; charts and canvas remain freely placeable.

CSV logs carry UTC timestamp, monotonic elapsed time, value and quality for each symbol. Locale-independent numeric serialization; one row per planned tick with missing samples marked. Separate logged data from display-decimated data. Output file selection is explicit; do not silently overwrite. Pause/resume/start-stop conditions have deterministic state transitions.

Scope frames include actual sample clock/divider, enabled channels, types, capture ID, trigger index, timestamps and dropped/invalid flags. Host computes `t[i]=(i-triggerIndex)/effectiveHz`. Stop means disarm capture when connected; during communication loss show outcome unknown. Never label PC polling as a hardware-rate oscilloscope.

## Performance targets to validate

These are proposed benchmarks, not measured results: responsive editor with 200 widgets; cached search across 100,000 symbols within 200 ms on a documented reference PC; 100 simulated scalar bindings at 20 Hz; charts rendering at 30 fps while acquisition proceeds independently; bounded memory during a one-hour simulated run. Hardware rates must be measured per adapter/device. Unsupported modes fail clearly.

## Accessibility and distribution

Every icon button has a text label/tooltip. Gauges include readable numeric equivalents. State uses text/shape as well as color. Light/dark/high-contrast palettes, DPI scaling, keyboard navigation and reduced animation are required. Build and test Windows, macOS and Linux packages for every release. Simulator, designer, persistence and logging must work on all three before MVP completion; hardware adapters publish a separately tested host/board/probe matrix. Unsupported vendor integrations must not disable the cross-platform core.
