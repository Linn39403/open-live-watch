# Original vector asset system

All supplied vectors are new geometry authored for this repository by `tools/generate_assets.py`. None are extracted, traced or recolored from the reference program. MIT license and provenance are in assets/PROVENANCE.md.

## Visual direction

Readable flat engineering instruments: dark navy surfaces, pale text, blue accent, distinct semantic green/amber/red, restrained borders. Light mode swaps surfaces/text while keeping channel identity stable. Avoid reproducing Micrium branding, layouts at pixel level, glossy skins or distinctive icon silhouettes. Native controls and text are preferable to faux instrument decoration for inputs.

Icon geometry: 24x24 viewBox, 2-unit strokes, rounded caps/joins, currentColor for primary strokes, no embedded fonts/bitmaps/scripts/external URLs. Larger instruments use 240x180 or 240x240 viewBoxes. IDs in instantiated components must be unique if gradients/clips are added later. Labels are text and remain editable/accessibility-readable.

## Included library

Toolbar: connect/disconnect/play/stop/save/open/undo/redo/settings/search/lock/unlock/add/chart/scope/memory/log/terminal/export/align/grid. Instruments: radial gauge, linear gauge, thermometer, tank, compass, numeric display, LED, slider, switch, push button, line chart. Industrial symbols: motor, pump, valve. Dashboard concept assembles original instruments with an inspector and symbol table. `assets/preview.html` is a standalone asset gallery, not the final application.

These SVGs are visual starter assets. They do not yet bind data or implement interaction. The coding agent must turn instruments into parameterized accessible components: min/max/value, gain/offset/unit, bands, title, precision, quality and theme. Toolbar assets can be consumed directly.

## Geometry rules

Radial gauge: clamp displayed position to range; `angle=start+sweep*(value-min)/(max-min)`. Use SVG arc paths; define large-arc/sweep flags intentionally. Reject max<=min. Linear gauge/slider uses the same normalized fraction; orient axes explicitly. Out-of-range values retain their numeric reading and show a textual overflow marker.

Gauge ticks generated from nice intervals, with sufficient space for labels at 100% and 200% DPI. Numeric display uses tabular figures and a raw-value tooltip. LED includes label/state text so color is not the sole cue. Compass uses clockwise degrees with 0=N. Tank fill is clipped to internal bounds; do not imply actual vessel volume without a configured conversion model.

Charts use a semantic model; static SVG line chart is only a placeholder for the Canvas renderer. Channel colors: #60A5FA, #34D399, #FBBF24, #F472B6, #A78BFA, #22D3EE, #FB923C, #E2E8F0. Add line dashes and named legends for accessibility.

## Review gates

XML parses; positive viewBox; no active/external content; icon visibility at 16/24/32 px; contrast in light/dark; no clipped labels at 200% DPI; keyboard alternatives; stale/unresolved/error states; pointer motion with animations reduced. Keep all newly authored assets in the provenance manifest. Do not use ImageGen for these code-native vectors.
