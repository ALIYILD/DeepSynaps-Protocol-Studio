import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTargetConfig, selectRepos } from "./repos.js";
import { verifyChain } from "./audit.js";

type Command =
  | "list-repos"
  | "verify-audit"
  | "status"
  | "plan"
  | "review"
  | "apply-artifacts"
  | "apply-decisions"
  | "reconcile"
  | "dashboard";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUPPORTED_COMMANDS = new Set<Command>(["list-repos", "verify-audit", "status"]);

function parseFlag(name: string): string | undefined {
  const args = process.argv.slice(3);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}`) {
      return args[index + 1];
    }
  }
  return undefined;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string, exitCode = 1): never {
  process.stderr.write(`${message}\n`);
  process.exitCode = exitCode;
  throw new Error(message);
}

function requireCommand(value: string | undefined): Command {
  if (!value) {
    fail("Usage: node dist/deepsweeper.js <command> [--flags]");
  }
  return value as Command;
}

function listRepos(): void {
  const config = loadTargetConfig(ROOT);
  const filter = parseFlag("filter");
  const repos = selectRepos(config, filter).map((repo) => ({
    repo: `${repo.owner}/${repo.name}`,
    description: repo.description,
    apply_closures: repo.applyClosures,
    apply_limit: repo.applyLimit,
    apply_min_age_days: repo.applyMinAgeDays,
  }));
  printJson(repos);
}

function verifyAudit(): void {
  const override = parseFlag("log-file");
  const logPath = override ?? join(ROOT, "audit-log.ndjson");
  const result = verifyChain(logPath);
  if (!result.ok) {
    fail(
      `Audit chain verification failed for ${logPath} at record index ${result.brokenAt ?? "unknown"}.`,
    );
  }
  process.stdout.write(`Audit chain OK: ${logPath}\n`);
}

function status(): void {
  const auditLog = join(ROOT, "audit-log.ndjson");
  printJson({
    root: ROOT,
    supportedCommands: [...SUPPORTED_COMMANDS],
    stubbedCommands: [
      "plan",
      "review",
      "apply-artifacts",
      "apply-decisions",
      "reconcile",
      "dashboard",
    ],
    files: {
      targetConfig: existsSync(join(ROOT, "config", "target-repos.yaml")),
      regulatedConfig: existsSync(join(ROOT, "config", "regulated-paths.yaml")),
      reviewPrompt: existsSync(join(ROOT, "prompts", "review-item.md")),
      schema: existsSync(join(ROOT, "schema", "deepsweeper-decision.schema.json")),
      auditLog: existsSync(auditLog),
    },
  });
}

function main(): void {
  const command = requireCommand(process.argv[2]);
  switch (command) {
    case "list-repos":
      listRepos();
      return;
    case "verify-audit":
      verifyAudit();
      return;
    case "status":
      status();
      return;
    case "plan":
    case "review":
    case "apply-artifacts":
    case "apply-decisions":
    case "reconcile":
    case "dashboard":
      fail(
        `${command} is not implemented in this vendored copy because the upstream ClawSweeper core entrypoint was not included in the source kit. See tools/deepsweeper/README.md.`,
      );
      return;
    default:
      fail(`Unknown command: ${command}`);
  }
}

main();
