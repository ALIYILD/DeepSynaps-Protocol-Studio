export function renderStandardsGuidelinesReferenceCard(inventory, search = null) {
  const sources = Array.isArray(inventory?.sources) ? inventory.sources : [];
  const disclaimer = inventory?.decision_support_disclaimer
    || search?.decision_support_disclaimer
    || 'Decision support only. Not legal or regulatory advice.';
  const matches = Array.isArray(search?.matched_resources) ? search.matched_resources : [];
  const sourceStatus = inventory?.search_status || search?.search_status || 'catalogued_only';

  const statusChips = sources.map((row) => {
    const state = String(row.lifecycle_state || row.status || 'unknown');
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:10.5px;font-weight:700;text-transform:uppercase;background:' +
      (state === 'degraded' ? 'rgba(234,179,8,0.14)' : 'rgba(148,163,184,0.15)') +
      ';color:' + (state === 'degraded' ? '#92400e' : 'var(--text-secondary)') + '">' +
      row.source + ' · ' + state +
    '</span>';
  }).join(' ');

  const sourceCards = sources.length ? sources.map((row) => {
    const warnings = Array.isArray(row.warnings) ? row.warnings : [];
    return '<article class="card" style="padding:12px 14px;border-left:3px solid ' +
      (String(row.lifecycle_state) === 'degraded' ? 'var(--amber)' : 'var(--border)') +
      ';margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-weight:700">' + row.title + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + row.source_kind + ' · ' + row.jurisdiction + ' · ' + row.access_type + '</div>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(15,23,42,0.05);text-transform:uppercase">' + row.lifecycle_state + '</span>' +
      '</div>' +
      '<div style="font-size:12px;margin-top:8px;line-height:1.5">' + row.clinical_utility_summary + '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Compliance relevance: ' + row.compliance_relevance + '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Access notes: ' + row.access_license_notes + '</div>' +
      '<div style="font-size:11px;margin-top:8px"><a href="' + row.url + '" target="_blank" rel="noreferrer">Source link</a></div>' +
      (warnings.length ? '<ul style="margin:8px 0 0 16px;padding:0;font-size:11px;color:var(--text-secondary)">' + warnings.slice(0, 3).map((w) => '<li>' + w + '</li>').join('') + '</ul>' : '') +
    '</article>';
  }).join('') : '<div style="font-size:12px;color:var(--text-secondary)">No standards/guideline sources available.</div>';

  const matchCards = matches.length ? matches.map((row) => {
    return '<article class="card" style="padding:12px 14px;margin-bottom:10px;border-left:3px solid var(--teal)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-weight:700">' + row.title + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + row.source_kind + ' · ' + row.jurisdiction + ' · score ' + row.match_score + '</div>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(13,148,136,0.12);text-transform:uppercase">match</span>' +
      '</div>' +
      '<div style="font-size:12px;margin-top:8px;line-height:1.5">' + row.summary + '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Relevance: ' + row.compliance_relevance + '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Limitations: ' + (Array.isArray(row.limitations) ? row.limitations.join('; ') : '') + '</div>' +
      '<div style="font-size:11px;margin-top:8px"><a href="' + row.url + '" target="_blank" rel="noreferrer">Source link</a></div>' +
    '</article>';
  }).join('') : '<div style="font-size:12px;color:var(--text-secondary)">Structured search unavailable; showing catalogued references only.</div>';

  return (
    '<section class="card" style="padding:14px;margin-top:14px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Standards &amp; guidelines references</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Compliance-awareness reference only. Not a compliance certification, not legal advice, and not clinical efficacy evidence.</div>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(15,23,42,0.05);text-transform:uppercase">' + sourceStatus + '</span>' +
      '</div>' +
      '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">' + statusChips + '</div>' +
      '<div style="margin-top:10px;font-size:12px;line-height:1.55;color:var(--text-secondary)">' + disclaimer + '</div>' +
      '<div style="margin-top:12px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Catalogued sources</div>' +
        sourceCards +
      '</div>' +
      '<div style="margin-top:12px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Reference matches</div>' +
        matchCards +
      '</div>' +
    '</section>'
  );
}

