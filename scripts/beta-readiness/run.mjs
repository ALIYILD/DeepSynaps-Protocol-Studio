#!/usr/bin/env node
/**
 * DeepSynaps Studio beta-readiness sweep.
 *
 * Spins up 8 specialist agents in parallel via the Claude Agent SDK, each
 * scoped to a single facet of the system (API, DB, backend tests, frontend
 * tests, e2e, UI buttons, AI/LLM, security). Their JSON reports are merged
 * into a single beta-readiness report at:
 *   docs/beta-readiness/auto-sweep-<ISO-DATE>.md
 *
 * Usage:
 *   node scripts/beta-readiness/run.mjs                  # all agents in parallel
 *   node scripts/beta-readiness/run.mjs api-probe        # one agent
 *   node scripts/beta-readiness/run.mjs api-probe db-migration   # subset
 *
 * Requires: ANTHROPIC_API_KEY in env (or the bundled `claude` binary auth).
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { agents } from './agents.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const REQUESTED = process.argv.slice(2);
const TARGETS = REQUESTED.length ? REQUESTED : Object.keys(agents);

for (const t of TARGETS) {
  if (!agents[t]) {
    console.error(`Unknown agent: ${t}`);
    console.error(`Known: ${Object.keys(agents).join(', ')}`);
    process.exit(2);
  }
}

const REPORT_RE = /<REPORT>([\s\S]*?)<\/REPORT>/;

async function runAgent(name) {
  const def = agents[name];
  const started = Date.now();
  console.log(`▶ [${name}] starting`);
  let lastText = '';
  try {
    for await (const msg of query({
      prompt: def.prompt,
      options: {
        cwd: REPO_ROOT,
        agents: { [name]: def },
        agent: name,
        // Auto-allow safe read+local-test tools; block remote-impacting actions.
        permissionMode: 'acceptEdits',
        maxTurns: 30,
      },
    })) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const c of msg.message.content) {
          if (c.type === 'text') lastText += c.text;
        }
      }
      if (msg.type === 'result') {
        const m = REPORT_RE.exec(lastText) || REPORT_RE.exec(msg.result || '');
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        if (m) {
          try {
            const parsed = JSON.parse(m[1]);
            console.log(`✓ [${name}] done in ${elapsed}s — ${parsed.passed || 0} passed, ${parsed.failed || 0} failed, ${parsed.findings?.length || 0} findings`);
            return { name, ok: true, parsed, elapsed };
          } catch (e) {
            console.log(`✗ [${name}] report JSON invalid: ${e.message}`);
            return { name, ok: false, error: 'invalid-json', raw: m[1].slice(0, 500), elapsed };
          }
        } else {
          console.log(`✗ [${name}] no <REPORT> block emitted (${elapsed}s)`);
          return { name, ok: false, error: 'no-report', raw: lastText.slice(-500), elapsed };
        }
      }
    }
  } catch (e) {
    console.log(`✗ [${name}] threw: ${e.message}`);
    return { name, ok: false, error: e.message, elapsed: ((Date.now() - started) / 1000).toFixed(1) };
  }
}

function severityRank(s) {
  return { blocker: 0, major: 1, minor: 2, info: 3 }[s] ?? 4;
}

function renderReport(results) {
  const ts = new Date().toISOString();
  const allFindings = results.flatMap(r =>
    (r.parsed?.findings || []).map(f => ({ ...f, agent: r.name }))
  ).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const blockers = allFindings.filter(f => f.severity === 'blocker').length;
  const majors = allFindings.filter(f => f.severity === 'major').length;
  const minors = allFindings.filter(f => f.severity === 'minor').length;

  const verdict = blockers > 0 ? 'NOT READY — blockers must clear'
                : majors > 0 ? 'CONDITIONAL — majors should be triaged'
                : 'READY for beta';

  const lines = [];
  lines.push(`# DeepSynaps Studio — Beta-Readiness Auto-Sweep`);
  lines.push(``);
  lines.push(`Generated: ${ts}`);
  lines.push(`Verdict: **${verdict}**`);
  lines.push(``);
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Blocker | ${blockers} |`);
  lines.push(`| Major | ${majors} |`);
  lines.push(`| Minor | ${minors} |`);
  lines.push(`| Info | ${allFindings.length - blockers - majors - minors} |`);
  lines.push(``);
  lines.push(`## Per-agent summary`);
  lines.push(``);
  lines.push(`| Agent | OK | Passed | Failed | Findings | Time |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of results) {
    const p = r.parsed || {};
    const ok = r.ok && p.ok ? '✓' : '✗';
    lines.push(`| ${r.name} | ${ok} | ${p.passed ?? '-'} | ${p.failed ?? '-'} | ${p.findings?.length ?? '-'} | ${r.elapsed}s |`);
  }
  lines.push(``);
  lines.push(`## Findings (sorted by severity)`);
  lines.push(``);
  for (const f of allFindings) {
    lines.push(`### [${f.severity}] ${f.title} _(${f.agent})_`);
    lines.push(``);
    lines.push(`${f.detail}`);
    if (f.where) lines.push(``, `\`${f.where}\``);
    lines.push(``);
  }

  const failedAgents = results.filter(r => !r.ok);
  if (failedAgents.length) {
    lines.push(`## Agent failures`);
    lines.push(``);
    for (const r of failedAgents) {
      lines.push(`- **${r.name}**: ${r.error}`);
      if (r.raw) lines.push(`  - tail: \`${r.raw.replace(/`/g, "'").slice(0, 200)}\``);
    }
  }
  return lines.join('\n');
}

(async () => {
  console.log(`Running ${TARGETS.length} agent(s) in parallel: ${TARGETS.join(', ')}`);
  const results = await Promise.all(TARGETS.map(runAgent));

  const outDir = join(REPO_ROOT, 'docs', 'beta-readiness');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const outPath = join(outDir, `auto-sweep-${stamp}.md`);
  writeFileSync(outPath, renderReport(results));
  console.log(`\n📝 Report → ${outPath}`);

  const blockers = results.flatMap(r => r.parsed?.findings || []).filter(f => f.severity === 'blocker').length;
  process.exit(blockers > 0 ? 1 : 0);
})();
