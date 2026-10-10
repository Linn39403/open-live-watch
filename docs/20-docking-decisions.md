# ADR 02: Portable docking tree and native views

Status: accepted architecture; runtime evidence pending. See [designer requirements](14-designer-and-platforms.md) and [the project plan](18-project-plan.md).

## Decision

Implement an original bounded docking tree rather than introduce another UI dependency. This allows the existing Tauri native floating views to retain one authoritative session while adding split panes, tab stacks, edge placement, auto-hide, tab reorder and named layouts. The layout is machine-specific application state, separate from portable project geometry.

Layout version 2 has root, autoHide, hidden and floating fields. The root is a DockNode: a split with id, horizontal/vertical axis, ratio, first and second children; a tabs node with id, panel IDs and active panel; or a canvas node with id. Exactly one main canvas leaf is required. autoHide contains arrays for left, right, top and bottom edges. hidden is an array of panel IDs. Floating entries contain panel, optional logical bounds {x,y,width,height} and optional monitorHint.

Panel identities are the four editor views plus screen:<screenId> for independent native document views. Every view identity occupies one layout location. Validate IDs, active tabs, duplicate placement and screen existence. Bound tree depth to 8, node count to 32, floating views to 16 and named layouts to 8. Split ratios stay between 0.1 and 0.9. Normalize the prior version 1 edge layout into the version 2 tree; reject malformed version 2 input and offer the default layout without changing project content.

A native screen view retains its requested screen identity while the main window navigates elsewhere. View commands include the actual screen ID and epoch; authority validates them before applying changes. All views share one worker, document, write queue and logger. Floating a graph does not create another acquisition pipeline or independent writable copy.

## Interaction and native lifetime

Provide title-bar drag targets for every docking edge, splits and tab stacks, visible previews, tab reorder, auto-hide activation and explicit redock. Escape cancels a drag to its starting layout. Closing an editor panel hides its view. Closing a floating screen returns/hides the view without deleting its screen. Deleting a screen invalidates its stale floating view with a visible explanation. Restore Default Layout affects views only; it leaves widgets, bindings and source state intact.

Persist native floating logical client size and work-area-relative monitor-local logical offsets with a stable monitor hint. Restore physical desktop position using the selected monitor scale and work area; do not divide absolute desktop coordinates by different DPI scales or use outer dimensions as client size. Normalize decorations using the creation monitor scale, and capture the monitor using greatest client/work-area intersection. Validate finite coordinates and minimum dimensions. Restore into an available monitor work area and clamp offscreen windows; monitor removal and DPI changes must recover to an accessible position. Treat a compositor-controlled position as an allowed platform limitation with evidence, rather than repeatedly forcing a location. Persist named layouts as local settings, independent of project save/recovery content.

## Alternatives and acceptance

Keeping only edge comboboxes would not provide tab/split/reorder/auto-hide behavior. HTML-only floating cards would not satisfy native multi-monitor movement. A third-party docking package could reduce interaction work but would still require native ownership and persistence integration. Reconsider that choice if the original tree cannot satisfy the required gestures; do not silently downgrade the requirement.

Test malformed trees, duplicate panels, excessive depth/counts, invalid ratios, version 1 migration, removed screens, named layouts and monitor bounds. Verify actual Windows title-bar drag/Escape, tab/split/reorder, all four docking edges, auto-hide, native float/redock, save/relaunch layout and shared Run/write behavior. Record missing second-monitor or monitor-removal evidence explicitly. macOS/Linux interactive checks are deferred by the owner; portable CI remains required. A passing pure tree test alone cannot close AC15.
