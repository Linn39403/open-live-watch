# Acceptance and validation

Current package validation checks schemas/examples/assets/links. Application and hardware acceptance below is **planned** and has not passed yet.

| ID | Test and pass condition |
|---|---|
| AC01 | Create two screens, insert five widget types, drag/resize/multi-select/align/lock; undo returns exactly to prior geometry; zoom does not change stored coordinates. Keyboard insertion/nudge works. |
| AC02 | Save/reopen preserves IDs/bindings/styles; example validates; reject future versions, invalid ranges/duplicate IDs/dangling sources; import collision remaps IDs; corrupt save cannot destroy prior file; path traversal rejected. |
| AC03 | Parse newly built DWARF4/5 fixtures with duplicate names, typedefs, nested arrays, packed structs and bitfields; compare offsets against compiler output and known bytes. Reload ELF relocation preserves qualified binding or reports ambiguity; no stale writes. Footprint merges overlap. |
| AC04 | Decode both endian orders and integer boundaries including u64 above 2^53; floats/NaN/Inf/negative zero; validate inverse scales and rounding. Read-only/type mismatch rejects input; unresolved is never rendered as zero. |
| AC05 | On a named board/probe/driver/firmware version, connect and poll while heartbeat continues; prove no reset/halt/flash. Unplug/replug increments epoch and rejects queued old commands. Second-client ownership/coexistence is explicitly tested or unsupported. |
| AC06 | Slider release gives one commit; repeat cancels on focus loss; push sends press/release while connected; timeout is unknown without resend; stop/disconnect prevents queued writes; target deadman tested where enabled. |
| AC07 | Feed sine/step/noise/constant/spike data; strip/sweep/XY/array modes and decimation preserve model correctness; buffer bounded; 200-widget editor and chart frame-time benchmark recorded; numeric labels remain readable at 200% DPI. |
| AC08 | SVD read-clear and W1C fixtures do not undergo unsafe polling/RMW; reserved bits untouched; memory inspector obeys allowed range/block size. Readback failure remains explicit. |
| AC09 | Golden frames for COBS/CRC/stream fragmentation; malformed lengths/overflow/noise denied; target allowlist enforced; trace overflow visible; command bounds enforced; disconnect mid-write gives unknown. UART loopback plus real-board service tested separately. |
| AC10 | Trigger tests for rising/falling/flat signal, pretrigger percentages, holdoff, disabled channels, divider, single/repeated captures; host transfer never mixes generations; dropped frames/blind time visible; hardware ISR cost and effective rate measured. |
| AC11 | CSV rows preserve timestamp/quality/units and numeric precision; pause/start-stop predicates deterministic; disk full/slow sink/backpressure visible; one-hour simulator memory bounded; display decimation doesn't reduce logged data. |
| AC12 | Version/configuration-tagged RTOS diagnostics match known tasks/priorities/object states in a test firmware; corrupted links/size/count rejected; snapshots coherent or explicitly labeled approximate. |
| AC13 | Scripts require explicit run and cannot access unrestricted host/network/process APIs; MQTT/HID obey same write/session rules; credentials absent from workspace; table export roundtrip and external trace connector failure covered. |

## Test layers

Additional mandatory gates **AC14** (three-platform runtime), **AC15** (freeform designer and native docking/floating), and **AC16** (reference-close visual direction) are specified in [designer and platforms](14-designer-and-platforms.md). They are required for M1 acceptance, not later optional enhancements.

Unit/property tests: codecs, range math, path resolution, masks, interval coalescing, frame parser, trigger state machine. Golden fixtures: compiler-generated ELF/DWARF, authored SVD, protocol bytes and sample frames. Integration: simulator adapter through backend IPC to widgets/logger. UI tests: editor gestures, shortcuts, persistence, accessibility and stale/error presentation. Hardware tests: separate opt-in job with exact board/probe/configuration and waveform comparison.

Use fault injection for slow provider, missing responses, reordered completion, malformed files, firmware rebuild during write, clock wrap, queue overflow, disk full and lost target release. Avoid tests that merely assert a function returns the value the same implementation hardcodes.

## Evidence to commit per milestone

Command/environment, pass/fail, fixture identity, performance machine details, screenshots of original UI if helpful, hardware wiring/firmware build identity, and remaining limitations. A successful simulator run must never be reported as real-hardware compatibility.
