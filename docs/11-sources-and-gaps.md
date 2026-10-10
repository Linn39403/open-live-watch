# Sources and unresolved questions

Access date: 2026-10-10. Source claims are paraphrased; external documents are not bundled.

## Primary reference evidence

- Local installation: `D:/Micrium/uC-Probe/4.8.2.0/uC-Probe.exe`, Professional 4.8.2.0. UI observations in docs/12-observation-log.md.
- Local `Help/uC-Probe-UsersManual.pdf`, V4.8, 600-uC-Probe-015 (2019). Page citations in research and matrix.
- Local `Help/uC-Probe-TargetManual.pdf`, V4.8, 600-uC-Probe-Target-010 (2019). Generic communications pp.10-19, scope pp.90-95, FreeRTOS pp.96-101.
- [Micrium documentation landing page](https://micrium.atlassian.net/wiki/spaces/ucprobedoc/overview): identifies product and PDF guide availability.
- [Silicon Labs runtime debugging discussion](https://www.silabs.com/whitepapers/uncovering-real-time-bugs-with-specialized-rtos-tools): supports graphical live variable read/write and J-Link/target distinctions.
- [Silicon Labs tools lab](https://www.silabs.com/documents/public/training/wireless/micrium-os-tools-lab-guide.pdf): independently documents toolbox-to-screen workflow.

## Implementation references

- [DWARF standards](https://dwarfstd.org/download.html) and [DWARF 5 description](https://dwarfstd.org/dwarf5std.html): implement against the specification and compiler fixtures, not assumptions from UI names.
- [Arm SVD overview](https://arm-software.github.io/CMSIS_5/latest/SVD/html/index.html) and [register metadata](https://arm-software.github.io/CMSIS_5/5.8.0/SVD/html/elem_registers.html): registers, fields and read/write side effects. Device files have individual licensing requirements.
- [probe-rs quickstart](https://probe.rs/docs/library/quickstart/): enumeration and memory operations; examples include actions inappropriate for automatic live-watch connect.
- [OpenOCD commands](https://openocd.org/doc/html/General-Commands.html): optional memory access adapter reference.
- [Tauri](https://v2.tauri.app/), [gimli](https://docs.rs/gimli/latest/gimli/), [object](https://docs.rs/object/latest/object/): proposed desktop and parser building blocks. Versions must be pinned and integration proven.
- [Infineon mtb-oscilloscope](https://github.com/Infineon/mtb-oscilloscope): public firmware-side oscilloscope reference. No source incorporated here. If adopting any code, inspect LICENSE/EULA and file-level provenance first. Default plan remains original firmware.

## Research limits and follow-up checklist

| Question | Current evidence | Required next evidence |
|---|---|---|
| Which board/probe is available? | UI has a configured target only | User-selected hardware and actual attach test |
| Exact successful ELF formats/compiler support? | Manual versions disagree on DWARF coverage | Compile/load fixture matrix by toolchain/version |
| Runtime rates and nonintrusive access? | Documented architecture, not measured here | Heartbeat/latency/CPU tests per target/probe |
| Shared debugger connection? | Documented for specific integrations | Two-client test and adapter ownership contract |
| Default button press/release and repeat details? | Manual semantics read, runtime not exercised | Mock/real binding and focus/disconnect tests |
| Legacy workspace schema/import fidelity? | Import/export described | Newly authored project save/roundtrip and schema study |
| Full oscilloscope UI and capture behavior? | Manual read; existing scope not run | Instrumented reference board capture and new-tool comparison |
| SVD/SFR/CDF edge cases? | Imports described | Licensed fixture set and side-effect tests |
| RTOS version/configuration coverage? | Manual names capabilities | Versioned firmware diagnostic contract and exact test builds |
| Scope protocol interoperability? | Not researched or claimed | Separate scoped compatibility project if needed |
| UI skins and variants all exercised? | Toolbox inspected; one gauge's dialogs inspected | Original widget-by-widget authoring and runtime review |

The report is comprehensive at the subsystem/specification level, not an exhaustive empirical test of every reference feature. No source decompilation, raw proprietary protocol capture, actual target writes, scripts or HID actuation were performed. Findings can be extended without treating proposals as observed behavior.
