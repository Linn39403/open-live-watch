# Specification package verification

Date: 2026-10-10. Scope: documentation, declarative fixtures, original vectors and handoff. No application or firmware is implemented in this package.

- `python tools/generate_assets.py`: generated 36 SVGs and a standalone gallery.
- `python tools/validate.py`: passed initial workspace schema subset validation, three malformed-example rejection cases, binding-to-source and mock-symbol references, SVG XML/viewBoxes/active-content checks, and local Markdown links.
- Schema validator is a small implementation of the keywords used by this schema, not a general JSON Schema validator. A full Draft 2020-12 validator was unavailable in the bundled Python environment. The implementing agent should use a standard validator in the application build.
- Original SVG dashboard rendered to PNG and inspected. Chart composition was adjusted to keep text at its intended aspect ratio. Static vectors require subsequent interactive/component QA.
- Local application inspection: workspace, transport settings, selected gauge properties/ranges, and screen insertion menu. No target connection, Run operation, firmware write, script execution, or diagnostic capture performed.
- Research used the installed V4.8 user/target manuals plus linked primary documentation. No manuals or proprietary screenshots were committed.

Application acceptance tests AC01-AC13 remain planned. Do not confuse these package checks with implementation, performance or hardware validation.

## Owner-directed revision

The Windows-first and initial dark-card concept are superseded. All three desktop platforms and native dock/float/freeform editing are mandatory. Added AC14-AC16 and the detailed designer/platform contract. Replaced the dashboard concept with original light ribbon, dense left toolbox, white ruler/grid canvas, freely positioned instruments, property grid and bottom symbol browser. Generated assets and package validator passed again; revised concept rendered for visual inspection. Platform runtime and docking remain implementation gates, not verified functionality.
