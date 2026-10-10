# Coding agent instructions

This is a specification repository, not a working application. Read README and docs/10-agent-handoff.md before coding.

- Distinguish observed facts, documented capabilities, proposals, and unverified claims. Do not describe proposed functionality as implemented.
- Implement milestone M0 first, then M1. A complete offline demo is the first acceptance gate.
- Follow versioned contracts. Validate incoming data in the Rust backend and frontend boundary; TypeScript declarations alone are insufficient.
- Keep target I/O out of the rendering thread. Every target session has an epoch; reject stale reads and writes after reconnect or firmware reload.
- Do not halt, reset, flash, or unlock a target as a side effect of connecting. Report unsupported live reads explicitly.
- Writes require explicit run mode and a writable validated binding. Do not replay writes after uncertain timeouts or reconnect.
- Use original vector assets or author new geometry. Do not copy proprietary artwork or bundle the installed manuals.
- Never auto-execute scripts or commands when opening a workspace. Use capability-limited interfaces for extensions.
- Pin actual dependency versions after proving the Windows build, and record platform/device limitations.
- Use meaningful codec, schema, protocol, state-machine, and integration tests; avoid merely duplicating getters.
- Finish each milestone with a runnable demo, acceptance evidence, updated traceability, and remaining gaps.
- Do not claim hardware validation based on simulator tests.
