# Offline milestone run guide

## Offline demo

1. Run `npm ci`, then `npm run desktop` (or browser-only `npm run dev`). The original Motor lab sample opens automatically.
2. Click a toolbox instrument to add it. Click an instrument to select; Shift-click for multiple selection. Drag freely, resize from eight handles, or drag the circle above it to rotate. Zoom supports 50%, 100%, 150%, 200%. Snap grid can be disabled; Alt temporarily bypasses snap. Arrow keys nudge; Shift-arrow moves ten units. Escape cancels a gesture; Ctrl/Command-Z undoes and Ctrl/Command-Shift-Z redoes.
3. Bind compatible numeric/bool symbols in Properties, or drag a Symbol Browser row onto an instrument. Unsupported source providers and unresolved symbol names display Unresolved. Properties geometry lock is session-local.
4. Click Run. Readings now come from a 20 Hz worker-based simulated motor. Slider and switch inputs write only writable simulated symbols with a current session epoch; Stop rejects writes and restores editing. Slider commits on pointer release or keyboard navigation release. The button is explicitly a toggle control, not a momentary target write.
5. Stop; File → Save workspace. Open saved JSON. Desktop uses native dialogs and Rust JSON-schema/semantic validation; browser uses download/upload. Native saves write/sync a temporary sibling and atomically replace the destination, preserving the previous file if validation or write fails. Workspaces larger than 10 MB are rejected natively.
6. Drag panel headers onto left/right/bottom panel areas, or use the dock-position selector. Press ↗ for a native floating window in the desktop build. A floating Properties view can edit the selected widget; Symbol Browser follows the same simulated values. Dock returns the panel to the chosen edge. Closing a floating panel returns it to its default dock; closing the main window exits all windows. Floating Explorer and Toolbox are currently views; toolbox addition stays in the main window.
7. View → Restore default layout restores panels without changing widgets. File → Export recent CSV downloads the bounded recent speed history (120 samples).

## Architecture

`src/model.ts` contains workspace validation, bounded undo/history, typed simulation writes and pure motor stepping. `src/simulator.worker.ts` owns acquisition calculations; only the main window starts a worker. Main-window document state is authoritative. Floating views send commands through Tauri application events and receive shared snapshots; they do not create acquisition workers. Simulator epochs plus write revisions reject delayed pre-command samples; ticks cannot rewind and received samples are never echoed back as worker commands. Desktop loads/saves use `src-tauri/src/main.rs`; both Rust and the frontend validate the same version-1 JSON schema plus ID/source/range semantics. Frontend schema validation is generated statically from the shared schema before dev/test/build; runtime never compiles validation code, keeping the native CSP free of unsafe-eval. Local panel placement persists separately from portable workspace geometry. On relaunch, previously floating entries return to default docks.

## Verification, 2026-10-10

- Windows host: frontend typecheck/production build passed; 11 model/boundary/CSP tests passed; 2 Rust backend tests passed; Tauri debug desktop executable built successfully and launched.
- Architect native UI smoke: editor rendered; floating Properties edited gauge x32→80 through the shared session; native Save As produced valid JSON preserving x80; Reset demo restored x32; native Open reloaded saved geometry x80. Dock destroyed the floating Properties window. During Run, a native floating Symbol Browser displayed shared readings; switching the simulated motor ON→OFF updated its enabled value to false and speed to zero. Closing that floating window through the OS returned Symbol Browser to the bottom dock. Closing the main window while a floating view existed exited all windows and the application process. These observations cover this Windows host only.
- `npm audit`: zero reported vulnerabilities after patched dependency installation.
- `.github/workflows/desktop.yml` checks Windows, macOS and Ubuntu 24.04 builds/tests. CI is configuration, not evidence of already-passed remote runs or platform runtime acceptance.
- Review verdict and UI observations are maintained by the independent reviewer/architect alongside this guide.

## Explicit remaining limits

- Full AC14/AC15 acceptance remains open: no macOS/Linux runtime testing, second-monitor/DPI/monitor-removal evidence, split-tree docking, tab stacks, tab reordering, auto-hide, dock previews, or persisted native window bounds.
- This prototype edits only the first screen. Additional screens survive save/load but have no UI navigator. Geometry lock is session-local and not serialized/shared to floating inspectors.
- Panel edge arrangement is a simple persisted mapping, not the planned versioned layout tree. Empty docking regions remain available. Dock drags have no custom preview or Esc cancellation.
- Widget grouping, marquee selection, copy/paste, smart guides, distribute, z-order commands and screen floating are deferred. Multi-selection move, duplicate and align-left are present. Rotation handle uses horizontal drag delta in degrees, not an angular pointer gesture.
- The chart shows recent motor speed only. CSV is a recent bounded snapshot with sample-relative time; it is not continuous logging with wall-clock timestamps, quality/catalog epochs or recovery.
- Native saves are atomic replacements, not autosave/recovery sessions. Unsaved-change prompts are not implemented. Runtime state is hosted by the main frontend; durable Rust session ownership is a later milestone.
- Only the built-in `mock-motor` catalog is simulated. No embedded connections, discovery, ELF/DWARF, firmware, hardware writes or device transport exist.
- The generated Windows executable is an unsigned development/debug build. Signing, notarization, release installers and production distribution validation remain open.
