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

## Focused instrument-color review

The color change passes independent source/schema/model/render/persistence review. Actual color-picker/floating UI smoke is owned by the architect and is recorded separately below when available. No new code blocker remains.

Independent execution: `npm test` passed 21 tests across three files, including original model/CSP checks and new appearance coverage. The focused Rust test `colors_roundtrip_and_invalid_color_save_preserves_workspace` passed (two unrelated tests filtered out). The repository validator passed five malformed-workspace cases and 36 safe SVG assets using the bundled Python runtime; the machine's `python` alias was unavailable, so that runtime was used directly.

Reviewed behavior:

- Optional `settings.color` and `settings.needleColor` preserve old workspace loading/defaults, survive JSON/native save and reopen, and remain per widget. Undo/redo restores appearance along with the document.
- Both schema fields require exactly seven characters and a six-digit hexadecimal color. This fixed a discovered JS regular-expression edge case where `$` alone accepts a terminal newline. Frontend static validator, Rust schema validator and palette helper now agree.
- Six presets, a native color picker and exact hex entry all route through existing authoritative document patch commands. The Appearance fieldset is disabled in Run, and the main command handler independently rejects Run-mode patches from floating views.
- All eight instrument types receive individual palette variables; radial range and needle use separate SVG colors. CSS applies accents to the indicator/input faces without replacing neutral OFF states. Numeric readouts use dark ink on a pale derived face; switch/button text chooses black or white from accent luminance.
- Hex draft state is keyed by selected widget identity, so choosing another same-color widget cannot retain a partial draft from the previous widget. Invalid drafts do not enter saved state and produce visible feedback on blur/Enter.
- New tests cover legacy defaults, independent accent/needle roundtrip/undo, unsafe color strings including newline/URL/CSS payload, all eight rendered instrument palettes, separate radial needle, readable button text, LED ON/OFF distinction, and invalid native saves preserving the previous colored workspace.

Source review does not prove every platform's native color-picker rendering. Slider styling follows host accent-color support as documented. Full macOS/Linux runtime interaction and broader AC14/AC15 remain open. The architect reported successful three-OS build/test CI for the preceding commit `45c5cdf` (run 38025371166); that evidence does not establish the new color commit's CI result.

### Final architect native color smoke

The architect verified the final Windows development executable (PID30788): gauge accent hex `#327fbd` rendered blue; needle `#e58b22` rendered orange; Undo restored the red default `#b52b25` and Redo restored orange. A native floating Properties window displayed both colors; editing its accent to `#3366cc` selected Custom and redocking retained the same shared color. LED independently rendered teal `#268e94`; temperature rendered orange `#da8426`. Run disabled presets/hex editing and retained appearances.

Native Save As wrote `outputs/color-demo.olw.json` containing all three instrument accents plus the independent needle. Reset demo reverted defaults; native Open visually restored the saved colors. These are architect-run native UI observations, distinct from the reviewer's independently executed regression checks.

The instrument-color change is accepted for the bounded Windows offline prototype. No new blocker remains. This acceptance does not extend to macOS/Linux runtime interactions or full advanced designer/docking acceptance; the new commit's three-platform CI result is to be established after push.

## Focused blank-project and instrument-face review

Source/model/render/persistence review passes for the new blank-project and original instrument-face update. Actual browser/native New/Open/save/dialog/visual smoke is architect-owned and recorded separately when complete. No remaining blocking code defect was identified; a small unsupported-source wording inconsistency was sent to the coder.

Independent verification: `npm test` passed 28 tests across four files. The focused Rust `blank_project_and_unbound_widget_roundtrip_without_sources` test passed (three existing unrelated tests filtered out). These exercise empty-source workspace validation, all eight unbound instrument kinds, unchanged colors/geometry/schema roundtrip, dirty document content/undo, replacement history/path/session reset, rejection of old worker/editor epochs, Unicode/project filename handling, distinct vertical thermometer and SVG design previews without interactive thumbnail children. Previous color/CSP tests also remained green.

Reviewed decisions and corrections:

- Startup and named New project create an empty screen with `sources: []`. Toolbox insertion creates unbound widgets; it no longer assigns motor variables or creates simulator authority by implication.
- New/Open/Open motor demo use a separate document replacement boundary instead of an ordinary edit. Replacement resets history, selection, gestures, session locks, zoom/query, file association and simulation; the epoch increases beyond the previous session. New projects are unsaved; loaded projects have a clean snapshot. Old same-ID floating patches carry a prior epoch and are rejected, addressing repeated demo/reopen identity reuse.
- Dirty replacements offer Save/Discard/Cancel. Canceled save or validation/write errors do not proceed to replacement. Native Save uses its remembered successful path; Save As updates that path only after a successful write. The saved marker corresponds to the exact captured document snapshot, so later edits remain dirty.
- Pending project dialogs block editor patch commands from floating views and keyboard mutations; modal focus is contained. Floating views share the authoritative workspace/simulation snapshots.
- Unbound/invalid Design previews retain recognizable original faces and explicit preview labels; unresolved binding previews are distinguished from unbound ones. Run does not turn unresolved widgets into an apparently valid numeric reading or authorize their inputs. Blank/no-source Run is disabled.
- Eight original SVG faces are implemented: radial dial, horizontal linear gauge, framed numeric display, lamp, rocker, toggle push button, slider and a separate vertical thermometer with bulb/mercury/scale. Toolbox thumbnails have no nested interactive buttons or inputs.
- Hex color configuration and version-1 workspace compatibility are retained. Input capability still requires resolved writable bindings and the existing validated simulator/session gates. The push button remains an explicitly labeled simulated toggle, as previously scoped.
- Filename sanitization gained a regression covering ordinary `Project x10`, Unicode and forbidden/control characters. The static validator generator now skips unchanged output, preventing unnecessary dev HMR resets during checks.

Scope limits: unsaved-change protection applies to New/Open/demo replacements; main-window close still exits without an unsaved prompt or autosave, explicitly outside this update. Browser save marks a download as issued rather than proving successful disk persistence. New blank projects are layout-only; adding configurable source providers and embedded interfaces remains outside the milestone. Source/model/render tests do not replace actual platform-native UI inspection or a visual review at every size/DPI.
Architect acceptance of new-project and instrument update: Windows release build and native startup/Open/Save as/New/reopen passed. Canceling the native save during project replacement preserved the current document and pending prompt. Browser hands-on creation/arrangement/colors/export verified all eight unbound instruments without any motor source; actual saved files were inspected. Native design preview labels and original instrument faces were visually checked. Focused update accepted with the documented broader milestone limits retained.

## Focused natural-default-palette review

The natural default-palette change passes independent source/regression/production-build review. No blocking finding remains. Visual/native acceptance remains architect-owned and should be attributed separately.

Independent checks: `npm test` passed 30 tests across four files; `npm run build` passed TypeScript and Vite production compilation (48 modules). New meaningful coverage verifies all eight per-kind defaults in both full instrument and toolbox SVG rendering, unchanged explicit mixed-case custom accent/needle values, reset preserving unrelated settings, reset/save roundtrip and undo restoration. Existing source-free project, unsafe-color and CSP tests remain passing. Rust/schema code was unchanged, so unrelated backend tests were not rerun.

Reviewed behavior: blue defaults for radial/linear/slider; teal numeric accent with neutral ivory LCD; amber LED/button; slate-blue rocker; red thermometer; independent red radial needle. Existing white/metal/glass physical surfaces remain neutral. There are five distinct default accents across eight kinds, with valid exact hex values. Toolbox, Properties effective preset/hex and actual faces all use the same typed kind-default map. Green remains available as an explicit preset.

Explicit `settings.color`/`needleColor` overrides keep priority and are not rewritten by loading old workspaces, choosing another instrument or changing defaults. Restore default colors removes only the two override keys and retains geometry/bindings/range/precision. Black/white control text is selected from accent luminance; readouts use dark ink on light neutral/pale faces. State still carries text/shape and the neutral OFF rendering.

This changes the application's own SVG/CSS palette only. No OS accent/theme/settings APIs, registry operations or system-wide styling changes are present. The optional color schema and simulator/session behavior are unchanged. Earlier report entries describing universal green defaults record earlier revisions; this section supersedes that default policy.

## Focused configurable-provider and 2D-graph review

Independent source, protocol, persistence, regression and production-build review passes for the configurable offline-provider and 2D-graph vertical slice against docs/17-provider-and-graph-contract.md. No blocking code defect remains. Final Windows native GUI acceptance remains architect-owned and pending; other-platform runtime and hardware interfaces are outside this evidence.

Independent checks: npm test passed 54 tests across five files; cargo test --manifest-path src-tauri/Cargo.toml passed all six Rust tests; npm run build passed TypeScript and Vite production compilation (52 modules). Meaningful new coverage includes qualified-name collisions and an offline source named mock-motor, declarative configuration/schema failures, legacy binding type/permission compatibility, bounded waveforms, boolean identity mapping, inverse numeric writes and provider permission, malformed/stale/replayed worker envelopes, all-or-nothing sample validation, bad quality after Stop, effective update intervals, coherent transformed XY pairs, missing-sequence/quality gaps, transformed nonfinite rejection, bounded graph history and manual Y limits without data. Same-catalog project reopen restores configured initial values and clears captured runtime state instead of producing missing readings; that correction has a regression. Rust verifies new provider/graph roundtrip and corresponding semantic rejection while retaining atomic invalid-save preservation.

Reviewed implementation and corrections:

- Blank projects can declare inline numeric/boolean variables, constants/manual writes and read-only sine/ramp/toggle waveforms. The source editor discloses eight sources and 128 catalog variables, traps modal focus, validates on Apply and requires referenced bindings to be removed before deleting their variables. Existing unsupported device-source configurations remain visibly unavailable and never acquire simulated readings merely because they were loaded.
- Catalog identity uses the full JSON-encoded source/path pair. Provider behavior is resolved from the actual configured provider, so equal names and a deliberately reused legacy source ID cannot route to motor samples. Scalar and XY bindings preserve gain/offset/units/requested interval and write intent. Boolean mappings are identity-only; source permissions and ranges remain authoritative.
- The worker owns acquisition and processed writes; floating panels share main-window authority. Receiving boundaries validate protocol version, allowed fields, string identifiers, bounded arrays, safe counters/time, typed values, quality and catalog identities. Whole sample batches validate before any update. Epoch/catalog/command revision and monotonic sequence/time reject stale data. Source edits/undo and project replacement invalidate session/catalog history.
- Writes require Run, a compatible input binding, catalog permission, finite inverse mapping and valid raw range. Results correlate operation ID, session, catalog, command revision, source/path and acknowledged raw value. Timeouts report unknown without automatic retry. A bounded processed-operation set prevents replay; the implementation permits 128 processed writes per Run session and then explicitly requires a new Run session.
- Readouts hold quantized samples using the same effective refresh calculation as graphs: requested intervals round upward to the 50 ms engine cadence. Latest bad quality remains unavailable after Stop. Configured initial values are available in a fresh stopped document, while acquired graph history remains empty until Run.
- The original vector graph supports time and coherent XY modes, per-binding transforms/units, automatic X, optional manual Y, series color, resize/geometry/persistence and captured-view retention on Stop. History is limited to 600 coherent frames and at most 600 plotted points, with a configured window up to 30 seconds. Quality failures, missing sequences and nonfinite transformed coordinates break the path rather than joining invalid data. Toolbox graph previews are explicitly illustrative and never enter history.
- Shared static frontend schema validation and Rust semantic checks retain version-1 legacy projects, source-free projects and explicit color overrides. Opening configuration executes no script or device connection. The offline protocol uses elapsed simulation milliseconds; docs/06-target-protocol.md remains a future adapter draft.

Architect-attributed browser evidence: the stable production preview at port1421 passed a new-project source creation, time/XY graph and manual-write workflow, export and reopen. That smoke discovered missing readings after reopening an identical catalog; the coder corrected document initialization and the independent regression above passed afterward. These observations are separate from the reviewer's automated checks and do not establish native save/dialog/floating behavior for this new slice.

Earlier report statements that blank projects are layout-only are superseded by this configurable offline-provider implementation. Hardware transports, durable logging/oscilloscope triggering, arbitrary expression scripts, multi-series plotting, full advanced docking and macOS/Linux interactive runtime remain unimplemented or unverified as documented. Native GUI acceptance and final documentation review are the remaining integration steps.

## Architect Windows GUI acceptance

The optimized Windows executable passed a native GUI smoke after the independent automated review. Open project loaded the browser-created `source-graph-project.olw.json` through the native backend: two offline numeric variables, a time graph, an XY graph and a writable slider. Fresh stopped values were the configured 0 °C and 25, with no acquired graph history.

The architect added a radial gauge, selected `lab / temperature` in its Binding property and moved it freely beside the graphs. Run acquired the sine waveform in the time graph and gauge; a native slider action changed the shared manual setpoint from 25 to 83 and updated the XY capture. Stop retained the graph capture. Native Save As wrote `source-graph-native.olw.json` with all four instruments, bindings, geometry, custom purple XY color and declarative sources. Opening that saved file restored four instruments and configured initial values, cleared runtime history and advanced the project session.

A screenshot and both example projects are delivered beside the repository in the local outputs folder. These observations establish the focused Windows source/binding/graph workflow; they do not establish macOS/Linux interactive runtime, hardware transport, advanced docking or new floating-window coverage. Automated acceptance remains 54 frontend tests, 6 Rust tests, production build and package validation. The optimized Windows release build passed.
