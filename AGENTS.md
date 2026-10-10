# Coding agent instructions

This repository contains a runnable offline designer and its specification. Read README, docs/10-agent-handoff.md, docs/16-offline-run-guide.md and docs/17-provider-and-graph-contract.md before coding. New projects start blank; the motor simulator is an explicit example, and embedded-device integration remains unimplemented.

- Distinguish observed facts, documented capabilities, proposals, and unverified claims. Do not describe proposed functionality as implemented.
- Follow docs/18-project-plan.md for current requirement IDs, milestone status, task dependencies and exit gates. The accepted Windows offline slice does not close full M0/M1 or AC14/AC15.
- Windows, macOS and Linux are required release platforms. Read docs/14-designer-and-platforms.md; the default UI must closely follow the µC/Probe editor workflow and light instrument styling. Implement milestone M0 first, then M1. A complete offline demo is the first acceptance gate.
- Follow versioned contracts. Validate incoming data in the Rust backend and frontend boundary; TypeScript declarations alone are insufficient.
- Keep target I/O out of the rendering thread. Every target session has an epoch; reject stale reads and writes after reconnect or firmware reload.
- Do not halt, reset, flash, or unlock a target as a side effect of connecting. Report unsupported live reads explicitly.
- Writes require explicit run mode and a writable validated binding. Do not replay writes after uncertain timeouts or reconnect.
- Use original vector assets or author new geometry. Do not copy proprietary artwork or bundle the installed manuals.
- Never auto-execute scripts or commands when opening a workspace. Use capability-limited interfaces for extensions.
- Pin actual dependency versions after proving Windows, macOS and Linux builds/runtime, and record platform/device limitations. Native docking/floating and the required light visual direction are M1 acceptance gates.
- Use meaningful codec, schema, protocol, state-machine, and integration tests; avoid merely duplicating getters.
- Finish each milestone with a runnable demo, acceptance evidence, updated traceability, and remaining gaps.
- Do not claim hardware validation based on simulator tests.
