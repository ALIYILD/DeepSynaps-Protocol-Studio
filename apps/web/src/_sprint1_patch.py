"""Sprint 1 patch - apply all remaining changes to pgPatientReports()"""
import sys, re, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('apps/web/src/pages-patient.js', 'r', encoding='utf-8') as f:
    src = f.read()

def apply(label, old, new):
    global src
    if old not in src:
        print(f'ERROR: anchor not found for: {label}', file=sys.stderr)
        idx = src.find(old[:50])
        if idx >= 0:
            print(f'  Partial match at {idx}: {repr(src[idx:idx+100])}', file=sys.stderr)
        sys.exit(1)
    src = src.replace(old, new, 1)
    print(f'OK  {label}')

# ── 1: deltaRow variable ──────────────────────────────────────────────────────
apply('deltaRow variable',
    '    // Plain-language section\n    const hasPl = Boolean(doc.plainLang);',
    '    // Delta — what changed since the most recent prior report of same template type\n'
    '    const delta = _ptComputeDelta(doc, docs);\n'
    "    let deltaRow = '';\n"
    '    if (delta !== null) {\n'
    '      const abs = Math.abs(delta.delta);\n'
    "      const dir = delta.delta < 0 ? 'dropped' : 'increased';\n"
    "      const tone = delta.delta < 0 ? 'This is a positive sign.' : 'Your care team is monitoring this.';\n"
    '      deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>'
    'Your score ${dir} by ${abs} point${abs !== 1 ? \'s\' : \'\'} since your last report on ${esc(delta.prevDate)}. ${tone}</div>`;\n'
    '    } else if (doc.score != null && doc.templateKey) {\n'
    '      deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>'
    'This is your first recorded result for this measure \u2014 future reports will show how you are progressing.</div>`;\n'
    '    }\n\n'
    '    // Plain-language section\n    const hasPl = Boolean(doc.plainLang);'
)

# ── 2: ${deltaRow} in plSection body ─────────────────────────────────────────
apply('deltaRow in plSection',
    "${doc.plainLang.why  ? `<div class=\"pt-doc-pl-row\"><span class=\"pt-doc-pl-label\">${t('patient.reports.doc.why')}</span>${esc(doc.plainLang.why)}</div>` : ''}\n"
    "           ${interpBand         ? `<div class=\"pt-doc-pl-row pt-doc-pl-row-hl\"><span class=\"pt-doc-pl-label\">${t('patient.reports.doc.what_means')}</span>${esc(interpBand.note)}</div>` : ''}",
    "${doc.plainLang.why  ? `<div class=\"pt-doc-pl-row\"><span class=\"pt-doc-pl-label\">${t('patient.reports.doc.why')}</span>${esc(doc.plainLang.why)}</div>` : ''}\n"
    "           ${deltaRow}\n"
    "           ${interpBand         ? `<div class=\"pt-doc-pl-row pt-doc-pl-row-hl\"><span class=\"pt-doc-pl-label\">${t('patient.reports.doc.what_means')}</span>${esc(interpBand.note)}</div>` : ''}"
)

# ── 3: Replace CTA section + actions col + add heroCardHTML + catSectionHTML ─
apply('CTA -> view/dl/ask + add heroCardHTML + catSectionHTML',
    "    // CTA\n"
    "    const ctaHtml = doc.url\n"
    "      ? `<a class=\"pt-doc-cta\" href=\"${esc(doc.url)}\" target=\"_blank\" rel=\"noopener noreferrer\"\n"
    "              aria-label=\"${t('patient.reports.doc.view')} ${esc(doc.title)}\"\n"
    "              tabindex=\"0\">${t('patient.reports.doc.view')}</a>`\n"
    "      : `<button class=\"pt-doc-cta pt-doc-cta-stub\"\n"
    "               onclick=\"window._ptViewDoc('${esc(doc.id)}')\"\n"
    "               aria-label=\"${t('patient.reports.doc.view')} ${esc(doc.title)}\">${t('patient.reports.doc.view')}</button>`;\n"
    "\n"
    "    return `\n"
    "      <div class=\"pt-doc-card\" data-cat=\"${esc(doc.category)}\" data-id=\"${esc(doc.id)}\">\n"
    "        <div class=\"pt-doc-card-top\">\n"
    "          <div class=\"pt-doc-icon\" style=\"background:${cm.bg};color:${cm.color}\" aria-hidden=\"true\">${cm.icon}</div>\n"
    "          <div class=\"pt-doc-main\">\n"
    "            <div class=\"pt-doc-title\">${esc(doc.title)}</div>\n"
    "            <div class=\"pt-doc-meta\">\n"
    "              <span class=\"pt-doc-date\">${esc(doc.displayDate)}</span>\n"
    "              <span class=\"pt-doc-type-label\" style=\"color:${cm.color}\">${esc(cm.label)}</span>\n"
    "              ${statusBadge}\n"
    "            </div>\n"
    "            ${chips ? `<div class=\"pt-doc-chips\">${chips}</div>` : ''}\n"
    "          </div>\n"
    "          <div class=\"pt-doc-actions-col\">\n"
    "            ${ctaHtml}\n"
    "            ${scoreHTML}\n"
    "          </div>\n"
    "        </div>\n"
    "        ${plSection}\n"
    "      </div>`;\n"
    "  }",

    "    // Actions\n"
    "    const viewCta = doc.url\n"
    "      ? `<a class=\"pt-doc-cta\" href=\"${esc(doc.url)}\" target=\"_blank\" rel=\"noopener noreferrer\"\n"
    "              aria-label=\"${t('patient.reports.doc.view')} ${esc(doc.title)}\"\n"
    "              tabindex=\"0\">${t('patient.reports.doc.view')}</a>`\n"
    "      : `<button class=\"pt-doc-cta pt-doc-cta-stub\"\n"
    "               onclick=\"window._ptViewDoc('${esc(doc.id)}')\"\n"
    "               aria-label=\"${t('patient.reports.doc.view')} ${esc(doc.title)}\">${t('patient.reports.doc.view')}</button>`;\n"
    "\n"
    "    const dlCta = doc.url\n"
    "      ? `<a class=\"pt-doc-cta pt-doc-cta-dl\" href=\"${esc(doc.url)}\" download\n"
    "              target=\"_blank\" rel=\"noopener noreferrer\"\n"
    "              aria-label=\"Download ${esc(doc.title)}\">Download</a>`\n"
    "      : '';\n"
    "\n"
    "    const askCta = `<button class=\"pt-doc-cta pt-doc-cta-ask\"\n"
    "             onclick=\"window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')\"\n"
    "             aria-label=\"Ask about ${esc(doc.title)}\">Ask about this</button>`;\n"
    "\n"
    "    return `\n"
    "      <div class=\"pt-doc-card\" data-cat=\"${esc(doc.category)}\" data-id=\"${esc(doc.id)}\">\n"
    "        <div class=\"pt-doc-card-top\">\n"
    "          <div class=\"pt-doc-icon\" style=\"background:${cm.bg};color:${cm.color}\" aria-hidden=\"true\">${cm.icon}</div>\n"
    "          <div class=\"pt-doc-main\">\n"
    "            <div class=\"pt-doc-title\">${esc(doc.title)}</div>\n"
    "            <div class=\"pt-doc-meta\">\n"
    "              <span class=\"pt-doc-date\">${esc(doc.displayDate)}</span>\n"
    "              <span class=\"pt-doc-type-label\" style=\"color:${cm.color}\">${esc(cm.label)}</span>\n"
    "              ${statusBadge}\n"
    "            </div>\n"
    "            ${chips ? `<div class=\"pt-doc-chips\">${chips}</div>` : ''}\n"
    "          </div>\n"
    "          <div class=\"pt-doc-actions-col\">\n"
    "            ${viewCta}\n"
    "            ${dlCta}\n"
    "            ${askCta}\n"
    "            ${scoreHTML}\n"
    "          </div>\n"
    "        </div>\n"
    "        ${plSection}\n"
    "      </div>`;\n"
    "  }\n"
    "\n"
    "  // \u2500\u2500 Hero card: latest report, visually elevated \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "  function heroCardHTML(doc) {\n"
    "    if (!doc) return '';\n"
    "    const cm = CAT_META[doc.category] || CAT_META['outcome'];\n"
    "    const pl = doc.plainLang;\n"
    "\n"
    "    // Reviewed badge \u2014 trusts status field or presence of clinician notes\n"
    "    const isReviewed = doc.status === 'reviewed' || Boolean(doc.clinicianNotes);\n"
    "    const reviewedBadge = isReviewed\n"
    "      ? `<span class=\"pt-hero-badge pt-hero-badge--reviewed\">&#10003;&nbsp;Reviewed by care team</span>`\n"
    "      : `<span class=\"pt-hero-badge pt-hero-badge--pending\">Awaiting review</span>`;\n"
    "\n"
    "    // Summary \u2014 plain-language what + why combined\n"
    "    const summary = pl\n"
    "      ? [pl.what, pl.why].filter(Boolean).join('. ')\n"
    "      : 'Your latest report is available from your care team.';\n"
    "\n"
    "    // What this means \u2014 score band interpretation or plain why\n"
    "    const interp = doc.scoreInterp;\n"
    "    let meansHTML = '';\n"
    "    if (interp) {\n"
    "      const scoreStr = doc.score != null ? esc(String(doc.score)) : '\u2014';\n"
    "      meansHTML = `<div class=\"pt-report-hero-means\">\n"
    "        <div class=\"pt-report-hero-means-label\">What this means</div>\n"
    "        <div class=\"pt-report-hero-means-text\">Your score of <strong>${scoreStr}</strong> puts you in the <strong>${esc(interp.label)}</strong> range. ${esc(interp.note)}</div>\n"
    "      </div>`;\n"
    "    } else if (pl && pl.why) {\n"
    "      meansHTML = `<div class=\"pt-report-hero-means\">\n"
    "        <div class=\"pt-report-hero-means-label\">What this means</div>\n"
    "        <div class=\"pt-report-hero-means-text\">${esc(pl.why)}</div>\n"
    "      </div>`;\n"
    "    }\n"
    "\n"
    "    // What changed \u2014 conservative language, never diagnostic\n"
    "    const heroDelta = _ptComputeDelta(doc, docs);\n"
    "    let deltaText = '';\n"
    "    if (heroDelta !== null) {\n"
    "      const abs = Math.abs(heroDelta.delta);\n"
    "      const dir = heroDelta.delta < 0 ? 'dropped' : 'increased';\n"
    "      const tone = heroDelta.delta < 0 ? 'This is a positive sign.' : 'Your care team is monitoring this.';\n"
    "      deltaText = `Your score ${dir} by <strong>${abs}</strong> point${abs !== 1 ? 's' : ''} since your last report on ${esc(heroDelta.prevDate)}. ${tone}`;\n"
    "    } else if (doc.score != null) {\n"
    "      deltaText = 'This is your first recorded result for this measure \u2014 future reports will show your progress over time.';\n"
    "    } else {\n"
    "      deltaText = 'Check back after your next session for updated results.';\n"
    "    }\n"
    "\n"
    "    // Actions\n"
    "    const viewBtn = doc.url\n"
    "      ? `<a class=\"pt-hero-action pt-hero-action--primary\" href=\"${esc(doc.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">View full report</a>`\n"
    "      : `<button class=\"pt-hero-action pt-hero-action--primary\" onclick=\"window._ptViewDoc('${esc(doc.id)}')\">View full report</button>`;\n"
    "\n"
    "    const dlBtn = doc.url\n"
    "      ? `<a class=\"pt-hero-action\" href=\"${esc(doc.url)}\" download target=\"_blank\" rel=\"noopener noreferrer\">Download</a>`\n"
    "      : '';\n"
    "\n"
    "    const askBtn = `<button class=\"pt-hero-action pt-hero-action--ask\" onclick=\"window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')\">Ask about this</button>`;\n"
    "\n"
    "    return `\n"
    "      <div class=\"pt-report-hero\" data-id=\"${esc(doc.id)}\">\n"
    "        <div class=\"pt-report-hero-head\">\n"
    "          <div class=\"pt-report-hero-icon\" style=\"background:${cm.bg};color:${cm.color}\" aria-hidden=\"true\">${cm.icon}</div>\n"
    "          <div class=\"pt-report-hero-meta\">\n"
    "            <div class=\"pt-report-hero-eyebrow\">Latest report</div>\n"
    "            <div class=\"pt-report-hero-title\">${esc(doc.title)}</div>\n"
    "            <div class=\"pt-report-hero-sub\">\n"
    "              <span class=\"pt-doc-date\">${esc(doc.displayDate)}</span>\n"
    "              <span class=\"pt-doc-type-label\" style=\"color:${cm.color}\">${esc(cm.label)}</span>\n"
    "            </div>\n"
    "          </div>\n"
    "          <div class=\"pt-report-hero-badge-wrap\">${reviewedBadge}</div>\n"
    "        </div>\n"
    "        <div class=\"pt-report-hero-body\">\n"
    "          <p class=\"pt-report-hero-summary\">${esc(summary)}</p>\n"
    "          ${meansHTML}\n"
    "          <div class=\"pt-report-hero-delta\">\n"
    "            <span class=\"pt-report-hero-delta-label\">What changed</span>\n"
    "            <span class=\"pt-report-hero-delta-text\">${deltaText}</span>\n"
    "          </div>\n"
    "        </div>\n"
    "        <div class=\"pt-report-hero-actions\">\n"
    "          ${viewBtn}\n"
    "          ${dlBtn}\n"
    "          ${askBtn}\n"
    "        </div>\n"
    "      </div>`;\n"
    "  }\n"
    "\n"
    "  // \u2500\u2500 Category section HTML \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "  function catSectionHTML(cat, items) {\n"
    "    const isOpen = cat.defaultOpen && items.length > 0;\n"
    "    const countBadge = items.length > 0\n"
    "      ? `<span class=\"pt-docs-cat-count\">${items.length}</span>`\n"
    "      : `<span class=\"pt-docs-cat-count pt-docs-cat-count--empty\">0</span>`;\n"
    "\n"
    "    const bodyContent = items.length > 0\n"
    "      ? items.map(d => docCardHTML(d)).join('')\n"
    "      : `<div class=\"pt-docs-cat-empty\">${esc(cat.emptyMsg)}</div>`;\n"
    "\n"
    "    return `\n"
    "      <div class=\"pt-docs-cat-section\" id=\"pt-cat-${esc(cat.id)}\">\n"
    "        <button class=\"pt-docs-cat-hd\" aria-expanded=\"${isOpen}\"\n"
    "                onclick=\"window._ptToggleCatSection('${esc(cat.id)}')\">\n"
    "          <span class=\"pt-docs-cat-icon\" style=\"background:${cat.bg};color:${cat.color}\" aria-hidden=\"true\">${cat.icon}</span>\n"
    "          <span class=\"pt-docs-cat-label\">${esc(cat.label)}</span>\n"
    "          ${countBadge}\n"
    "          <span class=\"pt-docs-cat-chev\" id=\"pt-cat-chev-${esc(cat.id)}\" aria-hidden=\"true\">${isOpen ? '\u25b4' : '\u25be'}</span>\n"
    "        </button>\n"
    "        <div class=\"pt-docs-cat-body\" id=\"pt-cat-body-${esc(cat.id)}\" ${isOpen ? '' : 'hidden'}>\n"
    "          ${bodyContent}\n"
    "        </div>\n"
    "      </div>`;\n"
    "  }"
)

# ── 4: Replace render + handlers using slice-based approach ──────────────────
# Find the start of byCourse grouping and the closing } of pgPatientReports

NEW_RENDER = (
    "  // \u2500\u2500 Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "  const latest = docs[0] || null;\n"
    "\n"
    "  el.innerHTML = `\n"
    "    <div class=\"pt-docs-wrap\">\n"
    "      <div id=\"pt-docs-ask-anchor\"></div>\n"
    "      ${heroCardHTML(latest)}\n"
    "      <div class=\"pt-docs-sections-wrap\">\n"
    "        ${DISPLAY_CATS.map(cat => catSectionHTML(cat, docs.filter(cat.filter))).join('')}\n"
    "      </div>\n"
    "    </div>`;\n"
    "\n"
    "  // \u2500\u2500 Interaction handlers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "\n"
    "  // Toggle collapsible category section\n"
    "  window._ptToggleCatSection = function(catId) {\n"
    "    const body = el.querySelector('#pt-cat-body-' + catId);\n"
    "    const chev = el.querySelector('#pt-cat-chev-' + catId);\n"
    "    const btn  = el.querySelector('#pt-cat-' + catId + ' .pt-docs-cat-hd');\n"
    "    if (!body) return;\n"
    "    const opening = body.hasAttribute('hidden');\n"
    "    if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }\n"
    "    if (chev) chev.textContent = opening ? '\u25b4' : '\u25be';\n"
    "    if (btn)  btn.setAttribute('aria-expanded', String(opening));\n"
    "  };\n"
    "\n"
    "  // Plain-language accordion (unchanged behaviour)\n"
    "  window._ptToggleDocPl = function(docId) {\n"
    "    const safeId = CSS.escape(docId);\n"
    "    const body = el.querySelector(`#pt-doc-pl-${safeId}`);\n"
    "    const chev = el.querySelector(`#chev-${safeId}`);\n"
    "    const btn  = el.querySelector(`[aria-controls=\"pt-doc-pl-${safeId}\"]`);\n"
    "    if (!body) return;\n"
    "    const opening = body.hasAttribute('hidden');\n"
    "    if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }\n"
    "    if (chev) chev.textContent = opening ? '\u25b4' : '\u25be';\n"
    "    if (btn)  btn.setAttribute('aria-expanded', String(opening));\n"
    "  };\n"
    "\n"
    "  // View document (unchanged \u2014 graceful unavailable notice)\n"
    "  window._ptViewDoc = function(docId) {\n"
    "    const doc = docs.find(d => String(d.id) === String(docId));\n"
    "    if (!doc) return;\n"
    "    if (doc.url) {\n"
    "      window.open(doc.url, '_blank', 'noopener,noreferrer');\n"
    "      return;\n"
    "    }\n"
    "    const card = el.querySelector(`[data-id=\"${CSS.escape(docId)}\"]`);\n"
    "    if (!card) return;\n"
    "    if (card.querySelector('.pt-doc-unavail')) return;\n"
    "    const notice = document.createElement('div');\n"
    "    notice.className = 'pt-doc-unavail';\n"
    "    notice.textContent = t('patient.media.doc_unavailable');\n"
    "    card.appendChild(notice);\n"
    "  };\n"
    "\n"
    "  // Ask about this \u2014 prepares a prefilled prompt and navigates to patient Messages\n"
    "  window._ptAskAbout = function(docId, title) {\n"
    "    const prompt = 'Explain \"' + title + '\" in simple language. What does this report mean for me?';\n"
    "    window._ptPendingAsk = prompt;\n"
    "    const anchor = el.querySelector('#pt-docs-ask-anchor');\n"
    "    if (!anchor) return;\n"
    "    anchor.innerHTML = `\n"
    "      <div class=\"pt-doc-ask-toast\" role=\"status\">\n"
    "        <span class=\"pt-doc-ask-toast-msg\">Your question is ready about: <em>${esc(title)}</em></span>\n"
    "        <button class=\"pt-doc-ask-toast-btn\" onclick=\"window._navPatient('patient-messages')\">Go to Messages \u2192</button>\n"
    "        <button class=\"pt-doc-ask-toast-close\" aria-label=\"Dismiss\"\n"
    "                onclick=\"document.querySelector('#pt-docs-ask-anchor').innerHTML=''\">&#10005;</button>\n"
    "      </div>`;\n"
    "    anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });\n"
    "  };\n"
    "}"
)

# Find start: "Build by-course" comment (uses actual U+2500 chars)
build_start = src.find('  // \u2500\u2500 Build by-course grouping \u2500')
if build_start < 0:
    print('ERROR: Build by-course marker not found', file=sys.stderr)
    sys.exit(1)

# Find the closing } of pgPatientReports: first occurrence of '}\n\n// ' after build_start
# The function ends with a lone '}' followed by a blank line and the next top-level section
end_of_fn = src.find('}\n\n//', build_start)
if end_of_fn < 0:
    print('ERROR: end of pgPatientReports not found', file=sys.stderr)
    sys.exit(1)

# Replace from build_start up to and including the closing '}'
old_section = src[build_start:end_of_fn + 1]  # +1 to include the '}'
src = src[:build_start] + NEW_RENDER + src[end_of_fn + 1:]
print('OK  render section replaced (slice)')

with open('apps/web/src/pages-patient.js', 'w', encoding='utf-8') as f:
    f.write(src)

print('\nAll patches applied and file written successfully.')
