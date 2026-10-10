/** Original contract sketch; implement matching runtime validators. */
export type Address = `0x${string}`;
export type ExactInteger = string;
export type Quality = 'good' | 'stale' | 'unresolved' | 'unsupported' | 'transport-error' | 'decode-error';
export type TypedValue =
  | { kind: 'integer'; signed: boolean; bits: 8 | 16 | 32 | 64; value: ExactInteger }
  | { kind: 'float'; bits: 32 | 64; value: number | 'nan' | 'positive-infinity' | 'negative-infinity' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'bytes'; hex: string };
export interface BindingRef { sourceId: string; symbolPath: string; gain: number; offset: number; units: string; periodMs: number; writable: boolean; }
export interface Sample { bindingId: string; epoch: number; catalogRevision: number; sequence: ExactInteger; hostStartNs: ExactInteger; hostEndNs: ExactInteger; targetTick?: ExactInteger; value?: TypedValue; quality: Quality; reason?: string; }
export interface Capabilities { addressBits: 32 | 64; byteOrder: 'little' | 'big'; maxReadBytes: number; alignment: number; runningRead: boolean; runningWrite: boolean; atomicMaskedWrite: boolean; coherentSnapshot: boolean; scope: boolean; terminal: boolean; sharing: 'exclusive' | 'supported'; }
export interface WriteRequest { operationId: string; bindingId: string; epoch: number; catalogRevision: number; value: TypedValue; origin: 'widget' | 'script' | 'hid'; }
export interface WriteResult { operationId: string; state: 'acknowledged' | 'rejected' | 'unknown'; reason?: string; readback?: TypedValue; }
export interface ScopeFrame { epoch: number; captureId: ExactInteger; sampleClockHz: number; divider: number; triggerIndex: number; samplesPerChannel: number; lostFrames: number; channels: Array<{ bindingId: string; samples: TypedValue[] }>; }
