# ADR 03: Offline commands and project recovery

Status: accepted architecture; implementation evidence pending. See [the project plan](18-project-plan.md).

## Sustained command identity

Retain provider protocol version 1 and its string operationId field. The offline provider defines the canonical identity as `epoch:counter`, where the counter is a positive safe integer. The authoritative main window increments the counter per attempt, including attempts whose result becomes unknown. One high-water counter per epoch replaces the growing replay set and the 128-operation session cap.

Reject malformed identities, mismatched epochs, and counters at or below the consumed high-water value before applying any effect. Main still correlates at most one pending result using the complete operation/source/path/value/revision identity. Unknown results remain consumed and are never automatically retried. Exhaustion is explicit; do not wrap a counter or reuse an identity. Starting a new epoch invalidates old commands and resets only that epoch's state.

An unbounded ID set would eventually require a cap or permit memory growth. Dropping arbitrary old IDs would reopen replay acceptance. A monotonic counter provides bounded memory and continuous manual use while retaining stale/replay rejection. This specializes the offline operation identity; future external adapters need a separate documented identity contract before deployment.

Momentary controls send press and release through the same authority. Repeated controls cancel on pointer cancellation, focus loss, Stop, screen replacement, or view destruction. Do not enqueue unbounded repeats. Surface uncertain release or failed writes; never display successful target state without the accepted provider result. Offline safety does not prove an embedded target deadman.

## Recovery and close lifecycle

Keep one bounded, schema-validated recovery snapshot in native application data, atomically replaced after a 500 ms edit debounce. Store workspace content, savedPath, revision and project/session generation metadata; keep acquired plot history and transient command state out of the snapshot. Validate at the native boundary using the shared document contract and explicit byte/count limits. A late snapshot write from a replaced project must not overwrite its successor.

Fresh startup offers Restore or Discard. Do not silently open recovered data or assume a saved file is identical to the snapshot. Restoring uses validated portable content and starts a fresh stopped acquisition session. Recovery is user-local and separate from project files and machine-specific docking geometry.

Closing an unsaved native project offers Save, Discard, or Cancel. Save closes only after successful completion; cancellation or failure keeps the window, document and recovery data. Discard clears that project's snapshot deliberately. Successful save clears or advances only the matching snapshot generation. Atomic writes must preserve the prior valid file when the replacement fails. A corrupt or future-version recovery file is reported and preserved until the user explicitly discards it; do not hide failure behind automatic overwrites.

## Evidence required

Test more than 128 and at least 1,000 writes in one Run, replay/epoch/order rejection, unknown acknowledgement handling, counter exhaustion, momentary/repeat cancellation, and one authoritative writer across floating views. Test close Save/Discard/Cancel, save dialog cancellation, failed replacement, invalid recovery, stale debounce completion after project replacement, recovery restore/discard, and frontend/native validation parity. Actual macOS/Linux runtime checks remain deferred; preserve portable implementation and CI.

Implementation bounds: recovery formatVersion 1 stores generation, revision, savedPath and workspace. The validated workspace is limited to 10 MiB and metadata to 1 KiB. A native mutex serializes replacement; begin advances generation and stale generation/revision writes are rejected. Missing, valid and corrupt recovery are distinct outcomes. Browser close uses its before-unload warning; native close uses the explicit Save/Discard/Cancel workflow.

### Held-control ownership invariants

Ownership is a physical interaction token containing widget, screen and epoch identity; it is separate from the latest boolean sample and from an individual pulse's operation ID. Only one held-control owner exists at a time. An unrelated switch write or a false acknowledgement must not clear that owner. Repeating off pulses retain ownership while the pointer/key remains held.

| Event | Required behavior |
|---|---|
| Press with no owner | Acquire owner, submit a bounded press attempt, remember its complete operation identity |
| Physical release before press acknowledgement | Retain one release request for that owner; submit false only after a matching accepted press acknowledgement |
| Matching accepted press acknowledgement | If release was requested, send its safety release; otherwise retain the held owner |
| Repeat off acknowledgement | Retain the physical owner; permit the next bounded pulse only while held and with no pending write |
| Another control presses/releases | Reject or explain busy; never replace the existing owner's safety-release request |
| View switches or loses focus while same epoch is valid | Cancel repetition and route the original owner's release to its original screen/widget |
| Stop/project replacement/epoch change | Cancel timers and stale queued requests; never submit an old release into the new session |
| Timeout or unknown acknowledgement | Report uncertainty, consume the operation identity, do not retry or resume repeat automatically |
| Physical release and matching release completion | End that owner according to its correlated operation, independent of unrelated false values |

Test these transitions through actual application handlers and delayed provider results. Timer-only and pure helper tests are insufficient evidence of correct authority integration.
