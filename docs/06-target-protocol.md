# Original target protocol and firmware design

This is **OLW protocol v1 draft**, not the µC/Probe wire protocol. No legacy interoperability is claimed. Freeze this document with golden byte vectors before implementing M5.

## Two acquisition paths

Debug mode reads mapped memory through an adapter and needs no generic target communication task. Service mode implements OLW requests over UART/USB CDC or a length-delimited TCP connection. A UDP variant is deferred because fragmentation/reordering/duplicate-write behavior needs its own spec. The original reference's TCP/IP option uses UDP; our choice differs deliberately.

## Frame format

Binary fields, little-endian except the ASCII magic:

| Offset | Width | Meaning |
|---|---|---|
| 0 | 4 | ASCII `OLW1` |
| 4 | 1 | major version, 1 |
| 5 | 1 | kind: 0=request, 1=response, 2=event |
| 6 | 2 | opcode |
| 8 | 4 | request ID; nonzero for requests/responses |
| 12 | 4 | payload byte length |
| 16 | N | payload |
| 16+N | 4 | CRC-32/ISO-HDLC of header+payload, LE |

CRC parameters: polynomial 0x04C11DB7 (reflected 0xEDB88320), init/xorout 0xFFFFFFFF, refin/refout true; check `123456789` = 0xCBF43926. Stream receiver discards bad frames using bounded resynchronization; never trusts unbounded length. USB CDC/UART encode the entire frame with COBS plus zero delimiter; TCP uses the raw frame stream with length in the header. All negotiated maximums must be capped by compiled limits, default payload 4096 bytes.

Response payload starts with u16 status and u16 reserved zero, followed by opcode-specific body on success. Status: 0 OK, 1 unsupported, 2 bad length, 3 denied, 4 range, 5 alignment, 6 busy, 7 epoch mismatch, 8 internal. Unknown major version is rejected. Opcode IDs: 1 HELLO, 2 READ, 3 WRITE, 4 MASKED_WRITE, 5 TRACE_READ, 6 COMMAND, 16 SCOPE_CONFIG, 17 SCOPE_ARM, 18 SCOPE_STATUS, 19 SCOPE_FRAME_READ, 20 SCOPE_ACK, 21 SCOPE_STOP.

## Minimal payloads

HELLO request: u32 requested maximum, u32 feature mask. Response body: u64 boot/session nonce, u32 maximum payload, u32 capability mask, u8 address width, u8 target byte order (0 LE/1 BE), u16 reserved, u32 firmware identity length and UTF-8 identity. Firmware identity is optional empty, not invented proof of ELF match.

READ request: u64 session nonce, u64 address, u32 byte count. Response body: exactly byte count bytes. Count may not exceed negotiated frame capacity minus response overhead. WRITE request: nonce/address/count followed by exactly count bytes. Response body empty after successful application; denied reads/writes return no memory bytes. MASKED_WRITE adds width (u8: 1/2/4/8), seven zero bytes, u64 mask and u64 raw desired bits; apply only if provider can make the operation atomic relative to application access.

Control integers are always LE; returned raw memory preserves target byte order. Check address+length overflow, entire interval allowlist, alignment and maximum before copying. Arbitrary host-provided addresses must never bypass target policy. IDs are unique among outstanding requests; M5 supports one outstanding request to simplify bounded embedded implementations.

Reads may retry after timeout. Writes/commands never automatically retry. If a response is lost, report unknown; cached results or operation-token deduplication may be added in a future negotiated feature, but are not assumed in v1. A new boot nonce invalidates all prior requests. CRC detects corruption, not authentication. Service ports are intended for trusted local links; network deployment needs authenticated transport or a controlled gateway. No hardcoded passwords.

## Firmware service

C99 library with fixed-size buffers; no required heap, RTOS or vendor HAL. Separate codec, dispatcher, memory-policy callbacks, transport hooks, sampling engine and optional diagnostic snapshots. UART ISR only deposits bytes; normal context parses requests. Hooks provide read/write authorization, atomic update, critical-section entry/exit, clock, trace output and command dispatch. Do not use raw casts on unaligned target storage.

Compile-time switches disable writes, terminal, scope and diagnostics independently. Default deny outside explicitly configured readable/writable ranges. RAM and MMIO have different policies. Commands are application-defined target commands with bounded input/output; no host OS command execution.

## Scope ABI design to finalize in M6

Declare maximum channels/depth/sample types and actual sampling clock. Host negotiates channel bindings; unsupported type/bit is rejected. An application timer ISR invokes an original `olw_scope_sample()` at the declared interval; sampling never performs blocking I/O or allocations.

States: disarmed -> armed -> waiting-trigger -> capturing -> ready -> transferring -> acknowledged; continuous mode can begin capturing directly. Pre-trigger ring buffer, rising/falling threshold crossing, configurable trigger index, holdoff and sample divider. Reject changes while a frame is owned by the host; use frame ID/generation to avoid torn downloads. Prefer two buffers if continuous capture without download dead time is required, otherwise report blind intervals explicitly.

Frame metadata: session nonce, capture ID, channel count/types, samples/channel, trigger index, clock Hz/divider, target start tick, lost-frame counter, payload layout and checksum. Use interleaved samples or per-channel blocks consistently and publish golden vectors. Scope opcodes are reserved above; their exact binary payloads are an M6 prerequisite, not fully specified in this draft.

At eight channels * 1000 samples * four bytes, sample storage alone is 32,000 bytes (double buffering: 64,000). Metadata and pre-trigger strategy add overhead. Benchmark sampling execution time and latency on actual target/compiler settings; historical µC/Probe performance numbers are not reusable guarantees.
