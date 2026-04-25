import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRegulated,
  enforceRegulatedGuardrail,
  type RegulatedConfig,
} from "../regulated.js";

const config: RegulatedConfig = {
  paths: [
    "apps/qeeg-analyzer/**",
    "packages/encoders/**",
    "**/*protocol*",
    "**/models.lock.yaml",
  ],
  keywords: ["clinical", "phi", "fda", "iec 62304", "consent"],
};

test("flags qeeg-analyzer file path", () => {
  const m = evaluateRegulated(
    {
      title: "Fix random thing",
      body: "Touches apps/qeeg-analyzer/src/foo.py",
      changedFiles: ["apps/qeeg-analyzer/src/foo.py"],
      commentTexts: [],
    },
    config,
  );
  assert.equal(m.isRegulated, true);
  assert.ok(m.matchedPaths.includes("apps/qeeg-analyzer/**"));
});

test("flags PHI keyword in title", () => {
  const m = evaluateRegulated(
    { title: "Bug in PHI scrubbing", body: "", changedFiles: [], commentTexts: [] },
    config,
  );
  assert.equal(m.isRegulated, true);
  assert.ok(m.matchedKeywords.includes("phi"));
});

test("flags FDA mention in comment", () => {
  const m = evaluateRegulated(
    {
      title: "Refactor",
      body: "",
      changedFiles: ["packages/utils/x.ts"],
      commentTexts: ["This affects our FDA submission"],
    },
    config,
  );
  assert.equal(m.isRegulated, true);
});

test("does not flag unrelated repo cleanup", () => {
  const m = evaluateRegulated(
    {
      title: "Fix typo in README",
      body: "Just a docs fix",
      changedFiles: ["README.md"],
      commentTexts: [],
    },
    config,
  );
  assert.equal(m.isRegulated, false);
  assert.equal(m.matchedPaths.length, 0);
  assert.equal(m.matchedKeywords.length, 0);
});

test("flags models.lock.yaml change", () => {
  const m = evaluateRegulated(
    {
      title: "Bump model",
      body: "",
      changedFiles: ["configs/models.lock.yaml"],
      commentTexts: [],
    },
    config,
  );
  assert.equal(m.isRegulated, true);
});

test("flags protocol filename glob", () => {
  const m = evaluateRegulated(
    {
      title: "Update PD protocol",
      body: "",
      changedFiles: ["docs/parkinsons-protocol-v2.md"],
      commentTexts: [],
    },
    config,
  );
  assert.equal(m.isRegulated, true);
});

test("guardrail rewrites a close to keep_open", () => {
  const decision = {
    decision: "close",
    closeReason: "implemented_on_main",
    closeComment: "Closing as fixed",
    summary: "Fixed in 1.2.3",
  };
  const out = enforceRegulatedGuardrail(decision, {
    isRegulated: true,
    matchedPaths: ["apps/qeeg-analyzer/**"],
    matchedKeywords: [],
  });
  assert.equal(out.decision, "keep_open");
  assert.equal(out.closeReason, "none");
  assert.equal(out.closeComment, "");
  assert.match(out.summary, /Regulated component touched/);
});

test("guardrail passes through non-regulated decision", () => {
  const decision = {
    decision: "close",
    closeReason: "implemented_on_main",
    closeComment: "Closing as fixed",
    summary: "Fixed in 1.2.3",
  };
  const out = enforceRegulatedGuardrail(decision, {
    isRegulated: false,
    matchedPaths: [],
    matchedKeywords: [],
  });
  assert.deepEqual(out, decision);
});
