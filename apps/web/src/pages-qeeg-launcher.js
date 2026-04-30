// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-launcher.js — Unified QEEG Brain Map intake (Phase 3)
//
// One landing page where the clinician picks how to process their qEEG:
//   A) "Auto-analyze with AI" → routes to the auto-pipeline page
//      (pages-qeeg-analysis.js) which uploads + kicks off the backend MNE
//      pipeline + renders the brain-map report.
//   B) "Clean it myself first" → routes to the raw-cleaning workbench
//      (pages-qeeg-raw-launcher.js → pages-qeeg-raw-workbench.js) where the
//      user can mark bad channels / ICs, then the same backend pipeline
//      runs against the cleaned signal and produces the same report.
//
// Both paths feed the QEEGBrainMapReport contract from Phase 0, so the
// downstream report renderer (qeeg-patient-report.js / qeeg-clinician-report.js)
// is the same regardless of which path the user took.
//
// This launcher does NOT host the upload form itself. It deliberately routes
// to the existing flows so we don't duplicate upload state-machines or risk
// drift between two upload code paths.
//
// Exports:
//   pgQEEGLauncher(setTopbar, navigate)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _supportedFormatsLine() {
  return [
    '.edf', '.edf+', '.bdf', '.vhdr', '.set', '.fif',
  ].join(', ');
}

function _renderActionCard(opts) {
  // opts: { id, title, lead, body, badge, route }
  return ''
    + '<article class="qeeg-launcher__card ds-card" data-launcher-card="' + esc(opts.id) + '" '
    + 'role="link" tabindex="0" aria-label="' + esc(opts.title) + '" '
    + 'style="cursor:pointer;display:flex;flex-direction:column;gap:8px;padding:20px;border-radius:12px;border:1px solid var(--border-color);transition:transform .12s,box-shadow .12s">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
    + '<h3 style="margin:0;font-size:18px">' + esc(opts.title) + '</h3>'
    + (opts.badge ? '<span class="qeeg-ai-chip" style="--chip-color:#7c3aed">' + esc(opts.badge) + '</span>' : '')
    + '</div>'
    + '<p style="margin:0;font-size:14px;color:var(--text-secondary);line-height:1.5">' + esc(opts.lead) + '</p>'
    + '<ul style="margin:6px 0 0 18px;font-size:12.5px;color:var(--text-secondary);line-height:1.6">'
    + (opts.body || []).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('')
    + '</ul>'
    + '<div style="margin-top:auto;display:flex;justify-content:flex-end">'
    + '<button type="button" class="btn btn--primary" data-launcher-action="' + esc(opts.id) + '">'
    + esc(opts.cta || 'Continue') + ' →</button>'
    + '</div>'
    + '</article>';
}

function _renderHero() {
  return ''
    + '<header class="qeeg-launcher__hero ds-card" style="padding:24px;margin-bottom:18px">'
    + '<h2 style="margin:0 0 6px;font-size:22px">qEEG Brain Map</h2>'
    + '<p style="margin:0 0 4px;font-size:14px;color:var(--text-secondary);line-height:1.5">'
    + 'Upload a resting-state EEG and DeepSynaps will produce a brain map with normative percentiles, '
    + 'a 68-region drill-down, and an AI-generated narrative grounded in the evidence database.'
    + '</p>'
    + '<p style="margin:0;font-size:12px;color:var(--text-secondary)">'
    + 'Supported formats: ' + esc(_supportedFormatsLine()) + '.'
    + '</p>'
    + '</header>';
}

function _renderChoiceGrid() {
  return ''
    + '<section class="qeeg-launcher__choice" '
    + 'style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:18px">'
    + _renderActionCard({
        id: 'auto',
        title: 'Auto-analyze with AI',
        lead: 'Upload a recording and DeepSynaps runs the full MNE pipeline (artifact rejection, ICA, source localization, normative scoring) without manual intervention.',
        body: [
          'Best when: your recording is clean and you want a quick read.',
          'Time: typically 2–5 minutes per recording.',
          'You can still review and amend the AI narrative before signing.',
        ],
        cta: 'Start auto-analysis',
        badge: 'Recommended',
      })
    + _renderActionCard({
        id: 'manual',
        title: 'Clean it myself first',
        lead: 'Open the raw-cleaning workbench. Mark bad channels, drop noisy ICA components, then trigger the same pipeline against the cleaned signal.',
        body: [
          'Best when: noisy data or you want full provenance over what was rejected.',
          'You sign off on the cleaned signal before it enters the pipeline.',
          'Output uses the same brain-map template as the auto path.',
        ],
        cta: 'Open raw workbench',
      })
    + '</section>';
}

function _renderFooter() {
  return ''
    + '<section class="qeeg-launcher__footer ds-card" style="padding:16px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center">'
    + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">'
    + 'No recording on file? Both paths begin with patient + file selection on the next screen. '
    + 'You can also try a synthetic demo recording on the raw workbench page to explore the workflow.'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn--ghost btn--small" data-launcher-action="demo">Try with demo data</button>'
    + '<button type="button" class="btn btn--ghost btn--small" data-launcher-action="docs">What does this report contain?</button>'
    + '</div>'
    + '</section>';
}

function _renderDisclaimer() {
  return ''
    + '<footer class="qeeg-launcher__disclaimer ds-print" '
    + 'style="margin-top:18px;padding:12px;background:#f8fafc;border-radius:8px;font-size:11.5px;color:var(--text-secondary);line-height:1.5">'
    + 'Research and wellness use only. The brain map is informational and is not a medical diagnosis or '
    + 'treatment recommendation. Findings should be reviewed by a qualified clinician before any care '
    + 'decisions are made.'
    + '</footer>';
}

function renderQEEGLauncher() {
  return ''
    + '<section class="qeeg-launcher" data-page="qeeg-launcher">'
    + _renderHero()
    + _renderChoiceGrid()
    + _renderFooter()
    + _renderDisclaimer()
    + '</section>';
}

function _navigateTo(navigate, route) {
  if (typeof navigate === 'function') {
    navigate(route);
    return;
  }
  // Fallback: write the location hash directly. Matches the existing
  // app.js routing convention (#<page-id> or #<page-id>/<arg>).
  if (typeof window !== 'undefined' && window.location) {
    window.location.hash = '#' + route;
  }
}

function _wireActions(container, navigate) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  function _onAction(action) {
    if (action === 'auto') {
      _navigateTo(navigate, 'qeeg-analysis');
    } else if (action === 'manual') {
      _navigateTo(navigate, 'qeeg-raw-workbench');
    } else if (action === 'demo') {
      _navigateTo(navigate, 'qeeg-raw-workbench/demo');
    } else if (action === 'docs') {
      _navigateTo(navigate, 'handbooks-v2');
    }
  }
  Array.prototype.forEach.call(
    container.querySelectorAll('[data-launcher-action]'),
    function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        _onAction(btn.getAttribute('data-launcher-action'));
      });
    }
  );
  // Whole-card click + keyboard activation (so the cards behave as link-cards
  // for users who don't aim for the small CTA button).
  Array.prototype.forEach.call(
    container.querySelectorAll('[data-launcher-card]'),
    function (card) {
      var action = card.getAttribute('data-launcher-card');
      card.addEventListener('click', function () { _onAction(action); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _onAction(action);
        }
      });
    }
  );
}

async function pgQEEGLauncher(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('qEEG Brain Map');
  var el = (typeof document !== 'undefined') ? document.getElementById('content') : null;
  if (!el) return;
  el.innerHTML = renderQEEGLauncher();
  _wireActions(el, navigate);
}

export { renderQEEGLauncher, pgQEEGLauncher };
