import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitAuditRecord, verifyChain } from "../audit.js";

test("audit records form a verifiable hash chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "deepsweeper-audit-"));
  const log = join(dir, "audit-log.ndjson");
  try {
    const a = emitAuditRecord({
      rootDir: dir,
      logFile: log,
      actor: "deepsweeper-bot",
      eventType: "deepsweeper.close",
      payload: { item_number: 1, repo: "deepsynaps/studio" },
    });
    const b = emitAuditRecord({
      rootDir: dir,
      logFile: log,
      actor: "deepsweeper-bot",
      eventType: "deepsweeper.close",
      payload: { item_number: 2, repo: "deepsynaps/studio" },
    });
    assert.equal(a.hashPrev, null);
    assert.equal(b.hashPrev, a.hashSelf);
    const result = verifyChain(log);
    assert.equal(result.ok, true);
    assert.equal(result.brokenAt, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit chain detects tampering", () => {
  const dir = mkdtempSync(join(tmpdir(), "deepsweeper-audit-"));
  const log = join(dir, "audit-log.ndjson");
  try {
    emitAuditRecord({
      rootDir: dir,
      logFile: log,
      actor: "deepsweeper-bot",
      eventType: "deepsweeper.close",
      payload: { item_number: 1 },
    });
    emitAuditRecord({
      rootDir: dir,
      logFile: log,
      actor: "deepsweeper-bot",
      eventType: "deepsweeper.close",
      payload: { item_number: 2 },
    });

    // Tamper with first line's payload but keep its hashSelf
    const lines = readFileSync(log, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0]!);
    first.payload.item_number = 999;
    lines[0] = JSON.stringify(first);
    writeFileSync(log, lines.join("\n") + "\n");

    const result = verifyChain(log);
    assert.equal(result.ok, false);
    assert.equal(result.brokenAt, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
