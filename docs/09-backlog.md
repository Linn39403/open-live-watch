# Implementation backlog

Revision: 2026-10-10. The authoritative sequencing, owner-requirement traceability, architecture boundaries and exit gates are in [the project plan](18-project-plan.md). M0–M8 IDs are retained for continuity. M0/M1 have an accepted Windows offline slice; their complete cross-platform/editor gates remain open.

| Milestone | Status | Work remaining or planned | Depends | Exit gate |
|---|---|---|---|---|
| M0 Foundation/platform proof | Partial | Current-commit CI and actual macOS/Linux runtime; native dock/float/monitor spike; supported codec and fault coverage; record stack/ownership decisions | Current offline baseline | Portable contracts, bounded provider and real three-platform runtime evidence |
| M1 Offline editor/runtime | Partial; next milestone | Full dock tree/tab/split/auto-hide/restore; multi-screen/advanced canvas; lifecycle recovery; generic logger; write lifecycle; accessible original instruments and plots; performance | M0 with current closure overlap | Complete offline workflow, applicable AC01/02/06/07/11 and AC14/15/16 on all hosts |
| M2 ELF/binding | Planned | DWARF4/5 compiler fixtures; static-location resolver, type graph, qualified paths, ambiguity and reload handling | Accepted M0/M1 | AC03; typed bindings survive supported relocation or become explicitly unresolved |
| M3 Debug adapter | Planned | Rust device authority, chosen probe/board/driver, capabilities and live memory polling/writes | M1/M2 | AC05/06 on named hardware without stopping firmware on connect |
| M4 Engineering views | Planned | Arrays/multi-series plots, SVD/bit/memory views, range bands and logger predicates | M2/M3 for device features | AC07/08/11 as applicable; MMIO semantics and recording preserved |
| M5 Target service | Planned | Freeze wire vectors, bounded C99 codec/service, policy and UART/CDC/TCP hooks, trace/commands | M1 and adapter ownership/protocol review | AC09 simulator/loopback plus actual firmware evidence |
| M6 Target scope | Planned | Freeze sampling/trigger ABI, target buffers and host transfer/cursors/export | M5 or reviewed mailbox alternative | AC10 with actual clocks, trigger/ownership and CPU/RAM evidence |
| M7 Extensions | Planned | RTOS snapshots, limited scripting/tables/MQTT/HID and optional adapters | Relevant M3–M6 | AC12/13 per extension and permission/provenance review |
| M8 Distribution | Planned; development packages ongoing | Install/runtime matrix, signing policy, versioning/migrations, accessibility/performance and tutorials | M1 offline; M2/M3 hardware release | Reproducible packages and actual installation/runtime on declared OSes |

## Next coding-agent tasks

Use bounded P01–P08 task definitions in [the project plan](18-project-plan.md), in dependency order:

1. P01: commit-specific build/runtime evidence and platform gap matrix.
2. P02: complete native docking/tree design and three-platform spike.
3. P03: multi-screen/freeform editor command completion.
4. P04: application-close protection and recovery/migrations.
5. P05: bounded monotonic write operations and input/session lifecycle.
6. P06: generic timestamp/quality-aware source logging and sink failures.
7. P07: plot decimation/multi-series settings and accessibility/DPI completion.
8. P08: full offline acceptance, measured performance/fault run and packages.

P09/P10 then cover offline ELF resolution and the first explicitly selected embedded interface. No hardware transport belongs to the first offline milestone. Do not claim that the current graph replaces continuous logging, the toggle button proves momentary semantics, or number/boolean provider tests prove exact device integer codecs.

Each implementation change identifies R/AC IDs, applicable test subset, persistence/protocol compatibility, independent review and actual platform evidence. Keep current completed behavior in the [run guide](16-offline-run-guide.md); do not represent unimplemented backlog rows as working modules. Estimates follow the platform/design spikes; there are no invented delivery dates.
