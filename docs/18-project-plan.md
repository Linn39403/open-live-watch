# Requirements, software design and delivery plan

Revision: 2026-10-10. Owner: project architect. This is the current implementation plan for Open Live Watch. The repository is public and original work is MIT licensed. No completion dates are promised before the unresolved platform/design spikes are measured.

## Product objective and scope

Build an original engineering dashboard and runtime inspection tool with a light µC/Probe-like editor workflow. Users create their own projects, freely arrange original vector instruments, configure typed data bindings, operate controls and plot data. Windows, macOS and Linux are equally required. The first milestone uses offline sources only; embedded-device integration begins after offline acceptance, not as a hidden dependency of the designer.

The product baseline is [requirements](03-product-requirements.md), [mandatory designer/platform behavior](14-designer-and-platforms.md) and [acceptance tests](08-validation.md). Our code and artwork must be independently authored. Legacy Micrium formats, protocols and assets are not assumed compatible.

## Current baseline and evidence

Application implementation baseline: `5453414` (configurable offline sources, provider contract and graphs). Repository visibility/documentation baseline: `6677eed`. Evidence is dated; future commits must refresh this section when behavior changes.

| Area | Current behavior | Status and limit |
|---|---|---|
| Project creation | Named blank document, optional motor example, native validated atomic save/open, replacement Save/Discard/Cancel | Windows GUI verified; application-close prompt/recovery and multi-screen editing remain open |
| Freeform instruments | Eight scalar kinds plus graph; arbitrary move/resize/rotate, multi-select move, duplicate, align-left, undo, snap/zoom and keyboard nudge | Implemented subset; grouping, marquee, copy/paste, full alignment/z-order and smart guides remain open |
| Appearance | Original SVG/CSS faces, neutral/natural defaults, per-element preset/custom colors and gauge needle color | Windows and automated evidence; full accessibility/DPI audits remain open |
| Sources/bindings | Inline number/boolean variables, constant/manual or sine/ramp/toggle; source-qualified mapping, units, rate and authoritative permissions | Offline only; no ELF resolver or external connection |
| Provider protocol | Validated v1 configure/catalog/sampleBatch/write/writeResult; epochs, catalog/command revisions, quality and coherent simulation timestamps | Implemented offline boundary; binary device protocol remains a draft |
| 2D graph | One-series time or coherent XY, transforms/units/colors, auto X and optional manual Y, retained capture on Stop | 600-frame bounded history; no multi-series, durable generic log, triggered scope or spike-preserving min/max decimation |
| Native panels | Edge docking and floating views sharing one main-window worker/session | Windows focused evidence; full layout tree, tabs/splits/auto-hide, monitor/DPI restoration and screen floating absent |
| Platforms | CI configured for Windows/macOS/Linux; Windows native smoke | macOS/Linux actual interactive runtime unverified |

Accepted focused slice: 54 frontend tests, 6 Rust tests, production build, package validation, Windows optimized executable build, independent review, and Windows custom-source/gauge/control/time/XY/native save/reopen workflow. See [run guide](16-offline-run-guide.md) and [review report](reviews/offline-milestone.md).

Historical cross-platform CI passed at `efda006` in [run 38030575706](https://github.com/Linn39403/open-live-watch/actions/runs/38030575706). At this revision, runs for `5453414` and `6677eed` are still in progress; this document does not claim their success. Builds never substitute for native runtime evidence. M0 and M1 remain open.

## Requirement traceability

Requirement identifiers R01–R10 are defined in [product requirements](03-product-requirements.md). The AC identifiers refer to the complete gates, including requirements beyond today's implemented subset.

| Requirement | Design/contract | Milestone | Relevant acceptance |
|---|---|---|---|
| R01 All three platforms | Portable Tauri core, native services and OS-specific packaging | M0/M1/M8 | AC14 plus platform matrix |
| R02 Reference-close light editor | Original vector system and mandatory workspace organization | M1 | AC16, visual/contrast/DPI review |
| R03 Designer freedom | Geometry command model and versioned native dock layout tree | M1 | AC01, AC15 |
| R04 Independent projects | Workspace schema, document lifecycle and native file service | M1 | AC02, AC14 |
| R05 User colors/original assets | Instrument appearance settings and provenance | M1 | AC02, AC16 |
| R06 Configurable data binding | Provider catalog, typed mapping, quality, permissions and write results | M0/M1; richer types M2 | AC04/06 subsets now; full typed/input gates later |
| R07 2D graphs | Coherent sample buffer separated from SVG rendering | M1; richer views M4/M6 | AC07 subset now; performance/decimation still open |
| R08 Shared interface/protocol | Provider v1 and future device-adapter bridge | M0; wire codec M5 | Protocol regression tests; AC09 for actual device service |
| R09 Offline first milestone | Inline sources, worker engine and optional example | M0/M1 | Complete offline journey with no device required |
| R10 Open source and implementation handoff | MIT repository, original assets, docs and evidence | Every milestone | Link/schema/provenance checks and reviewer sign-off |

## Software design

Use Tauri 2 with Rust native services and React 19/TypeScript UI. The working source map and future symbol/transport architecture are in [software architecture](04-architecture.md). Keep one shell and one portable workspace format.

Four boundaries govern implementation:

1. **Document boundary:** versioned declarative workspace. Validate schema and semantic references in the frontend and Rust native file boundary. Keep user-machine docking/window settings separate from portable screen geometry. Opening a file performs no script execution or device connection.
2. **Provider boundary:** every element resolves `(sourceId, symbolPath)` against a typed catalog. Scalar instruments and graphs consume the same quality-aware samples; controls use the same permission/type/range checks. The [v1 provider contract](17-provider-and-graph-contract.md) is executable offline. The [OLW1 device wire draft](06-target-protocol.md) is a future adapter contract.
3. **Session boundary:** main-window document authority and a single acquisition worker currently coordinate all floating views. Epoch, catalog revision, command revision, monotonic sequence/time and correlated operation IDs reject stale or replayed data. Future real-device I/O and durable ownership move to Rust through a tested migration; widgets remain transport-independent.
4. **Rendering boundary:** original SVG/CSS instruments and graph rendering read accepted samples. Rendering does not acquire data. Capture buffers, generic logging and display decimation remain separate so display changes cannot silently discard logged samples.

Record a design decision before changing persisted formats, protocol meaning, runtime ownership, docking-library choice or adapter capabilities. Include alternatives, compatibility impact, failure behavior, chosen option and evidence. An ADR is needed for the complete docking tree, durable session migration, bounded monotonic write IDs, generic logger and real-device adapter selection.

## Milestones and exit gates

Milestone IDs M0–M8 retain the existing backlog identities. M0/M1 were developed as a vertical slice; their broad exit gates are not yet complete. M1 is the first user milestone, with no embedded device interface.

| Milestone | Status | Scope | Dependencies | Exit gate |
|---|---|---|---|---|
| M0 Foundation and platform proof | Partial | Workspace/provider contracts, original baseline vectors, validated offline engine, portable build/native window spike | Current baseline | Three-platform build and native runtime spike, contract/codec coverage appropriate to supported types, failure handling and recorded stack decision |
| M1 Complete offline designer | Partial; next delivery | New projects, complete freeform editor/docking, source/binding controls, graph/logging, persistence/recovery, accessibility and offline runtime | M0; overlap allowed for current closure work | Full offline journey on all three OSes; AC01/02/06/07/11 applicable offline behavior, AC14/15/16; no hardware dependency |
| M2 ELF and symbol binding | Planned | Offline ELF/DWARF type/path resolution, qualified identities, compiler fixtures and catalog reload | Accepted M0/M1 | AC03; supported exact types and inverse mappings tested; ambiguity/unsupported locations explicit; no device required |
| M3 First debug adapter | Planned | Selected board/probe/core, Rust I/O, capabilities, running-firmware memory reads and controlled writes | M2 and M1; durable session design | AC05/06 on named hardware; no connect-side halt/reset/flash; unplug/reconnect and host/probe support matrix |
| M4 Engineering views | Planned | Arrays/multi-series plots, SVD-aware registers, memory view, ranges and advanced logger predicates | M2/M3 for device views; offline plots can follow M1 | AC07/08/11 as applicable; no unsafe MMIO access or logging loss hidden by decimation |
| M5 Original target service | Planned | Freeze binary protocol, golden vectors, C99 bounded firmware codec, UART/CDC/TCP and trace/commands | Accepted M1; durable adapter ownership and protocol review | AC09 in codec/loopback and actual firmware; bounded framing, target policy and uncertain-write handling |
| M6 Target oscilloscope | Planned | Frozen scope ABI, target sampling/trigger/buffers, coherent host transfer, cursors/stats/export | M5 or reviewed debug-mailbox alternative | AC10 on actual signals with effective clocks, CPU/RAM cost and dropped/blind-time evidence |
| M7 Extensions | Planned | RTOS snapshots, limited scripting/formulas, MQTT/HID and optional integrations | Relevant M3–M6 capabilities | AC12/13 per extension; permission/provenance/license review |
| M8 Production distribution | Planned; development packaging starts now | Installers/bundles, signing policy, migrations/recovery, performance/accessibility and release documentation | M1 for offline release; M2/M3 for hardware release | Actual installation/runtime across declared OSes, versioned release evidence and reproducible packages |

An offline release can close M0/M1 and its M8 distribution subset without completing M2–M7. Hardware features require their own release matrix and cannot retroactively prove offline or device acceptance.

## Next implementation batches

Execute these in dependency order; independent platform checks and architecture spikes may overlap. Each row becomes a bounded coding-agent task with explicit tests and review, rather than a broad request to finish every remaining feature.

| Task | Deliverable | Dependency | Pass condition |
|---|---|---|---|
| P01 Platform and acceptance inventory | Current-commit CI results, declared OS/architecture baseline, reusable native smoke checklist and gap matrix | None | Each result tied to commit/environment; unavailable hosts explicitly unverified |
| P02 Dock layout design/spike | ADR, versioned split/tab/auto-hide/float tree, monitor/DPI restore model; demonstrate candidate native behavior on all OSes | P01 | Tabs/splits/float/redock/Esc/restore work with one shared acquisition session; choose stack/library from evidence |
| P03 Document/editor completion | Multi-screen navigator, geometry command parity, grouping/marquee/copy-paste/z-order/align-distribute; persisted lock semantics | P02 contract; canvas work may start independently | AC01/15 editing tests at varied zoom/DPI, one undo per gesture, screen data and selection remain correct |
| P04 Lifecycle and recovery | Close Save/Discard/Cancel, cancellation/failure behavior, autosave/recovery policy and portable migration fixtures | Current file boundary | Cancel preserves project; crash/corrupt write cannot silently destroy prior saved data; native dialog/Unicode tests |
| P05 Session and controls | ADR for bounded monotonic operation counters; remove practical 128-write cap; define momentary/repeat cancellation; durable ownership migration plan | Provider v1 | Long control interaction stays bounded; no replay/retry/stale writes; AC06 offline input semantics tested distinctly from current toggle |
| P06 Generic acquisition logging | Source-qualified timestamp/quality/units export and continuous bounded logger; decimation independent of recording | P05 lifecycle contract | All configured sources log correctly; slow/full sink and quality gaps explicit; no fake wall-clock/target timing |
| P07 Plot and accessibility completion | Shared multi-series/axis settings as needed, spike-preserving decimation, keyboard labels/focus, contrast/DPI/reduced-motion checks | P06 sample/log model | AC07/11 separation; peaks and gaps preserved; colors never sole state signal |
| P08 M0/M1 acceptance and offline release | Measured 200-widget/100-binding targets, one-hour bounded run, faults, all-platform native journeys and user-facing packages | P01–P07 | Required gates pass or release explicitly withheld; architect/reviewer record evidence and remaining non-M1 work |
| P09 ELF resolver vertical slice | Compiler-built DWARF4/5 fixtures and supported static symbols with reload diagnostics | Accepted M0/M1 | AC03 and stale binding/revision tests before target I/O |
| P10 First embedded interface | Select real transport/board/probe, freeze adapter contract, implement Rust I/O and test | P09; adapter/durable-ownership ADR | Named hardware evidence, no halt/reset/flash side effect and typed guarded writes |

Do not implement P09/P10 as part of the current documentation request. The user's offline-first scope remains in force. Board/probe selection and signing credentials are inputs to future work, not assumptions or blockers to finishing documentation/offline software.

## Team and review process

The architect maintains requirements, contracts, dependencies and acceptance decisions. The coding agent implements application code in a bounded slice and supplies meaningful tests, build results and runnable artifacts. The reviewer independently checks behavior, protocol/persistence boundaries, source compatibility and evidence. The architect then runs the relevant GUI journey and integrates reviewed changes. This preserves the user's requested architect/coder/reviewer separation.

For each task: cite requirement IDs and AC subsets; describe final behavior and serialized/API changes; define failure/undo/Stop handling; implement with original assets; run relevant checks; obtain independent review; verify actual UI where relevant; update traceability and commit evidence. Passing a subset must not close a broader AC or milestone. Estimate effort only after spikes identify platform constraints; record estimate ranges and dependencies, not invented calendar deadlines.

## Release and change control

A milestone closes only when its required tests, native workflows, documentation and unresolved-risk decisions are recorded. Use [validation](08-validation.md) for full tests and [backlog](09-backlog.md) for task selection. Preserve legacy workspaces unless a versioned migration is explicitly designed and tested. Keep unsupported types/providers visibly unavailable, never plausible zero readings. Do not add credentials, copied proprietary assets or vendor-only requirements to the portable core.

Next priority is M0/M1 closure with P01–P08. Current unknowns are actual macOS/Linux window/compositor/DPI behavior, complete docking-library suitability, measured performance, logging failure policy and durable Rust session migration. Later hardware unknowns include the exact probe/target/driver matrix and real timing/side-effect behavior. Resolve them with evidence at their milestone gates.
