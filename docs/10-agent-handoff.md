# Implementation agent prompt

Use [the project plan](18-project-plan.md) as the current task order and requirement/acceptance mapping. Complete M0/M1 closure tasks P01–P08 before beginning P09/P10 embedded work. Preserve the accepted offline slice; full milestone acceptance is separate from its current Windows evidence.

For the implemented configurable offline sources and eight-series time/XY graph, also read [provider/GUI protocol v1](17-provider-and-graph-contract.md) and its source mapping. Preserve source-qualified namespaces, 50 ms effective refresh, catalog/write permission checks and coherent bounded quality-aware plots when adding real providers.

Continue Open Live Watch using this repository's evidence-tagged specification and working offline application. The objective is an original open-source embedded runtime dashboard with a workflow similar to µC/Probe, including original vectors. The current bounded milestone includes a blank-project designer, original instruments, explicit motor simulation, native floating panels, validated save/load and per-instrument colors. Read docs/16-offline-run-guide.md for verified behavior and remaining gaps; embedded-device integration is not implemented.

Start by reading AGENTS.md and docs/14-designer-and-platforms.md, then the research, requirements, architecture, contracts, validation and backlog. Use examples/demo.olw.json and assets/ as seeds. The proposed stack is Tauri 2, Rust and TypeScript/React; prove it on Windows, macOS and Linux including native floating/dockable windows. All three platforms are mandatory. The initial dark-card direction is superseded by the light µC/Probe-like designer and original instrument artwork.

Complete M0 and M1 first: a runnable three-platform simulator application with a light File/Design/View ribbon, dockable/floating panels, symbol search, freely positioned/resizable/rotatable/overlapping widgets, typed bindings, original instrument-style indicators, slider/switch/button writes, chart history, save/load and CSV logging. All I/O stays off the UI thread, queues/buffers are bounded, and write requests carry validated session/catalog epochs. Show quality and errors honestly. Implement enough vertical slices to demonstrate the entire workflow rather than creating empty modules for every feature.

Create meaningful tests for codecs and invalid input, workspace roundtrip, stale commands, unknown write timeout, acquire/render separation and editor undo. Include a scripted offline demo and a concise run guide. Update schemas with any model changes, and keep contract/sample validation working.

Then M2/M3 adds ELF/DWARF and one real debug adapter. Never halt/reset/flash on connect. Record the exact target/probe/driver/firmware configuration and hardware results; simulator coverage is insufficient. Defer target-side scope until its protocol/ABI and frame ownership are finalized.

Do not copy Micrium source, proprietary SVGs, manuals, branding or projects. All assets supplied here are original static visual prototypes; implement their data/interaction/accessibility in components. Do not claim legacy compatibility or universal device support. Where requirements are incomplete, write an ADR and select a bounded, testable behavior consistent with the documented constraints.

Deliver a working milestone, verification evidence, updated feature traceability, and explicit remaining limitations. Refer to docs/11-sources-and-gaps.md for unresolved research questions.

Read implementation ADRs19–22 before modifying editor, dock tree, lifecycle or recording. Current automated closure evidence is in docs/16 and docs/reviews/offline-closure.md; final native/performance verification remains distinct. macOS/Linux runtime verification is explicitly owner-deferred, not passed.
