# Independent review: first offline milestone

Reviewer: delegated independent reviewer. Date: 2026-10-10.

## Verdict

Accepted as a bounded Windows offline prototype under `docs/15-offline-milestone.md`, combining independent source/model/build checks with the architect's actual final Windows native smoke. No remaining reproducible application-code blocker was identified in the reviewed revision. This acceptance covers the documented prototype scope only. Full M1, AC14 and AC15 remain incomplete; macOS/Linux runtime and advanced designer/docking acceptance are open.

The reviewer changed this report only; application fixes were authored by the coder.

## Independently executed evidence

Windows checkout; Node/npm, Rust and the committed lockfiles.

| Check | Result | Evidence |
|---|---|---|
| `npm test` | PASS, 11 tests | Final CSP regression run 12:40:17 host command timestamp; workspace roundtrip/malformed data/duplicate IDs, history branching, simulator write rejection, engineering scaling, bounded history, snap offset and worker ordering |
| `npm run build` | PASS | TypeScript build and Vite 7.3.7 production build; 46 modules; static validator and 1.09 kB worker asset included |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS, 2 tests | Shared JSON-schema validation; rejected invalid save preserves prior file, valid replacement/reopen on a Unicode filename |
| Source review | PASS with declared limits | Main-only worker, epoch/revision stale-frame rejection, validated binding source/type/scaling, synchronous errors, geometry locks, native lifecycle and atomic temporary-file save |

The first sandboxed npm invocation could not resolve the configuration because esbuild attempted ancestor-directory access. The same test/build commands passed after approved escalation. No software test failure resulted. A Rust warning about canonicalizing the user directory did not fail tests.

These are meaningful boundary/model tests, not automated end-to-end coverage of every pointer gesture, native dialog or desktop window operation.

## Defects corrected during review

- Rejected writes formerly threw from a deferred React state updater outside the error handler. Writes now validate synchronously and display errors.
- Writes formerly omitted engineering-to-raw inverse scaling and trusted binding intent alone. Zero gain, wrong source, incompatible type, read-only symbols, stopped state, stale epoch and invalid ranges are rejected.
- Duplicate widget IDs were formerly accepted across separate screens. Frontend/backend validation now enforces global widget uniqueness and shared schema/semantic checks.
- Snapped drag originally jumped an off-grid start position; displacement snapping now preserves the grab offset. Scroll deltas are incorporated in canvas coordinates.
- Run-mode Delete/undo/redo shortcuts and geometry property edits formerly bypassed toolbar restrictions. Editing guards and geometry locks now apply.
- Escape formerly referenced a nulled gesture from a deferred updater; the original geometry is now captured before clearing the gesture.
- Toolbox double-click formerly inserted three widgets; insertion now has one click handler.
- Native close could override the selected dock edge; explicit docking is preserved, stale persisted floating entries return to defaults, and destroying the main native window exits all views.
- Direct save formerly truncated the destination; validated saves now write/sync a temporary sibling and replace the destination.
- The added acquisition worker initially allowed a delayed same-epoch frame to overwrite a newer write and echoed received samples back to the worker. Monotonic command revisions reject old frames; commands alone are posted. Regression coverage reproduces delayed pre-write frames.

## Architect/coder evidence, separately attributed

The architect reported browser smoke checks: property x32→80 and Undo→32; Run disables geometry/toolbox while values update; switch ON→OFF changes motor.enabled to false; Properties right→bottom→right docking; dragging 120 screen pixels at 150% zoom moves 80 canvas units (x32→112), then one Undo restores x32. These were not independently automated by this reviewer.

The coder reported native Windows debug compilation and process launch. Process launch proves startup only, not float/shared-state correctness. The architect owns final native-window/runtime inspection and delivery evidence.

## Limitations and open acceptance gates

- No macOS/Linux runtime evidence; the CI matrix is configuration, not a passed run. No three-platform support acceptance claim.
- Native float/dock, shared-state edits, native save/open, second display, monitor removal and DPI behavior require actual desktop smoke evidence. No browser-only inspection proves these.
- Simple left/right/bottom mapping; split trees, tab stacks/reordering, auto-hide, previews, top dock and persisted native bounds remain deferred.
- Only the first screen is edited; additional screens persist. Floating Toolbox is view-only. Session locks are not persisted/shared to floating inspectors; authoritative geometry patch rejection still applies.
- Grouping, marquee, copy/paste, distribute, z-order commands and floating screens are deferred. Eight resize handles and a horizontal-delta rotation handle are present but lack exhaustive automated pointer tests.
- CSV exports a 120-sample recent speed snapshot with relative time, not continuous timestamp/quality logging. No unsaved-change prompt or recovery session.
- Simulator only: no ELF, device transports, target firmware, hardware testing or embedded interfaces.
- Unsigned development executable; production installers, signing and notarization remain open.

Read `docs/16-offline-run-guide.md` for the complete supported prototype behavior. Keep the broader acceptance gates open in feature traceability.

## Native startup/CSP follow-up

The architect's actual Windows native smoke found a blank React surface. This was a blocking startup defect missed by browser smoke/model tests: the runtime AJV compiler required dynamic string code generation, prohibited by the native Content Security Policy.

The coder replaced runtime compilation with the generated static validator in `src/workspace-validator.js`. `tools/build-validator.mjs` reads the same version-1 schema used by Rust and emits standalone validation; npm predev/prebuild/pretest hooks regenerate it, preventing normal commands from using an outdated schema. Semantic source/ID/range validation remains in the model and Rust backend. Native CSP was preserved without unsafe-eval.

Independent follow-up: 11 frontend tests passed, including a child Node process started with `--disallow-code-generation-from-strings` that accepts the demo and rejects schemaVersion 2. Production typecheck/build passed, now 46 modules. A source/bundle scan found no `new Function`, unsafe-eval or AJV compiler references. These establish the static-validator correction; actual native corrected startup still requires the architect's repeat smoke and cannot be inferred solely from passing browser tests.

## Native window and persistence follow-up

The architect reported corrected native startup PASS, a real Properties floating window with shared edit x32→80, and actual native Save As/Open dialogs: resetting demo to x32 then reopening the saved JSON restored x80. These are architect-run Windows desktop evidence, not independent reviewer automation.

The same smoke exposed a second blocking native defect: Dock restored the panel in the main window but the floating window persisted. The reviewer verified the exact installed `@tauri-apps/api/window.js` implementation: `onCloseRequested` calls `this.destroy()` after its handler, which needs a separate `core:window:allow-destroy` permission. The coder added that permission and changed explicit redock/default restore to native `destroy()`, with visible promise rejection handling. The lifecycle preserves the requested edge before destruction; OS close defaults a panel only while its recorded state is floating. Source/permission review passes. Successful disappearance still awaits the architect's final rebuilt-native smoke; do not infer it from source alone.

## Final architect native smoke and acceptance

The architect inspected final rebuilt Windows native process PID29264 and reported all of these PASS:

- Floating Properties followed by Dock destroys the native float; only the main window remains.
- Run acquires in the worker, updates gauge near 1600 rpm, temperature and chart.
- A floating Symbol Browser displays the same RUN session values. Main-window ON→OFF updates floating motor.enabled=false and speed falls to zero.
- Closing Symbol Browser using its native titlebar returns the table to the bottom dock and leaves only main.
- Reopening a floating view then closing the main native titlebar exits both views; subsequent window inventory is empty and the process is gone.
- Native Save As/Open previously preserved edited x80: Reset demo produces x32, reopening saved JSON restores x80.

These final runtime results resolve the native startup, redock and orphan-window blockers. Together with independently passing 11 frontend tests, 2 Rust tests and production frontend build, the bounded Windows offline prototype is accepted. No embedded-device interface or hardware compatibility is claimed. Cross-platform source/configuration exists, but macOS/Linux runtime acceptance remains explicitly unverified.
