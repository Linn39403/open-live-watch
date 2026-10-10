# Mandatory designer and platform requirements

Owner clarification, 2026-10-10: the tool must run on macOS, Windows and Linux; the initial visual design was too different from µC/Probe; editing must allow free movement like the Visual Studio GUI designer. These requirements supersede the earlier Windows-first and dark card-dashboard proposals.

## Required appearance

Default light engineering workspace: File/Design/View ribbon with grouped commands, Workspace Explorer above an accordion/icon toolbox on the left, large white freeform canvas with rulers/grid, bottom Symbol Browser and status strip. Show a contextual toolbar and resize/rotation handles around selected controls. Properties can appear as a dockable inspector or a focused dialog. Instruments use original glossy/beveled faces, needles, colored range bands, numeric readouts and familiar physical control shapes. Use original artwork; no copied Micrium assets or branding.

The static concept is a visual target, not a working editor. Precise dimensions, fonts and ribbon implementation can adapt to each OS and accessibility needs while retaining the same workflow and overall organization. Dark mode is optional after the default direction is correct. Do not replace instruments with fixed dashboard cards.

## Two independent kinds of free movement

**Designer objects:** arbitrary x/y placement within a screen, overlap and z-order, resizing from eight handles, rotation, marquee/multi-selection, grouping, align/distribute, optional grid and smart guides, keyboard nudge, copy/paste, duplicate, undo/redo. Snapping can be disabled or temporarily bypassed. Dragging must remain smooth while crossing the viewport edge with autoscroll. Stored positions are canvas coordinates, independent of zoom, DPI and OS window dimensions.

**Editor panels/documents:** drag title bars to dock left/right/top/bottom, split panes, tab stacks, reorder tabs, auto-hide, undock into native floating windows and dock back again. Explorer, Toolbox, Symbol Browser and Properties are rearrangeable; screens may also float. Native floating windows can move to another monitor, outside the main application's bounds. A draggable HTML panel constrained inside the main window is insufficient.

Dock previews show drop targets and the destination area. Esc cancels a drag without changing layout. Closing a panel hides its view; it does not delete project data. Closing a floating document returns it to the workspace or hides the view according to a documented rule, never destroys the screen. Provide View -> Restore Default Layout.

## Geometry and selection model

Keep document widget geometry separate from the editor's dock layout. Pointer events map screen -> window -> viewport -> canvas coordinates; preserve the grab offset so objects do not jump. Handle pointer capture/loss and OS window movement during drags. Snap thresholds are measured in screen pixels and transformed to canvas units. A completed gesture creates one undo command; Esc restores the gesture's start geometry. Selection is ID-based and survives property refresh. Locked controls can be selected but cannot be moved/resized until unlocked.

Group transforms preserve child positions. Bounds include rotation; inverse transforms support hit testing. Selected handles and context toolbar stay readable across zoom. Inputs modify target values in Run mode and move objects in Design mode, with clear mode feedback. Layout lock is separate from target write authorization.

## Dock layout persistence

Store a versioned layout tree: split nodes (orientation/ratio), tab stacks (panel IDs/active tab), auto-hide edges and floating native windows (logical bounds/monitor hint/panel tree). Keep machine-specific window geometry in user settings, independent of portable firmware/project bindings. Allow named layouts and resetting layouts without changing screen content.

On restore, validate panel IDs/tree depth/ratios, discard obsolete entries, move offscreen windows onto an available monitor and clamp minimum dimensions. Handle monitor removal and DPI changes. On macOS, use the available work area and native window behavior; on Linux, do not assume absolute window placement is always allowed under Wayland. Float/dock must still work if the compositor controls the final position.

Every window routes commands/events through one application session and shared document state. Floating a chart must not open a second hardware connection, duplicate acquisition subscriptions or cause double writes. Publish window/view lifetime and ownership rules.

## Supported platform contract

Mandatory hosts: Windows 11 x64, macOS Apple Silicon and Intel where the selected framework/toolchain supports the release target, and Linux x64 on a declared Ubuntu LTS baseline. Additional architectures/distributions may follow. Explicitly record minimum OS versions and dependencies after M0; these are proposed initial test baselines, not current support claims.

Equivalent functionality on all three: designer, docking/native float, simulator, ELF/custom-symbol parsing, projects, charts, logging, original vector rendering and keyboard interaction. Use OS-appropriate shortcuts (Command on macOS, Ctrl elsewhere), native file dialogs and path conventions. Case sensitivity, separators, Unicode paths, serial device naming, filesystem watchers and permissions must be handled portably.

Debug/USB/serial adapters require a host x probe x target matrix. Vendor-only integrations may remain optional and platform-specific, visibly marked. No Windows-only DLL, registry setting, COM/Excel automation or DirectX dependency may be required for the core. RTOS firmware remains host-independent. For Linux record udev/permissions and X11/Wayland behavior; for macOS record USB access, packaging/signing and architecture; for Windows record USB driver/backend requirements.

CI builds and tests each OS. Release packages: Windows installer/portable package, macOS application bundle (DMG or ZIP), Linux declared package/AppImage strategy. Unsigned development builds are acceptable during implementation but must be identified; do not claim signing/notarization without evidence. A Linux build on Windows does not prove Linux runtime behavior.

## Acceptance gates

**AC14 Cross-platform:** install/launch on each declared OS; open identical sample workspace; run simulator; edit/save/reopen; log identical typed data; verify Unicode paths and shortcuts. Record runtime evidence on all three. Missing access to a host is an explicit unverified gate, not permission to drop that platform.

**AC15 Designer freedom:** drag each main panel through all docking edges, tab/split/reorder/auto-hide, float to a second display, redock, save/relaunch layout and restore defaults. Move/resize/rotate overlapping widgets with snap off/on and zoom at 50/100/200%; verify undo/Esc, grouped selection and keyboard nudge. Remove a monitor and verify recovery. A floating chart retains the same shared data session and emits no duplicate writes.

**AC16 Visual direction:** review the default light UI against the observed reference organization: grouped ribbon, explorer/toolbox, white ruler/grid canvas, bottom symbol table, contextual controls and original instrument skins. The earlier dark-card concept must not be treated as approved. Implementation screenshots must be reviewed before broad widget skin production.
