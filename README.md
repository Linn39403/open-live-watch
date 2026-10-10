# Open Live Watch

An independently designed, open-source embedded dashboard and runtime inspection tool inspired by the workflows of Micrium µC/Probe.

**Status: runnable first offline milestone.** Tauri 2/Rust hosts a React/TypeScript freeform designer with worker-based configurable offline sources and an optional motor demo. The default UI uses a light ribbon, explorer/toolbox, grid/ruler canvas, symbol browser and inspector. Original gauges and controls can move, resize, rotate, bind, undo/redo and save/reopen. Native panel floating shares one simulator session. No embedded-device integration is implemented. The repository is public; original material is MIT licensed.

## Run the application

Install Node.js 24 and Rust stable (verified here with Rust 1.99). Desktop builds also require the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/): Windows MSVC build tools/WebView2, macOS Xcode command-line tools, or Linux WebKitGTK 4.1 development libraries.

```sh
npm ci
npm run desktop
```

Browser preview: `npm run dev`, then open `http://127.0.0.1:1420`. Native file dialogs and native floating windows require the desktop application. Build a desktop executable using `npm run desktop:build -- --no-bundle`; run model checks using `npm test` and native checks using `cargo test --manifest-path src-tauri/Cargo.toml`.

The application starts with a blank project. Choose **File → New project** to name a new instrument screen, then click or drag toolbox instruments onto the canvas and edit their geometry and colors in Properties. Unbound instruments show labeled Design previews so you can build a layout without a device. **File → Open motor demo** explicitly opens the optional simulator example. New/Open/demo replacement offers Save, Discard or Cancel when your project has changes.

Instrument defaults use neutral physical faces with blue gauges/sliders, teal numeric readouts, amber LED/buttons, slate blue switches and red thermometers. Saved custom colors take precedence; Properties → Restore default colors restores that instrument's defaults. Older projects without color overrides intentionally adopt the new palette without migration.

Follow [the offline run guide and implementation limits](docs/16-offline-run-guide.md). Windows native build/launch and automated checks are recorded there. macOS/Linux have CI build configuration but their actual runtime behavior remains unverified. This is a bounded milestone, not complete AC14/AC15 support.

To feed your own screen, choose **Design → Configure data sources**, add an offline source and typed variables, and Apply. Select an instrument, then choose its **Properties → Binding → Source / variable**. Set display limits, units, gain/offset, refresh interval and permitted control writes there. Add a **graph** from the toolbox: its ordinary Binding is Y; choose Time series or XY in the 2D graph settings and configure **Graph X** for XY. Run samples your configured sources; Stop retains the capture. The [provider/GUI protocol v1](docs/17-provider-and-graph-contract.md) defines the common interface for instruments and plots. Hardware/network transports are future adapters.

## Start here

Current requirements, software design, milestone status and next implementation batches: [project delivery plan](docs/18-project-plan.md). The Windows offline prototype is accepted as a bounded slice; complete M0/M1 platform/editor acceptance remains open.

1. Read [the research report](docs/01-research.md) and [feature matrix](docs/02-feature-matrix.md).
2. Follow [product requirements](docs/03-product-requirements.md), [architecture](docs/04-architecture.md), and [data contracts](docs/05-data-contracts.md).
3. Implement milestones in [the backlog](docs/09-backlog.md), using [the validation plan](docs/08-validation.md).
4. Use the original assets described in [the vector design system](docs/07-vector-assets.md).
5. Begin the next agent session with [the implementation prompt](docs/10-agent-handoff.md).

Mandatory design direction: [cross-platform freeform designer](docs/14-designer-and-platforms.md).

Additional references: [target firmware and protocol](docs/06-target-protocol.md), [sources and unresolved questions](docs/11-sources-and-gaps.md), and [local observation log](docs/12-observation-log.md).

Validation scope and limitations: [package verification](docs/13-package-verification.md).

## Deliverables

- Evidence-tagged analysis of Professional 4.8.2.0 and installed V4.8 manuals.
- MVP and later feature requirements with acceptance criteria.
- Windows, macOS, and Linux desktop architecture with a freely dockable GUI designer.
- Versioned workspace schema, mock symbols, sample dashboard, and typed API contract.
- Original SVG icons, instruments, industrial symbols, and dashboard concept.
- Reproducible asset generator and repository validation script.

The original program's manuals, screenshots, executables, libraries, artwork, example projects, and firmware are not distributed here. Product names identify references and imply no affiliation. No binary disassembly or proprietary source extraction was performed. Legacy project/protocol compatibility is not claimed.

## Validate the specification package

Run `python tools/validate.py` from the repository root. Run `python tools/generate_assets.py` to regenerate the original vector assets. These scripts use only Python's standard library. View `assets/preview.html` in a browser for the asset gallery.

## License

Original repository content is licensed under [MIT](LICENSE). External dependencies and device definition files retain their respective licenses; audit them before incorporation. See [asset provenance](assets/PROVENANCE.md).
