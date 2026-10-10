import { parseWorkspace, type Workspace } from "./model";
export type RecoverySnapshot = {
  formatVersion: 1;
  generation: number;
  revision: number;
  savedPath: string | null;
  workspace: Workspace;
};
export type RecoveryRead = { generation?: number } & (
  | { status: "missing" }
  | { status: "valid"; snapshot: RecoverySnapshot }
  | { status: "corrupt"; reason: string }
);
export function parseRecovery(input: unknown): RecoverySnapshot {
  const v = input as RecoverySnapshot;
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).sort().join(",") !==
      ["formatVersion", "generation", "revision", "savedPath", "workspace"]
        .sort()
        .join(",")
  )
    throw new Error("Unknown/missing recovery fields");
  const encoder = new TextEncoder(),
    { workspace, ...metadata } = v;
  if (
    encoder.encode(JSON.stringify(metadata)).length > 1024 ||
    encoder.encode(JSON.stringify(workspace)).length > 10 * 1024 * 1024
  )
    throw new Error("Recovery metadata/workspace exceeds limit");
  if (
    !v ||
    v.formatVersion !== 1 ||
    !Number.isSafeInteger(v.generation) ||
    v.generation < 0 ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    (v.savedPath !== null &&
      (typeof v.savedPath !== "string" ||
        encoder.encode(v.savedPath).length > 800))
  )
    throw new Error("Invalid or future recovery snapshot");
  if (JSON.stringify(v).length > 10 * 1024 * 1024 + 1024)
    throw new Error("Recovery exceeds size limit");
  return { ...v, workspace: parseWorkspace(v.workspace) };
}
let generation = 0,
  revision = 0,
  protectedSnapshot = false;
export async function recoveryInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  const key = "olw-recovery-v1";
  if (command === "recovery_read") {
    const text = localStorage.getItem(key);
    if (!text) return { status: "missing", generation } as T;
    protectedSnapshot = true;
    try {
      return {
        status: "valid",
        snapshot: parseRecovery(JSON.parse(text)),
      } as T;
    } catch (e) {
      return { status: "corrupt", reason: String(e), generation } as T;
    }
  }
  if (command === "recovery_begin") {
    if (protectedSnapshot && !args.replaceExisting)
      throw new Error("Recovery requires explicit Restore/Discard");
    protectedSnapshot = false;
    generation++;
    revision = 0;
    return generation as T;
  }
  if (command === "recovery_clear") {
    if (args.generation !== generation) throw new Error("Stale recovery clear");
    localStorage.removeItem(key);
    protectedSnapshot = false;
    generation++;
    revision = 0;
    return undefined as T;
  }
  if (command === "recovery_write") {
    if (
      protectedSnapshot ||
      args.generation !== generation ||
      Number(args.revision) <= revision
    )
      throw new Error("Stale/protected recovery write");
    const snapshot = parseRecovery({
      formatVersion: 1,
      generation,
      revision: args.revision,
      savedPath: args.savedPath,
      workspace: JSON.parse(String(args.data)),
    });
    localStorage.setItem(key, JSON.stringify(snapshot));
    revision = snapshot.revision;
    return undefined as T;
  }
  throw new Error("Unknown recovery command");
}
