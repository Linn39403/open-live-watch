# Implementation agent prompt

Implement Open Live Watch using this repository's evidence-tagged specification. The objective is an original open-source embedded runtime dashboard with a workflow similar to µC/Probe, including original vectors. The repository is currently a planning/specification package, not an application.

Start by reading AGENTS.md, docs/01-research.md, docs/03-product-requirements.md, docs/04-architecture.md, docs/05-data-contracts.md, docs/08-validation.md and docs/09-backlog.md. Use examples/demo.olw.json and assets/ as seeds. The proposed stack is Tauri 2, Rust and TypeScript/React; validate it on Windows and record the decision before proceeding.

Complete M0 and M1 first: a runnable simulator application with symbol search, draggable/resizable widgets, typed bindings, numeric/LED/radial/linear indicators, slider/switch/button writes, chart history, save/load and CSV logging. All I/O stays off the UI thread, queues/buffers are bounded, and write requests carry validated session/catalog epochs. Show quality and errors honestly. Implement enough vertical slices to demonstrate the entire workflow rather than creating empty modules for every feature.

Create meaningful tests for codecs and invalid input, workspace roundtrip, stale commands, unknown write timeout, acquire/render separation and editor undo. Include a scripted offline demo and a concise run guide. Update schemas with any model changes, and keep contract/sample validation working.

Then M2/M3 adds ELF/DWARF and one real debug adapter. Never halt/reset/flash on connect. Record the exact target/probe/driver/firmware configuration and hardware results; simulator coverage is insufficient. Defer target-side scope until its protocol/ABI and frame ownership are finalized.

Do not copy Micrium source, proprietary SVGs, manuals, branding or projects. All assets supplied here are original static visual prototypes; implement their data/interaction/accessibility in components. Do not claim legacy compatibility or universal device support. Where requirements are incomplete, write an ADR and select a bounded, testable behavior consistent with the documented constraints.

Deliver a working milestone, verification evidence, updated feature traceability, and explicit remaining limitations. Refer to docs/11-sources-and-gaps.md for unresolved research questions.
