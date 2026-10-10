# Implementation backlog

Each row is an implementation-sized workstream; complete dependencies in order. Estimates are deliberately omitted until M0 proves the stack.

| Milestone | Tasks | Depends | Exit gate |
|---|---|---|---|
| M0 Contracts and demo provider | Prove Windows/macOS/Linux builds and native dock/float/restore spike; pin versions; implement model validators/codecs, mock catalog/provider, session epochs; turn three original instruments into components; document stack decision | This package | Offline app works on all three platforms; AC02/04/14/15 subset |
| M1 Editor and runtime MVP | Light grouped ribbon; dock/float/tab/split/auto-hide panels; tree/toolbox; freeform canvas gesture command model; original glossy instrument skins; inspector/binding; chart ring buffer; save/load; CSV logger | M0 | Full simulator journey on Windows/macOS/Linux; AC01/02/04/06/07/11/14/15/16 |
| M2 ELF and binding | object/gimli parser, type graph, qualified IDs, lazy browser, complex paths, file watcher/reload, compiler fixtures | M0, integrates M1 | DWARF4/5 fixtures correct; ambiguous/unsupported diagnostics; AC03 |
| M3 Real debug transport | probe discovery/selection, device/core/config, capability reporting, live memory polling, session cancellation, optional tested sharing | M1/M2 | One actual board/probe read/write demo without stopping firmware; AC05/06 |
| M4 Engineering views | SVD semantics, bit editor, memory dump, arrays/XY/bar, range bands, compass/state images, RAM footprint, predicate logger | M2/M3 | AC07/08/11; no MMIO side-effect regressions |
| M5 Original target service | Freeze protocol/golden vectors; C99 bounded decoder/dispatcher; memory policy; UART/CDC/TCP hooks; trace/command UI | M1 | AC09 in simulator and actual firmware; release target integration guide |
| M6 Oscilloscope | Freeze scope ABI; original C sampling/trigger/buffers; host ownership/download; channel/timebase/trigger UI; export/cursors/stats | M5, or debug-memory mailbox alternative specified first | AC10 on synthetic and actual target signals; measured CPU/RAM/rates |
| M7 Extensions | Versioned FreeRTOS snapshot integration; limited scripts; table formulas/export; MQTT; HID; optional trace connector; other adapters/legacy imports | M3-M6 as relevant | AC12/13 per extension, provenance/license audit |
| M8 Distribution | Windows/macOS/Linux packaging and CI; accessibility/performance audit; offline startup; migration/recovery; docs/tutorials | M1-M3 minimum | Reproducible signed/unsigned packaging policy and tested installation/runtime on all three OSes |

## Suggested first issue boundaries

1. M0: model validation and exact integer codecs.
2. M0: deterministic mock provider with injected faults and epoch rules.
3. M0: desktop build and three parameterized original instruments.
4. M1: canvas command history and geometry transforms.
5. M1: binding inspector and typed input semantics.
6. M1: independent acquisition/history/log pipeline.
7. M2: DWARF fixtures and static-location resolver.
8. M3: live-memory adapter with measured hardware evidence.

Record completed feature IDs and AC results in each PR. Avoid allocating work by visual skin before the shared behavior and typed contracts are sound.
