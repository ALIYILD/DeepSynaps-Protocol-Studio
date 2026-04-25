// DeepSweeper audit emitter
// Every close action emits an audit record matching the Brain Twin LEARNING_LOOP
// audit schema (hash chain ready, Merkle anchor compatible). Records are written
// to ./audit-log.ndjson during a run; the apply phase commits them along with the
// items/ records into the report repo.
//
// In production this is replaced with a direct call to the Studio audit-log
// service (POST /api/v1/audit/record). The local NDJSON is kept as a fallback.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AuditRecord {
  recordedAt: string;
  actor: string;
  eventType: string; // e.g. "deepsweeper.close"
  tenantId: string; // "deepsynaps-internal"
  payload: Record<string, unknown>;
  hashPrev: string | null;
  hashSelf: string;
}

function canonicalJson(obj: unknown): string {
  // Stable, sorted JSON for deterministic hashing
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const inner = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${inner}}`;
}

function lastHash(logPath: string): string | null {
  if (!existsSync(logPath)) return null;
  const txt = readFileSync(logPath, "utf8").trim();
  if (!txt) return null;
  const lines = txt.split("\n");
  const last = lines[lines.length - 1];
  if (!last) {
    return null;
  }
  try {
    const rec = JSON.parse(last) as AuditRecord;
    return rec.hashSelf;
  } catch {
    return null;
  }
}

export interface EmitOptions {
  rootDir: string;
  logFile?: string;
  actor: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export function emitAuditRecord(options: EmitOptions): AuditRecord {
  const logPath = options.logFile ?? join(options.rootDir, "audit-log.ndjson");
  const hashPrev = lastHash(logPath);
  const recordedAt = new Date().toISOString();
  const base: Omit<AuditRecord, "hashSelf"> = {
    recordedAt,
    actor: options.actor,
    eventType: options.eventType,
    tenantId: "deepsynaps-internal",
    payload: options.payload,
    hashPrev,
  };
  const hashSelf = createHash("sha256").update(canonicalJson(base)).digest("hex");
  const record: AuditRecord = { ...base, hashSelf };
  appendFileSync(logPath, JSON.stringify(record) + "\n");
  return record;
}

export function verifyChain(logPath: string): { ok: boolean; brokenAt: number | null } {
  if (!existsSync(logPath)) return { ok: true, brokenAt: null };
  const lines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  let prev: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      return { ok: false, brokenAt: i };
    }
    const rec = JSON.parse(line) as AuditRecord;
    if (rec.hashPrev !== prev) return { ok: false, brokenAt: i };
    const { hashSelf, ...rest } = rec;
    const recomputed = createHash("sha256").update(canonicalJson(rest)).digest("hex");
    if (recomputed !== hashSelf) return { ok: false, brokenAt: i };
    prev = hashSelf;
  }
  return { ok: true, brokenAt: null };
}
