// ─────────────────────────────────────────────────────────────────────────────
// qeeg-dk-atlas.js — Desikan-Killiany 68-ROI → lobe grouping
//
// Used by the eLORETA ROI panel in pages-qeeg-analysis.js to group
// per-ROI band power into {frontal, parietal, temporal, occipital,
// cingulate, insular}. ROI names match FreeSurfer's aparc convention
// (lh.<label>, rh.<label>, or plain <label>) — the helper strips the
// hemisphere prefix before lookup.
//
// Lobe assignment follows the standard DK atlas lobe partitioning used
// by Klein & Tourville (2012) and the FreeSurfer documentation.
// ─────────────────────────────────────────────────────────────────────────────

export const DK_LOBES = [
  'frontal',
  'parietal',
  'temporal',
  'occipital',
  'cingulate',
  'insular',
];

// Map of bare DK label -> lobe. 34 labels per hemisphere × 2 hemispheres = 68.
export const DK_LOBE_MAP = {
  // ── Frontal (11 per hemisphere) ────────────────────────────────────────────
  'superiorfrontal':           'frontal',
  'rostralmiddlefrontal':      'frontal',
  'caudalmiddlefrontal':       'frontal',
  'parsopercularis':           'frontal',
  'parstriangularis':          'frontal',
  'parsorbitalis':             'frontal',
  'lateralorbitofrontal':      'frontal',
  'medialorbitofrontal':       'frontal',
  'precentral':                'frontal',
  'paracentral':               'frontal',
  'frontalpole':               'frontal',

  // ── Parietal (5) ───────────────────────────────────────────────────────────
  'superiorparietal':          'parietal',
  'inferiorparietal':          'parietal',
  'supramarginal':             'parietal',
  'postcentral':               'parietal',
  'precuneus':                 'parietal',

  // ── Temporal (9) ───────────────────────────────────────────────────────────
  'superiortemporal':          'temporal',
  'middletemporal':            'temporal',
  'inferiortemporal':          'temporal',
  'bankssts':                  'temporal',
  'fusiform':                  'temporal',
  'transversetemporal':        'temporal',
  'entorhinal':                'temporal',
  'temporalpole':              'temporal',
  'parahippocampal':           'temporal',

  // ── Occipital (4) ──────────────────────────────────────────────────────────
  'lateraloccipital':          'occipital',
  'lingual':                   'occipital',
  'cuneus':                    'occipital',
  'pericalcarine':             'occipital',

  // ── Cingulate (4) ──────────────────────────────────────────────────────────
  'rostralanteriorcingulate':  'cingulate',
  'caudalanteriorcingulate':   'cingulate',
  'posteriorcingulate':        'cingulate',
  'isthmuscingulate':          'cingulate',

  // ── Insular (1) ────────────────────────────────────────────────────────────
  'insula':                    'insular',
};

// Pretty-printable label for a bare DK ROI key.
export function formatDKLabel(key) {
  if (!key) return '';
  // Strip hemisphere prefix (lh./rh./left-/right-) if present
  var bare = String(key).replace(/^(lh|rh|left|right)[-_.]/i, '');
  // Insert spaces before internal capitals and title-case
  var pretty = bare
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  return pretty;
}

// Return 'lh' | 'rh' | '' based on the hemisphere prefix in the raw ROI key.
export function hemisphereOf(key) {
  if (!key) return '';
  var s = String(key).toLowerCase();
  if (s.startsWith('lh.') || s.startsWith('lh-') || s.startsWith('lh_')) return 'lh';
  if (s.startsWith('rh.') || s.startsWith('rh-') || s.startsWith('rh_')) return 'rh';
  if (s.startsWith('left-') || s.startsWith('left.') || s.startsWith('left_')) return 'lh';
  if (s.startsWith('right-') || s.startsWith('right.') || s.startsWith('right_')) return 'rh';
  return '';
}

// Return the lobe for a raw ROI key, or 'other' if the label is not in DK_LOBE_MAP.
export function lobeOf(key) {
  if (!key) return 'other';
  var bare = String(key).replace(/^(lh|rh|left|right)[-_.]/i, '').toLowerCase();
  return DK_LOBE_MAP[bare] || 'other';
}

// Group a flat ROI power map `{roi_key: float}` into `{lobe: [{key, label, hemi, value}, ...]}`.
export function groupROIsByLobe(roiMap) {
  var out = {};
  DK_LOBES.forEach(function (l) { out[l] = []; });
  out.other = [];
  if (!roiMap) return out;
  Object.keys(roiMap).forEach(function (key) {
    var lobe = lobeOf(key);
    out[lobe].push({
      key: key,
      label: formatDKLabel(key),
      hemi: hemisphereOf(key),
      value: roiMap[key],
    });
  });
  // Sort each lobe bucket by power descending for a sensible render order.
  Object.keys(out).forEach(function (l) {
    out[l].sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
  });
  return out;
}
