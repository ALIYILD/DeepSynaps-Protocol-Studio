// Regulated-component guardrail
// Loaded from config/regulated-paths.yaml at process start. Used by:
//   1. DeepSweeper apply-decisions to refuse closing any item touching a regulated path
//   2. DeepSweeper review pass-through (the prompt also enforces this server-side)
//
// Defense-in-depth: the model is instructed to keep_open regulated items, AND the
// apply phase double-checks before posting any close. Either layer catching it
// keeps the item open.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface RegulatedConfig {
  paths: string[];
  keywords: string[];
}

export interface RegulatedMatch {
  isRegulated: boolean;
  matchedPaths: string[];
  matchedKeywords: string[];
}

let _cache: RegulatedConfig | null = null;

export function loadRegulatedConfig(rootDir: string, override?: string): RegulatedConfig {
  if (_cache) return _cache;
  const path = override ?? join(rootDir, "config", "regulated-paths.yaml");
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw) as Partial<RegulatedConfig>;
  _cache = {
    paths: parsed.paths ?? [],
    keywords: (parsed.keywords ?? []).map((k) => k.toLowerCase()),
  };
  return _cache;
}

// Convert a glob like "apps/qeeg-analyzer/**" into a RegExp.
// Supports `**` (any path segments) and `*` (any chars in one segment).
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^$?()|{}\[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function pathMatchesRegulated(filePath: string, config: RegulatedConfig): string | null {
  for (const glob of config.paths) {
    if (globToRegExp(glob).test(filePath)) return glob;
  }
  return null;
}

export function textContainsKeyword(text: string, config: RegulatedConfig): string[] {
  const lower = text.toLowerCase();
  return config.keywords.filter((kw) => lower.includes(kw));
}

// Check an item against the regulated allow-list. Pulls together title, body,
// changed-file paths (PRs), and comment text.
export function evaluateRegulated(
  options: {
    title: string;
    body: string;
    changedFiles: string[];
    commentTexts: string[];
  },
  config: RegulatedConfig,
): RegulatedMatch {
  const matchedPaths = new Set<string>();
  const matchedKeywords = new Set<string>();

  for (const f of options.changedFiles) {
    const m = pathMatchesRegulated(f, config);
    if (m) matchedPaths.add(m);
  }

  // Path-like tokens in title/body/comments (rg-style)
  const pathLike = /(?:\b|^)([\w./-]+\/[\w./-]+)(?:\b|$)/g;
  for (const text of [options.title, options.body, ...options.commentTexts]) {
    let m: RegExpExecArray | null;
    while ((m = pathLike.exec(text)) !== null) {
      const pathToken = m[1];
      if (!pathToken) {
        continue;
      }
      const found = pathMatchesRegulated(pathToken, config);
      if (found) {
        matchedPaths.add(found);
      }
    }
    for (const k of textContainsKeyword(text, config)) matchedKeywords.add(k);
  }

  return {
    isRegulated: matchedPaths.size > 0 || matchedKeywords.size > 0,
    matchedPaths: [...matchedPaths],
    matchedKeywords: [...matchedKeywords],
  };
}

// Defense-in-depth gate: even if the model returned decision=close, refuse to
// close an item that the regulated check flags. Returns the (possibly mutated)
// decision object.
export function enforceRegulatedGuardrail<
  T extends { decision: string; closeReason: string; closeComment: string; summary: string },
>(decision: T, regulated: RegulatedMatch): T {
  if (!regulated.isRegulated) return decision;
  return {
    ...decision,
    decision: "keep_open",
    closeReason: "none",
    closeComment: "",
    summary: `Regulated component touched (${[
      ...regulated.matchedPaths,
      ...regulated.matchedKeywords,
    ].join(", ")}) — human review required. ${decision.summary}`,
  };
}
