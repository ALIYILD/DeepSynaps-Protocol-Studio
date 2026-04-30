// ════════════════════════════════════════════════════════════════════════════════
// Phase 11A — Public marketplace landing page (anonymous-visible).
//
// Reachable via `?page=marketplace-landing`. NOT auth-gated. The existing
// `?page=marketplace` route remains a clinic-internal hub powered by
// pages-clinical-hubs.js — this module is the public, pre-auth shop window
// that anonymous visitors can reach.
//
// Layout (top → bottom):
//   1. Hero — H1, sub, two CTAs (Start trial / Book demo)
//   2. Pricing table — 3 columns mirroring the agent-onboarding-wizard packages
//   3. Agent catalog grid — 7 hardcoded tiles mirroring AGENT_REGISTRY
//      (public-safe fields only — NEVER system_prompt). On mount we attempt
//      a live GET /api/v1/agents/ for parity with the existing endpoint
//      contract (anonymous returns {agents: []} per agents_router.py spec)
//      but the hardcoded tiles are always rendered so anonymous visitors
//      see the catalog regardless.
//   4. Trust block — 3 short bullets
//   5. Footer CTA — repeats the trial button
//
// Copy is deliberately conservative: decision-support framing, NHS clinician
// involvement, GDPR alignment. No "AI doctor" claims. Patient-side tiles
// render a "Pending clinical sign-off" badge to mirror the gating logic in
// AGENT_REGISTRY (package_required=['pending_clinical_signoff']).
// ════════════════════════════════════════════════════════════════════════════════

function _mlEsc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function _mlApiBase() {
  try { return import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'; }
  catch { return 'http://127.0.0.1:8000'; }
}

// Founder contact — anchored to a single canonical email so the mailto links
// stay in sync if it changes. No existing module exports this constant, so
// it lives here next to the only consumer.
const ML_DEMO_EMAIL = 'dr.aliyildirim123@gmail.com';

// ── SEO + social-card meta tag values ──────────────────────────────────────
// Source-of-truth strings for the Phase 12 SEO injection. The hero copy
// above and these constants must stay aligned (manual coupling, but the
// strings are short so drift risk is low). The OG image URL points at a
// follow-up asset that does not yet exist in the repo — see follow-up issue.
const ML_SEO = {
  title: 'DeepSynaps Studio — Agents that run your clinic',
  description:
    'Decision-support agents for neuromodulation clinics — booking, reporting, and clinician hand-off. Built with NHS clinicians. You stay in charge.',
  url: 'https://deepsynaps-studio-preview.netlify.app/?page=marketplace-landing',
  image: 'https://deepsynaps-studio-preview.netlify.app/og-marketplace.png',
};

// List of `[selectorAttr, selectorValue, content]` rows we upsert into
// <head>. Kept declarative so the test seam can iterate over the same shape.
function _mlSeoTagSpecs() {
  return [
    ['name',     'description',        ML_SEO.description],
    ['property', 'og:title',           ML_SEO.title],
    ['property', 'og:description',     ML_SEO.description],
    ['property', 'og:type',            'website'],
    ['property', 'og:url',             ML_SEO.url],
    ['property', 'og:image',           ML_SEO.image],
    ['name',     'twitter:card',       'summary_large_image'],
    ['name',     'twitter:title',      ML_SEO.title],
    ['name',     'twitter:description', ML_SEO.description],
    ['name',     'twitter:image',      ML_SEO.image],
  ];
}

// Upsert a single <meta> tag identified by (attrName, attrValue) — update
// content in place if it already exists, otherwise create a fresh node and
// append to <head>. Idempotent — calling repeatedly never duplicates tags.
function _mlUpsertMeta(attrName, attrValue, content) {
  if (typeof document === 'undefined' || !document.head) return;
  let el = null;
  try {
    el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  } catch { el = null; }
  if (el && typeof el.setAttribute === 'function') {
    el.setAttribute('content', content);
    return;
  }
  if (typeof document.createElement !== 'function') return;
  const tag = document.createElement('meta');
  if (typeof tag.setAttribute === 'function') {
    tag.setAttribute(attrName, attrValue);
    tag.setAttribute('content', content);
  } else {
    tag[attrName] = attrValue;
    tag.content = content;
  }
  if (typeof document.head.appendChild === 'function') {
    document.head.appendChild(tag);
  }
}

// Public hook — sets <title> and upserts every meta tag in the spec table.
// Idempotent: re-running on the same page never duplicates. The SPA does NOT
// expose a teardown / unmount hook for routes (see app.js router) so we
// deliberately leave the tags in place when the user navigates away —
// downstream pages that care about their own SEO will overwrite via the
// same upsert path. Static <title> mutation by other pages will likewise
// override `document.title`.
function _mlSetSeoTags() {
  if (typeof document === 'undefined') return;
  try { document.title = ML_SEO.title; } catch {}
  for (const [attrName, attrValue, content] of _mlSeoTagSpecs()) {
    _mlUpsertMeta(attrName, attrValue, content);
  }
}

// No-op-ish counterpart kept for documentation symmetry. The SPA router
// has no per-page teardown callback, so this is intentionally a no-op:
// see comment on `_mlSetSeoTags` above. Exposed via the test seam so a
// future router refactor can wire it up without touching this file again.
function _mlClearSeoTags() {
  // Intentional no-op. See `_mlSetSeoTags` comment for the rationale.
}

// ── Pricing — mirrors AGENT_ONB_PACKAGES in agent-onboarding-wizard.js ─────
const ML_PRICING = [
  {
    id: 'solo',
    name: 'Solo Clinician',
    price: '£0',
    priceSub: 'free trial',
    features: [
      'One clinician seat',
      'Demo patients & sample data',
      'Read-only marketplace browse',
      'No card required',
    ],
  },
  {
    id: 'pro',
    name: 'Clinician Pro',
    price: '£99',
    priceSub: '/mo base',
    features: [
      'Full clinic team seats',
      'Marketplace agents (pay-as-you-go)',
      'Outcomes & adverse-event tracking',
      'Stripe billing, cancel any time',
      'Email support, UK working hours',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceSub: 'multi-site',
    features: [
      'Multi-clinic & SSO',
      'Custom prompt overrides per clinic',
      'Dedicated success manager',
      'Procurement-ready paperwork',
      'NHS / private-sector contracting',
    ],
  },
];

// ── Public agent catalog — mirrors AGENT_REGISTRY (apps/api/.../registry.py)
// We hardcode the public-safe fields here so anonymous visitors never need to
// hit the API. The real backend filter `list_visible_agents` returns an empty
// list for guests, so a network call would produce nothing renderable. Keep
// these in lock-step with the registry — when an agent ships there, mirror
// it here. NEVER include `system_prompt`.
const ML_AGENT_CATALOG = [
  {
    id: 'clinic.reception',
    name: 'Clinic Reception',
    tagline: 'Front-desk assistant that handles bookings, lookups, and consent checks.',
    audience: 'clinic',
    monthly_price_gbp: 99,
  },
  {
    id: 'clinic.reporting',
    name: 'Clinic Reporting',
    tagline: 'Weekly digest writer that summarises outcomes, AEs, and finance.',
    audience: 'clinic',
    monthly_price_gbp: 49,
  },
  {
    id: 'clinic.drclaw_telegram',
    name: 'DrClaw (Telegram)',
    tagline: 'Personal queue agent over Telegram — triage, lookups, draft approvals.',
    audience: 'clinic',
    monthly_price_gbp: 79,
  },
  {
    id: 'patient.care_companion',
    name: 'Care Companion',
    tagline: 'Daily check-ins, mood logging, gentle reminders. Escalates red flags to clinician.',
    audience: 'patient',
    monthly_price_gbp: 19,
  },
  {
    id: 'patient.adherence',
    name: 'Adherence Agent',
    tagline: 'Med + home-program reminders, logged to clinician dashboard.',
    audience: 'patient',
    monthly_price_gbp: 12,
  },
  {
    id: 'patient.education',
    name: 'Education Agent',
    tagline: 'Answers patient questions using only clinic-approved evidence sources.',
    audience: 'patient',
    monthly_price_gbp: 9,
  },
  {
    id: 'patient.crisis',
    name: 'Crisis Safety Agent',
    tagline: 'Detects urgent signals, escalates per clinic protocol. Never gives advice.',
    audience: 'patient',
    monthly_price_gbp: 0,
  },
];

// ── State (only used to absorb the optional anonymous fetch). The catalog
// is always the hardcoded list — the fetch is best-effort parity. ──────────
let _mlState = {
  fetchedAgents: null,   // null | [] (empty for anon) | [items] (if auth set)
  fetchError: null,
};

async function _mlFetchAnonymousCatalog() {
  // Best-effort hit of the live endpoint. The contract is documented in
  // apps/api/app/routers/agents_router.py: anonymous (or unentitled) actors
  // get a 200 with `{agents: []}` rather than 401/403, so the marketplace
  // can render an empty-state UI. We swallow errors silently — the
  // hardcoded catalog is the source of truth for the landing page.
  try {
    const res = await fetch(`${_mlApiBase()}/api/v1/agents/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    let payload = null;
    try { payload = await res.json(); } catch {}
    const agents = (payload && Array.isArray(payload.agents)) ? payload.agents : [];
    _mlState.fetchedAgents = agents;
  } catch (err) {
    _mlState.fetchedAgents = [];
    _mlState.fetchError = String(err && err.message ? err.message : err);
  }
}

// ── Render fragments ─────────────────────────────────────────────────────────

function _mlRenderHero() {
  const trialHref = '?page=agent-onboarding';
  const demoHref  = `mailto:${ML_DEMO_EMAIL}?subject=${encodeURIComponent('DeepSynaps demo request')}`;
  return `
    <section data-test="ml-hero" style="padding:48px 24px 36px;text-align:center;max-width:880px;margin:0 auto">
      <h1 data-test="ml-hero-h1"
          style="font-size:34px;font-weight:800;color:var(--text-primary);margin:0 0 14px;line-height:1.18">
        Agents that run your clinic, not your inbox
      </h1>
      <h2 data-test="ml-hero-sub"
          style="font-size:16px;font-weight:400;color:var(--text-secondary);margin:0 0 28px;line-height:1.5">
        Decision-support agents for neuromodulation clinics — booking, reporting, and
        clinician hand-off. Built with NHS clinicians. You stay in charge.
      </h2>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a class="btn btn-primary" data-test="ml-cta-trial" href="${trialHref}"
           style="font-size:14px;padding:11px 22px;font-weight:600;text-decoration:none;border-radius:8px">
          Start a trial →
        </a>
        <a class="btn" data-test="ml-cta-demo" href="${demoHref}"
           style="font-size:14px;padding:11px 22px;font-weight:600;text-decoration:none;border-radius:8px">
          Book a demo →
        </a>
      </div>
    </section>
  `;
}

function _mlRenderPricing() {
  const cols = ML_PRICING.map(p => {
    const features = p.features.map(f =>
      `<li style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;margin:0 0 6px;padding-left:18px;position:relative">
        <span style="position:absolute;left:0;top:0;color:var(--violet);font-weight:700">✓</span>${_mlEsc(f)}
      </li>`
    ).join('');
    return `
      <div data-test="ml-pkg-${p.id}"
           style="border:1px solid var(--border);border-radius:12px;padding:20px;background:var(--bg-surface,transparent)">
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:6px">${_mlEsc(p.name)}</div>
        <div style="font-size:24px;font-weight:800;color:var(--violet);margin-bottom:2px">${_mlEsc(p.price)}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:14px">${_mlEsc(p.priceSub)}</div>
        <ul style="list-style:none;padding:0;margin:0">${features}</ul>
      </div>
    `;
  }).join('');
  return `
    <section data-test="ml-pricing" style="padding:32px 24px;max-width:1080px;margin:0 auto">
      <h2 style="font-size:22px;font-weight:700;color:var(--text-primary);margin:0 0 20px;text-align:center">Pricing</h2>
      <div data-test="ml-pricing-grid"
           style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
        ${cols}
      </div>
    </section>
  `;
}

function _mlRenderAgentTile(agent) {
  const isPatient = agent.audience === 'patient';
  // Audience pill — same color tokens as pages-agents.js (blue for clinic /
  // amber for patient-side gated).
  const audPill = `<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">${_mlEsc(agent.audience)}</span>`;
  // Patient-side tiles get the gold/amber "Pending clinical sign-off" badge.
  // Mirrors the pattern already used in pages-agents.js for locked rows.
  const signoffPill = isPatient
    ? `<span class="ds-pill" data-test="ml-pending-signoff" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(245,158,11,0.12);color:var(--amber,#f59e0b);font-weight:600;border:1px solid rgba(245,158,11,0.25)">Pending clinical sign-off</span>`
    : '';
  const price = (agent.monthly_price_gbp === 0)
    ? 'Free'
    : `£${_mlEsc(String(agent.monthly_price_gbp))}/mo`;
  return `
    <div data-test="ml-agent-${_mlEsc(agent.id)}"
         style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${audPill}
        ${signoffPill}
      </div>
      <h3 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:0">${_mlEsc(agent.name)}</h3>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.45;flex:1">${_mlEsc(agent.tagline)}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${price}</div>
      <div data-test="ml-decision-support" style="font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:6px;margin-top:2px;letter-spacing:.3px;text-transform:uppercase">
        decision-support
      </div>
    </div>
  `;
}

function _mlRenderCatalog() {
  const tiles = ML_AGENT_CATALOG.map(_mlRenderAgentTile).join('');
  return `
    <section data-test="ml-catalog" style="padding:32px 24px;max-width:1080px;margin:0 auto">
      <h2 style="font-size:22px;font-weight:700;color:var(--text-primary);margin:0 0 6px;text-align:center">Agent catalogue</h2>
      <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 18px;text-align:center">
        Decision-support, not autonomous diagnosis. A clinician reviews every recommendation.
      </p>
      <div data-test="ml-catalog-grid"
           style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
        ${tiles}
      </div>
    </section>
  `;
}

function _mlRenderTrust() {
  const bullets = [
    'Built with NHS clinicians',
    'Decision-support, not autonomous diagnosis',
    'GDPR-aligned, UK-hosted',
  ];
  const items = bullets.map(b =>
    `<li data-test="ml-trust-bullet" style="font-size:13px;color:var(--text-secondary);line-height:1.55;padding:0 14px;flex:1;min-width:200px;text-align:center">
      <span style="color:var(--violet);font-weight:700;margin-right:6px">●</span>${_mlEsc(b)}
    </li>`
  ).join('');
  return `
    <section data-test="ml-trust" style="padding:28px 24px;max-width:1080px;margin:0 auto">
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:18px 0">
        ${items}
      </ul>
    </section>
  `;
}

function _mlRenderFooterCta() {
  return `
    <section data-test="ml-footer-cta" style="padding:36px 24px 56px;text-align:center">
      <a class="btn btn-primary" data-test="ml-cta-trial-footer" href="?page=agent-onboarding"
         style="font-size:14px;padding:11px 22px;font-weight:600;text-decoration:none;border-radius:8px">
        Start a trial →
      </a>
    </section>
  `;
}

// ── Entry point used by the SPA router (apps/web/src/app.js) ───────────────

export async function pgMarketplaceLanding(setTopbar /* , navigate */) {
  // Phase 12 — apply SEO + OG/Twitter card meta tags before render so any
  // crawler that hydrates the SPA picks up the right title/description.
  // Idempotent — safe to re-run on every navigation back to this page.
  try { _mlSetSeoTags(); } catch {}
  // Keep the topbar minimal for an anonymous landing surface.
  if (typeof setTopbar === 'function') {
    try { setTopbar('Marketplace'); } catch {}
  }
  // Reset state so re-navigating to the page doesn't show stale fetch
  // errors from a previous mount.
  _mlState = { fetchedAgents: null, fetchError: null };
  // Best-effort live fetch — UI does not block on it. The hardcoded catalog
  // renders synchronously below.
  _mlFetchAnonymousCatalog().catch(() => {});

  const html = `
    <div data-test="ml-page" style="min-height:100vh">
      ${_mlRenderHero()}
      ${_mlRenderPricing()}
      ${_mlRenderCatalog()}
      ${_mlRenderTrust()}
      ${_mlRenderFooterCta()}
    </div>
  `;

  const host = (typeof document !== 'undefined') ? document.getElementById('content') : null;
  if (host) host.innerHTML = html;
  return html;
}

// ── Test seam — node:test friendly. Mirrors the pattern used by
// agent-onboarding-wizard.js (`__agentOnboardingTestApi__`). ───────────────

export const __marketplaceLandingTestApi__ = {
  reset() {
    _mlState = { fetchedAgents: null, fetchError: null };
  },
  getState() { return { ..._mlState }; },
  fetchAnonymousCatalog: _mlFetchAnonymousCatalog,
  renderHero: _mlRenderHero,
  renderPricing: _mlRenderPricing,
  renderCatalog: _mlRenderCatalog,
  renderTrust: _mlRenderTrust,
  renderFooterCta: _mlRenderFooterCta,
  renderPage: pgMarketplaceLanding,
  PRICING: ML_PRICING,
  AGENT_CATALOG: ML_AGENT_CATALOG,
  DEMO_EMAIL: ML_DEMO_EMAIL,
  // Phase 12 — SEO seam.
  setSeoTags: _mlSetSeoTags,
  clearSeoTags: _mlClearSeoTags,
  upsertMeta: _mlUpsertMeta,
  seoTagSpecs: _mlSeoTagSpecs,
  SEO: ML_SEO,
};
