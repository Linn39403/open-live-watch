# Product requirements

## Primary workflow

An embedded engineer opens an ELF or mock symbol source, finds `motor.speed`, drops a radial gauge on a screen, binds it, chooses a probe/target, and starts reading the running firmware. A slider bound to `motor.setpoint` changes only that validated variable after a deliberate input commit. A logger records values and acquisition times. Saving/reopening preserves the dashboard and symbolic binding, even if an ELF rebuild moves the variable.

## Scope and goals

Windows-first desktop application with a portable core. Local/offline use must work without an account or cloud dependency. First deliverable: end-to-end simulator dashboard; second: real ELF and one tested Cortex-M debug transport. No mandatory RTOS, no mandatory target firmware for supported debug-memory polling. Target firmware is required for custom serial/network communication and deterministic scope capture.

Do not make legacy .wsp, CSF/CDF, µC/Probe wire protocol, vendor DLL, or script-language compatibility an MVP requirement. Add such compatibility only through separate documented parsers/adapters and licensed fixtures.

## Editor

- Workspace tree: projects/groups/screens; screen type dashboard/scope/memory/awareness. Rename, move, duplicate, import/export; duplicate regenerates node/widget IDs and preserves intentional source bindings.
- Toolbox: filter by name/category; keyboard insertion; symbol drag/drop onto selected widget with compatibility preview.
- Canvas: SVG instruments, optional grid and rulers, snapping, move/resize/rotation, selection rectangle, multi-select, align/distribute, group, z-order, locked items, text/image/connector/shape objects. Undo each completed gesture as one operation.
- Inspector tabs: binding, appearance, range/colors, input behavior, series. Show unresolved/error/stale status separately from numeric values. Validate before committing properties.
- Save versioned JSON with atomic replacement, recovery copy, relative source paths, dirty indicator, and explicit unsaved-changes flow. Opening/importing must not initiate connections or writes.
- Shortcuts: Ctrl+S save, Ctrl+Z/Y undo/redo, Ctrl+C/V duplicate via clipboard, Esc cancel gesture, arrows nudge, Shift for coarse nudge. Keyboard alternatives for dragging and numeric properties.

## Runtime

Use orthogonal states: editor mode (`design`/`run`/`locked`) and connection state (`disconnected`/`connecting`/`connected`/`fault`). Locking layout is not permission to write. Target writes only when run mode, live session, compatible writable source, valid type/range and user input all agree.

Indicators retain last value with stale age and reason on failure; never substitute zero. Distinguish transport errors, decoding errors, unresolved symbols, unsupported types, and hardware restrictions. Display actual read rate, byte rate, latency, lost samples and selected target; requested rate is not measured rate.

One scheduler shares reads among consumers. Hidden screens can lower visualization subscriptions while active logs keep acquiring. Memory polling at different addresses is generally not a coherent snapshot. UI must not imply simultaneous samples unless a provider guarantees them.

## Input semantics

Slider writes on release by default; optional rate-limited live updates are explicit. Text/numeric writes on Enter or apply. Toggle writes configured state values. Push/momentary writes press and release values while session is valid. Repeat uses bounded interval and cancels on focus loss/stop/disconnect. Readback updates confirmed state. A lost release cannot be guaranteed to reach disconnected hardware; offer target-side watchdog/deadman for actuation.

Validate engineering-to-raw inverse `(value-offset)/gain`; gain zero is read-only. Integer writes require an explicit rounding rule, range/width check and no silent truncation. NaN/Inf require explicit handling. Enum inputs use declared values. Strings require encoding/capacity/termination policy. Do not allow implicit writes through read-only indicators.

## Charts, logs, scope

Chart data stores acquisition timestamps and quality independent of rendering. Ring buffers are bounded; display min/max decimation preserves spikes. Modes: strip, sweep, scalar XY pairs and full-array burst. Configure axes/units/scaling/color/legend/buffer capacity; no requirement to duplicate the original glossy appearance.

CSV logs carry UTC timestamp, monotonic elapsed time, value and quality for each symbol. Locale-independent numeric serialization; one row per planned tick with missing samples marked. Separate logged data from display-decimated data. Output file selection is explicit; do not silently overwrite. Pause/resume/start-stop conditions have deterministic state transitions.

Scope frames include actual sample clock/divider, enabled channels, types, capture ID, trigger index, timestamps and dropped/invalid flags. Host computes `t[i]=(i-triggerIndex)/effectiveHz`. Stop means disarm capture when connected; during communication loss show outcome unknown. Never label PC polling as a hardware-rate oscilloscope.

## Performance targets to validate

These are proposed benchmarks, not measured results: responsive editor with 200 widgets; cached search across 100,000 symbols within 200 ms on a documented reference PC; 100 simulated scalar bindings at 20 Hz; charts rendering at 30 fps while acquisition proceeds independently; bounded memory during a one-hour simulated run. Hardware rates must be measured per adapter/device. Unsupported modes fail clearly.

## Accessibility and distribution

Every icon button has a text label/tooltip. Gauges include readable numeric equivalents. State uses text/shape as well as color. Light/dark/high-contrast palettes, DPI scaling, keyboard navigation and reduced animation are required. Build Windows installer and portable test package after the MVP works. Linux/macOS support follows platform proof, not just successful compilation.
