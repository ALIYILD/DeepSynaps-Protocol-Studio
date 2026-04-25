// Multi-repo target loader
// Reads config/target-repos.yaml and expands a single repo (when workflow input
// is set) or the full list. Each repo gets its own apply-policy (apply_closures,
// apply_limit, apply_min_age_days) so regulated repos can be set to review-only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface TargetRepo {
  owner: string;
  name: string;
  description: string;
  applyClosures: boolean;
  applyLimit: number;
  applyMinAgeDays: number;
}

export interface TargetConfig {
  repos: TargetRepo[];
  reportRepo: { owner: string; name: string };
  docsUrl: string;
  marketplaceUrl: string;
  scopeAnchor: string;
}

interface RawRepo {
  owner: string;
  name: string;
  description?: string;
  apply_closures?: boolean;
  apply_limit?: number;
  apply_min_age_days?: number;
}

interface RawConfig {
  repos: RawRepo[];
  report_repo: { owner: string; name: string };
  docs_url: string;
  marketplace_url: string;
  scope_anchor: string;
}

export function loadTargetConfig(rootDir: string, override?: string): TargetConfig {
  const path = override ?? join(rootDir, "config", "target-repos.yaml");
  const raw = parseYaml(readFileSync(path, "utf8")) as RawConfig;
  return {
    repos: raw.repos.map((r) => ({
      owner: r.owner,
      name: r.name,
      description: r.description ?? "",
      applyClosures: r.apply_closures ?? false,
      applyLimit: r.apply_limit ?? 0,
      applyMinAgeDays: r.apply_min_age_days ?? 14,
    })),
    reportRepo: raw.report_repo,
    docsUrl: raw.docs_url,
    marketplaceUrl: raw.marketplace_url,
    scopeAnchor: raw.scope_anchor,
  };
}

export function selectRepos(config: TargetConfig, filter?: string): TargetRepo[] {
  if (!filter) return config.repos;
  // filter is "owner/name"
  return config.repos.filter((r) => `${r.owner}/${r.name}` === filter);
}
