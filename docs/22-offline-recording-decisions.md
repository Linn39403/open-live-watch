# ADR 04: Offline recording and display independence

Status: accepted architecture; implementation evidence pending. See [provider and graph contract](17-provider-and-graph-contract.md) and [the project plan](18-project-plan.md).

## Decision

Record accepted coherent provider frames before any graph reduction or display-refresh filtering. Keep a single authoritative acquisition pipeline. Floating views consume shared values and do not start another provider or logging subscription. All configured sources use the same recording path; the motor demonstration is not a special logging API.

CSV records carry source ID, variable path, declared type, raw value, units, quality, session epoch, catalog revision, sequence and elapsed simulation time. Record actual host receipt time separately as host_received_at_utc. Never derive UTC from accelerated simulation time or describe receipt time as target sampling time. CSV escaping must preserve Unicode, commas, quotes and newlines. Preserve raw numeric precision and booleans independently of widget display precision or gain.

A generic bounded snapshot export works for configured offline sources. Native continuous recording uses a Rust chunked file sink with explicit bounded queue and byte limits. Choose a new destination with safe create semantics; do not overwrite existing data without an explicit user workflow. Log file contents are independent of saved project files. Start/Stop and sink state are visible, including the active destination, queue state and any error or lost-record count.

Stop flushes accepted queued records or reports a concrete failure; do not claim a successful complete file merely because Stop was clicked. A slow/full sink, overflow or I/O error must become visible and stop or degrade recording according to the documented policy. Never silently drop data, block the UI without a bound, or retry an uncertain operation indefinitely. Project replacement or source/catalog changes stop/flush recording or begin an explicitly identified segment; metadata must not be borrowed from the wrong catalog generation.

Graph rendering may use a bounded multi-series view and min/max reduction to preserve extrema. Retain gaps and write-revision segment boundaries through reduction. Logging always receives the accepted frames, irrespective of visible history length, chart pixel width, refresh period, number of displayed series or decimation settings.

## Alternatives and limits

Saving every sample in frontend memory until export would make long sessions unbounded. Logging graph points would lose data during decimation and assign misleading timings after display refresh. Native incremental writing keeps continuous recording separate from bounded frontend history. This is an offline simulator contract; hardware source timestamps, wall-clock synchronization and target loss accounting require their own adapter evidence.

## Acceptance evidence

Verify generic CSV from two configured sources, numeric/boolean values, precision, Unicode and quoting, quality and epoch/catalog changes. Inject slow/full/error sink behavior and queue overflow; verify visible status and bounded buffers. Verify Stop flushing and generation guards during project replacement. Feed sharp spikes and quality gaps through decimation while comparing logged row counts to accepted sample counts. Record actual benchmark duration and machine details; accelerated one-hour-equivalent ticks do not establish a one-hour native stability pass.

Development recording bounds: frontend pending rows are capped at 2 MiB, with chunks of at most 256 rows or 128 KiB and one in-flight native append. A recording file is capped at 256 MiB; reaching the limit stops recording with a visible reason. This cap is not an unlimited-session claim. Stop awaits or explicitly reports the in-flight chunk and pending flush. An uncertain append is not automatically retried because that could duplicate CSV rows; the file is reported as partial. Accepted rows beyond an overflow or failure must be counted or explicitly reported as unrecorded.

CSV text encoding decision: use spreadsheet-safe-v1, identified by the CSV csv_text_encoding column. Numeric and boolean raw values retain their normal typed serialization. Metadata strings receive one leading apostrophe if their first character is an apostrophe or their first non-whitespace character is a formula trigger (=, +, -, @). Original leading apostrophes are therefore doubled. Under this encoding, decoding removes one leading apostrophe when present, recovering the original text exactly. Ordinary Unicode, quoted CSV fields, commas and newlines otherwise retain their content. Verify reversible roundtrip and negative numeric precision; do not silently present encoded metadata as an exact unescaped string.

The whitespace scan is identical in frontend and Rust: U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. Use these explicit characters rather than a language-dependent whitespace classification. Test both sides using formula text with these prefixes.
