# First implementation milestone: offline designer and simulator

Owner authorization: architect coordinates a coder and independent reviewer; implement without embedded-device interfaces. Scope agreed 2026-10-10.

## Deliverable

A runnable desktop prototype using Tauri 2, Rust and React/TypeScript, with a µC/Probe-like light editor and original instrument graphics. It must support a complete offline journey: open mock symbols, add and bind instruments, arrange the screen freely, run simulated readings, change writable simulated variables, stop, save, and reopen the workspace.

Minimum instruments: radial gauge, linear gauge, numeric indicator, LED, slider and switch. Simulated data and writes must be visibly identified as simulation. No probe connection, serial/USB/network device discovery, target memory access, firmware, or ELF parser is required for this milestone.

The designer must demonstrate arbitrary movement, resize/rotation, selection and undo/redo. Show rulers/grid, toolbox, workspace tree, symbol table and property inspector. Implement panel docking and a native floating-window vertical slice with shared state; disclose any remaining split/tab/auto-hide/monitor-recovery gaps rather than marking the complete AC15 passed.

## Architecture ownership

The architect owns scope, integration decisions, acceptance and final delivery. The coder owns application implementation and tests. The reviewer independently checks behavior, defects and evidence. The architect does not author application code. Review findings go to the coder for fixes.

## Acceptance evidence

- Typecheck, build and meaningful model/interaction tests pass.
- Offline create/bind/edit/run/write/stop/save/load journey works in the actual application.
- Invalid workspaces and disallowed simulated writes are rejected; errors remain visible.
- Geometry does not jump with zoom; undo/cancel restores the original object state.
- Floating views share the same project/simulation state and do not duplicate simulated writes.
- Cross-platform configuration and CI cover Windows, macOS and Linux. Actual runtime verification is reported by host; this Windows machine cannot establish macOS/Linux runtime success.
- A reviewer verdict records blocking defects, fixes and remaining limitations.

This is a bounded first milestone, not completion of every M1/AC14/AC15 requirement in the broader roadmap. Do not hide incomplete features behind enabled controls that silently do nothing.
