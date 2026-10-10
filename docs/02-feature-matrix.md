# Feature matrix and traceability

O/D/P are defined in 01-research.md. P0 = MVP; P1 = next release; P2 = specialist/later. Priorities are proposed, not claims about the reference product. AC identifiers resolve in 08-validation.md; M identifiers resolve in 09-backlog.md.

| ID | Capability / evidence | New-tool requirement | Priority / milestone | Acceptance |
|---|---|---|---|---|
| F01 | Ribbon, docks, tree, tabs [O01] | Clear toolbar, resizable panels, screen tabs, status | P0 M1 | AC01 |
| F02 | Grid/rulers/zoom/handles [O01] | Drag/drop, resize, rotate, snap, multi-select, undo | P0 M1 | AC01 |
| F03 | Screen import/export and hierarchy [D pp.50-52] | Groups, screen duplication, versioned persistence | P0 M1 | AC02 |
| F04 | ELF/DWARF globals [O action, D pp.16-17] | Typed source-grouped browser and safe reload | P0 M2 | AC03 |
| F05 | Arrays/structs/bit fields [O01,D pp.67-70] | Typed path binding, bounded indices, masks | P0 M2 | AC03/04 |
| F06 | Custom symbols [O01,D pp.19-23] | Original JSON symbol schema, manual addresses | P0 M0 | AC02/04 |
| F07 | I/O SVD/SFR/CDF [O action,D pp.18-19] | SVD first, access and side-effect metadata | P1 M4 | AC08 |
| F08 | Footprint [O fields,D p.30] | Union of symbol intervals in RAM bounds | P1 M4 | AC03 |
| F09 | Debug transport choices [O02] | probe-rs adapter, explicit running-read capability | P0 M3 | AC05 |
| F10 | Serial/network/USB [O02,D Target pp.10-19] | Original bounded target protocol | P1 M5 | AC09 |
| F11 | Gain/offset [O03,D p.79] | Shared units transform, reversible input mapping | P0 M0 | AC04 |
| F12 | Numeric/LED/gauges [O01,D pp.79-87] | Numeric, LED, radial, linear, thermometer | P0 M1 | AC04/07 |
| F13 | Sliders/switches/buttons [O01,D pp.88-103] | Distinct commit, press/release, toggle semantics | P0 M1 | AC04/06 |
| F14 | Bit controls [O01,D pp.96-97] | Allowed-bit masks and register-aware writes | P1 M4 | AC08 |
| F15 | Sample/time/XY/bar charts [O icons,D pp.104-118] | Poll history, ring buffers, burst arrays, XY | P0/P1 M1/M4 | AC07 |
| F16 | Eight-channel target scope [D pp.171-185] | Target sampling, trigger/frame ownership | P1 M6 | AC10 |
| F17 | CSV logger [D pp.163-166] | Timestamped logging, predicates, overflow status | P0/P1 M1/M4 | AC11 |
| F18 | Memory dump [D pp.186-187] | Bounded address view, type/endian, one-shot/refresh | P1 M4 | AC08 |
| F19 | Target terminal [D pp.138-141] | Bounded trace and target command channel | P1 M5 | AC09 |
| F20 | RTOS/kernel/net awareness [D pp.119-137,192-200] | Versioned FreeRTOS snapshot adapter first | P2 M7 | AC12 |
| F21 | Scripting [D pp.155-162] | Explicit-run sandbox with same write policy | P2 M7 | AC13 |
| F22 | Spreadsheet [D pp.145-154] | Native table/formulas, export; Excel optional | P2 M7 | AC13 |
| F23 | MQTT [O action,D pp.24-29] | Typed topics, payload paths, secure credentials | P2 M7 | AC13 |
| F24 | HID [D pp.167-170] | Event mapping, rate limits, stop/disconnect handling | P2 M7 | AC06/13 |
| F25 | Shapes/media/compass [O icons,D pp.59-61,83-87] | Original shapes, SVG state imagery, compass | P1 M4 | AC07 |
| F26 | Debugger coexistence [D pp.73-76] | Per-adapter tested sharing; clear ownership errors | P1 M3 | AC05 |
| F27 | µC/Trace trigger [D pp.142-144] | Optional external trace connector; no analyzer claim | P2 M7 | AC13 |
| F28 | Three desktop platforms [owner requirement] | Equivalent core on Windows/macOS/Linux | P0 M0/M1 | AC14 |
| F29 | Free designer movement [owner requirement] | Dock/split/tab/auto-hide/native float; arbitrary widget geometry | P0 M0/M1 | AC15 |
| F30 | Reference-close design [owner requirement] | Light ribbon/grid/symbol browser and original glossy instruments | P0 M1 | AC16 |

All O rows prove UI exposure only. Transport, acquisition, export, terminal, scripts and RTOS functionality were not exercised against a target. Alternative skins and legacy integrations can follow after semantic coverage.
