# Data contracts

The workspace schema and bounded offline provider are implemented; broader debug/device formats below remain proposals. `schemas/workspace.schema.json` defines the executable subset and [provider/GUI protocol v1](17-provider-and-graph-contract.md) defines configurable offline variables, source-qualified bindings and coherent 2D plots. Keep implementation and schema revisions synchronized. `examples/demo.olw.json` remains the legacy motor example.

## Workspace

Top-level: `schemaVersion`, `id`, `name`, `sources[]`, `screens[]`. Sources identify provider and relative file paths; screens contain ID/name/kind/canvas/widgets. Widgets contain ID/kind/rect/title, optional binding and settings. Unknown future schema versions are rejected; migration must preserve the original file. File paths and assets must remain under permitted roots after normalization; opening a project does not execute or connect anything.

Persist stable source-qualified symbolic paths, not just addresses. Binding: source ID, symbol path, gain, offset, units, requested period, writable intent. Actual write permission is determined by the backend. Runtime address/type/quality/session epoch is not serialized as permanent authority.

Each widget can extend to named ports and multiple series. The implemented scalar/multi-series graph uses `binding` for its value/Y and `settings.graph.x` for an optional numeric XY X binding. Graph mode, capacity, window and optional automatic Y scaling are persisted. Optional `settings.graph.series` adds up to seven named, colored, visibility-controlled numeric Y bindings; XY uses a shared coherent X binding. Full arrays/structures are typed collections; they must not be coerced into numbers. Keep group references acyclic and screen/widget IDs unique.

## Type graph

`TypeDescriptor` is a tagged union: integer(width,signed), float(width), boolean(storage width), enum(underlying type, labels), string(encoding,capacity,terminator), array(element,bounds,stride), structure(members), union(members), pointer(addressWidth,pointee), bitfield(storage,offset,width), opaque(size,reason). Each member has a byte offset plus optional bit metadata. Sizes and offsets come from debug/SVD metadata, never host C defaults.

MVP memory codecs: i8/u8/i16/u16/i32/u32/i64/u64/f32/f64/bool in both endiannesses. Serialize i64/u64 and addresses as decimal/hex strings, never JS Number. Raw bytes remain available for opaque/unsupported values. Non-finite floats are tagged (`nan`, `positive-infinity`, `negative-infinity`) rather than invalid JSON numbers. Negative zero should remain distinguishable in raw inspection.

## Runtime samples and commands

Samples include bindingId, epoch, catalogRevision, sequence, hostStartNs, hostEndNs, optional targetTick, raw value, decoded value, quality, reason. Monotonic ns integers cross JSON as strings. `quality`: good/stale/unresolved/unsupported/transport-error/decode-error. Capture provider may add coherent snapshot ID; ordinary polling has none.

Write request includes operation ID, bindingId, epoch, catalogRevision, typed raw value and origin (widget/script/HID). Backend resolves storage and access; frontend cannot claim arbitrary writable address. Result is acknowledged/rejected/unknown with reason and optional readback. No auto-retry for unknown writes. Timeouts and shutdown are typed outcomes, not zero values.

## Typed service surface

Use `contracts/api.ts` as the initial contract sketch. Backend must enforce equivalent checks. Commands: importSymbols, resolveBinding, connect, disconnect, subscribe, unsubscribe, write, startLog, stopLog, configureScope, armScope, stopScope, saveWorkspace. Events: catalogChanged, connectionChanged, sampleBatch, writeResult, logStatus, scopeFrame. Paginate catalog results; batch sample events.

## Fixture requirements

Mock symbol source includes read-only temperature, speed and setpoint, boolean enable, enum mode and an integer counter. Add generated compiler fixtures for packed structs, aliases, arrays, unions, bitfields, duplicate local-static names, 64-bit addresses, unsupported locations and missing DWARF. Fixtures are newly authored; do not commit user's actual firmware.

The supplied example is declarative workspace data loaded by the working offline designer. It is not executable target firmware and does not prove hardware compatibility.
