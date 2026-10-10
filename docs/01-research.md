# µC/Probe analysis

Research date: 2026-10-10 (Asia/Singapore). Reference installation: Professional 4.8.2.0. Local User's Manual V4.8, document 600-uC-Probe-015, and Target Manual V4.8, document 600-uC-Probe-Target-010, copyright 2019 Silicon Laboratories. Page references below are PDF page numbers, which match the printed pages in the examined sections.

Evidence labels: **O** = directly observed in this session; **D** = described in the installed manuals; **W** = external primary documentation; **P** = our proposed implementation. Evidence is scoped: seeing a button establishes an exposed UI feature, not successful hardware behavior.

## Product model

µC/Probe is a dashboard editor connected to embedded memory and named data sources. The engineer loads symbols, places instruments on a data screen, binds instruments to variables, configures the transport, and runs the workspace. Inputs can write variables; indicators display them. The workflow can operate through a debug probe without adding a generic communication service to the target, or through a firmware service over serial/network/USB. This is independent of whether the application uses an RTOS. [D: User pp.7-14; Target pp.6-13]

The application should be understood as several products sharing a symbol/binding model: dashboard designer, live-watch runtime, oscilloscope, memory inspector, logger, terminal, and RTOS diagnostics. High-rate acquisition is a separate firmware-assisted feature. Implementing beautiful gauges alone would miss the main engineering value. [P, derived from D]

## Shell and layout

Observed shell: File/Design/View ribbon, quick-access settings/run/save/load/undo/redo/help, workspace tree at upper left, accordion toolbox at lower left, central tabbed canvas, bottom symbol browser, status bar, rulers, grid, scrollbars, zoom, and fit/reset controls. Dock panels expose hide/auto-hide/window-menu controls. The open workspace had Project1/DataScreen1, two gauge objects, no symbols displayed, a Stopped status, and a configured J-Link SWD target. A configured target is not evidence of an attached board. [O: O01]

Design commands include pointer/text/pictures/connectors/basic shapes, fill/stroke, alignment, position, group, layering, font and paragraph alignment. Selected objects show resize/rotation handles and a contextual toolbar with lock, symbols manager, properties, ranges/colors, series editor, delete, duplicate. [O: O01/O03; D: User pp.62-70,77-78]

Workspace hierarchy supports projects, organizational data nodes, screens, awareness screens, scope, and memory dump. Nodes can be renamed/reordered, and screens exported/imported. [D: User pp.50-52]

## Symbol ingestion and identity

The observed browser includes ELF, I/O Registers, CSF and MQTT import actions; search by name/type; expand/collapse; RAM bounds; name, declared type, C type, size, filtered size, address, device and core columns; full array/element, structure, and bit-field configuration tabs. Association and custom-symbol actions were disabled with no loaded symbol. [O: O01/O03]

The manual describes ELF globals grouped by source file, sorting, automatic address refresh when the ELF is rebuilt, I/O register imports from SVD/SFR, a CDF catalog, XML custom symbols, and MQTT broker/topic/payload definitions. Nested selections combine structure members and array indices; the manual describes up to four levels for custom selections. [D: User pp.15-30,66-70]

Important documentation inconsistency: the overview says DWARF 2-5 (p.8), the ELF section mentions 2/3 (p.16), and the target overview mentions 2-4 (p.7). Do not assume every compiler form is supported in 4.8.2.0. The new tool needs an explicit tested support table rather than a broad version claim. [D]

Footprint accounting is symbol-based within a RAM range, not a complete linker memory utilization report. The new tool should merge overlapping byte intervals so aliases/unions/aggregate children are not counted twice. [D: User p.30; P]

## Connection model

Observed Settings dialog: Embedded Target and Host Application tabs; Cloud Only; firmware interfaces TCP/IP, RS-232 and USB; debug interfaces J-Link, CMSIS-DAP, Cypress PSoC Prog, ARM Keil µVision, Analog Devices; little/big endian; J-Link speed/interface mode/manufacturer/device/core selection. [O: O02]

The manual describes a data-client and generic communications module; the latter is an architectural separation worth preserving. Target code has OS and driver abstraction layers, bounded buffers, optional write/string/terminal support, and statistics. The interface called TCP/IP uses UDP in the documented generic target module; do not equate the UI name with a TCP stream. USB uses a vendor device class in the documented integration. [D: User pp.10-14,31-49; Target pp.10-19]

Shared debugger operation is described for particular integrations, not a generic property of all USB probes. Probe ownership, device/core addressing, firmware cache coherency, bus contention, and access while running require actual integration tests. [D: User pp.73-76; P]

## Widgets and binding semantics

Categories include writable controls, linear/angular gauges, charts, numeric indicators, miscellaneous, advanced, basic/flow/arrow shapes. Numerous gauge skins are visual variants rather than fundamentally different data models. Our library should implement parameterized geometry and reusable components. [O: O01; D: User pp.53-61; P]

Properties are separated into general/formatting, range/color and chart series editing. The selected linear gauge's Properties Editor exposed tooltip, scaling factor (1), and scaling offset (0). This directly confirms the gain/offset UI. [O: O03]

The manual describes numeric/scientific/engineering/hex formats, threshold bands, mapped LEDs and ARGB colors, compass, image-state mapping, dwell-triggered multimedia, sliders, switches, checkbox, push/toggle/repeat buttons, numeric entry, bit controls, structure trees and radio options. Push, toggle and repeat controls have distinct write timing. These semantics must be specified and tested rather than inferred from icons. [D: User pp.79-103]

## Acquisition and charts

Sample-index charts support marker/line/area, strip, scope sweep and array burst. Time-based charts represent acquisition time and have a documented limit of 20 samples/second; the manual recommends them for low-frequency waveforms. XY charts can pair arrays for burst or scalar values into a host buffer; a single array can use indices for one axis. Bar charts map arrays with configurable subsets and thresholds. [D: User pp.104-118]

The oscilloscope supports up to eight active channels, shared timebase, per-channel aliases/type/bit selection/scaling/statistics, stop/continuous/single-trigger/repeated-trigger modes, rising/falling level crossing, holdoff in samples, and pre/post-trigger position. The target sampling function is driven by a known periodic clock; the host retrieves completed buffers. Capture/upload/display dead time can miss signal activity. Firmware benchmark numbers in the manual are device-specific and are not performance commitments for this tool. [D: User pp.171-185; Target pp.90-95]

## Advanced functions

Data logging: multiple variables into CSV columns, configurable timestamps/file naming/sample period/start-stop predicates, suspend/stop, import/export settings. [D: User pp.163-166]

Terminal: target trace output and command input with separate panes, font/visibility/status, keyword icons, high contrast; it requires target support. This is a target CLI, not a host operating-system terminal. [D: User pp.138-141; Target pp.70-81]

Scripting: C-like syntax, host variables, target references prefixed with $, branching/loops, include, delay and pause, selectable execution. The new tool may use a different sandboxed language; exact syntax emulation is a later compatibility project. [D: User pp.155-162; P]

Spreadsheet: Excel automation with symbol-to-cell mapping, arrays/structures, named variables/formulas and workbook export. The original requires installed Excel. Proposed replacement: built-in table/formula view plus CSV/XLSX export; optional Excel bridge later. [D: User pp.145-154; P]

HID: selected host game controller, input-event to target-symbol mapping, status feedback. Kernel awareness: Micrium tasks/objects/network/memory plus FreeRTOS tasks, synchronization objects, event groups, timers, constants, memory; header help/sorting/cell copy/CSV snapshots. FreeRTOS requires diagnostic target code and version/configuration assumptions. µC/Trace triggers launch a separate analysis product; µC/Probe itself is not the complete trace analyzer. [D: User pp.119-144,167-170,192-200]

## Conclusions for implementation

Preserve the low-friction symbol-to-widget workflow, strong typed bindings, screen reuse, and transport independence. Build simulator-first on Windows, macOS and Linux. The owner requires a light µC/Probe-like freeform designer and original glossy instrument skins; this supersedes the initial dark-card proposal. Keep a provenance trail and explicit compatibility boundaries. Hardware read/write, RTOS decoding, legacy formats and scope throughput remain unverified in this session. [P; owner clarification in docs/14-designer-and-platforms.md]
