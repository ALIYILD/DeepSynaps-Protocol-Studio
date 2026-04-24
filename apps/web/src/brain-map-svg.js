// ─────────────────────────────────────────────────────────────────────────────
// brain-map-svg.js — Shared 10-20 EEG brain map renderer
//
// Exports:
//   SITES_10_20          — 19 standard 10-20 sites + Oz midline (20 total)
//   renderBrainMap10_20  — returns complete SVG HTML string for the brain map
//
// Used by:
//   apps/web/src/pages-clinical-hubs.js  (Protocol Hub → Brain Map tab)
//   apps/web/src/pages-clinical-tools.js (standalone Brain Map Planner)
// ─────────────────────────────────────────────────────────────────────────────

// 19 standard 10-20 sites + Oz occipital midline. Coordinates are normalized
// to the head-circle radius: (x,y) in [-1, +1] where -y = toward nose (top of
// screen) and +y = toward inion (bottom). Mapped to SVG as:
//   cx = 200 + x * 160      cy = 200 + y * 160
export const SITES_10_20 = [
  { id: 'Fp1', x: -0.30, y: -0.84, lobe: 'frontal'   },
  { id: 'Fp2', x:  0.30, y: -0.84, lobe: 'frontal'   },
  { id: 'F7',  x: -0.75, y: -0.52, lobe: 'frontal'   },
  { id: 'F3',  x: -0.42, y: -0.52, lobe: 'frontal'   },
  { id: 'Fz',  x:  0.00, y: -0.55, lobe: 'frontal'   },
  { id: 'F4',  x:  0.42, y: -0.52, lobe: 'frontal'   },
  { id: 'F8',  x:  0.75, y: -0.52, lobe: 'frontal'   },
  { id: 'T7',  x: -0.90, y:  0.00, lobe: 'temporal'  },
  { id: 'C3',  x: -0.45, y:  0.00, lobe: 'central'   },
  { id: 'Cz',  x:  0.00, y:  0.00, lobe: 'central'   },
  { id: 'C4',  x:  0.45, y:  0.00, lobe: 'central'   },
  { id: 'T8',  x:  0.90, y:  0.00, lobe: 'temporal'  },
  { id: 'P7',  x: -0.75, y:  0.52, lobe: 'temporal'  },
  { id: 'P3',  x: -0.42, y:  0.52, lobe: 'parietal'  },
  { id: 'Pz',  x:  0.00, y:  0.55, lobe: 'parietal'  },
  { id: 'P4',  x:  0.42, y:  0.52, lobe: 'parietal'  },
  { id: 'P8',  x:  0.75, y:  0.52, lobe: 'temporal'  },
  { id: 'O1',  x: -0.30, y:  0.84, lobe: 'occipital' },
  { id: 'Oz',  x:  0.00, y:  0.90, lobe: 'occipital' },
  { id: 'O2',  x:  0.30, y:  0.84, lobe: 'occipital' },
];

// Map a "target region" label (e.g. 'DLPFC-L') to an anchor electrode and
// a human-readable caption. Null means "no ring overlay."
const TARGET_REGION_MAP = {
  'DLPFC-L':    { anchor: 'F3', caption: 'Left DLPFC target'    },
  'DLPFC-R':    { anchor: 'F4', caption: 'Right DLPFC target'   },
  'DLPFC-B':    { anchor: 'F3', caption: 'Bilateral DLPFC'      },
  'M1-L':       { anchor: 'C3', caption: 'Left M1 target'       },
  'M1-R':       { anchor: 'C4', caption: 'Right M1 target'      },
  'SMA':        { anchor: 'Cz', caption: 'SMA target'           },
  'mPFC':       { anchor: 'Fz', caption: 'Medial PFC target'    },
  'DMPFC':      { anchor: 'Fz', caption: 'Dorsomedial PFC'      },
  'VMPFC':      { anchor: 'Fz', caption: 'Ventromedial PFC'     },
  'ACC':        { anchor: 'Fz', caption: 'Anterior Cingulate'   },
  'IFG-L':      { anchor: 'F7', caption: 'Left IFG target'      },
  'IFG-R':      { anchor: 'F8', caption: 'Right IFG target'     },
  'TEMPORAL-L': { anchor: 'T7', caption: 'Left Temporal target' },
  'TEMPORAL-R': { anchor: 'T8', caption: 'Right Temporal target'},
  'V1':         { anchor: 'Oz', caption: 'Primary Visual (V1)'  },
};

function toSvg(x, y) {
  return [200 + x * 160, 200 + y * 160];
}

// Render a radial lobe-tint "pie slice" clipped to the head circle.
// startDeg/endDeg measured clockwise from 12 o'clock (nose).
function lobeArc(startDeg, endDeg, fill) {
  const cx = 200, cy = 200, r = 160;
  // Convert clockwise-from-top to standard SVG radians (counter-clockwise from +x)
  const a1 = (startDeg - 90) * Math.PI / 180;
  const a2 = (endDeg - 90)   * Math.PI / 180;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return '<path d="M' + cx + ',' + cy
    + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2)
    + ' A' + r + ',' + r + ' 0 ' + large + ',1 '
    + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + fill + '"/>';
}

/**
 * renderBrainMap10_20(options) → SVG HTML string
 *
 * @param {object} options
 * @param {string|null} options.anode           Electrode ID (e.g. 'F3') or null
 * @param {string|null} options.cathode         Electrode ID or null
 * @param {string|null} options.targetRegion    'DLPFC-L' | 'DLPFC-R' | ... or null
 * @param {number}      options.size            SVG width/height in px (default 360)
 * @param {boolean}     options.showZones       Lobe tint bands (default true)
 * @param {boolean}     options.showConnection  Anode↔cathode dashed line (default true)
 * @param {boolean}     options.showEarsAndNose Nose triangle + ear ellipses (default true)
 * @param {string[]}    options.highlightSites  Extra electrode IDs to highlight dimly
 */
export function renderBrainMap10_20(options) {
  const opts = options || {};
  const anode   = opts.anode   || null;
  const cathode = opts.cathode || null;
  const targetRegion   = opts.targetRegion   || null;
  const size           = Number.isFinite(opts.size) ? opts.size : 360;
  const showZones      = opts.showZones      !== false;
  const showConnection = opts.showConnection !== false;
  const showEarsAndNose = opts.showEarsAndNose !== false;
  const highlightSites = Array.isArray(opts.highlightSites) ? opts.highlightSites : [];

  const parts = [];
  parts.push('<svg class="ds-brain-map" viewBox="0 0 400 400" width="' + size + '" height="' + size
    + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="10-20 EEG electrode map" tabindex="0">');

  // Defs: gradient for connection line + clip path for lobe zones
  parts.push('<defs>');
  parts.push('<linearGradient id="bm-connect-grad" x1="0%" y1="0%" x2="100%" y2="0%">'
    + '<stop offset="0%"   stop-color="#00d4bc"/>'
    + '<stop offset="100%" stop-color="#ff6b9d"/>'
    + '</linearGradient>');
  parts.push('<clipPath id="bm-head-clip"><circle cx="200" cy="200" r="160"/></clipPath>');
  parts.push('</defs>');

  // 1. Lobe zones (clipped to head circle)
  if (showZones) {
    parts.push('<g class="ds-bm-zones" clip-path="url(#bm-head-clip)">');
    // Frontal top wedge (315° → 45°, i.e. -45 to +45 from top)
    parts.push(lobeArc(315, 360, 'rgba(74,158,255,0.06)'));
    parts.push(lobeArc(0,   45,  'rgba(74,158,255,0.06)'));
    // Right temporal (45°–75°) violet, right central band (75°–105°) teal
    parts.push(lobeArc(45,  75,  'rgba(167,139,250,0.05)'));
    parts.push(lobeArc(75,  105, 'rgba(0,212,188,0.06)'));
    // Right parietal (105°–135°) amber
    parts.push(lobeArc(105, 135, 'rgba(245,158,11,0.05)'));
    // Occipital bottom (135°–225°) red
    parts.push(lobeArc(135, 225, 'rgba(239,68,68,0.05)'));
    // Left parietal (225°–255°) amber, left central (255°–285°) teal, left temporal (285°–315°) violet
    parts.push(lobeArc(225, 255, 'rgba(245,158,11,0.05)'));
    parts.push(lobeArc(255, 285, 'rgba(0,212,188,0.06)'));
    parts.push(lobeArc(285, 315, 'rgba(167,139,250,0.05)'));
    parts.push('</g>');
  }

  // 2. Head outline (visible!)
  parts.push('<circle class="ds-bm-head" cx="200" cy="200" r="160" fill="none" '
    + 'stroke="rgba(255,255,255,0.35)" stroke-width="2"/>');

  // 3. Inner ring (10% perimeter helper)
  parts.push('<circle class="ds-bm-inner-ring" cx="200" cy="200" r="128" fill="none" '
    + 'stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,3"/>');

  // 4 & 5. Nose + Ears
  if (showEarsAndNose) {
    // Nose triangle pointing up at top
    parts.push('<polygon class="ds-bm-nose" points="200,28 188,48 212,48" '
      + 'fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" '
      + 'stroke-linejoin="round"/>');
    // Left ear bump
    parts.push('<ellipse class="ds-bm-ear" cx="34" cy="200" rx="10" ry="24" '
      + 'fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
    // Right ear bump
    parts.push('<ellipse class="ds-bm-ear" cx="366" cy="200" rx="10" ry="24" '
      + 'fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  }

  // 6. Midline + coronal guides
  parts.push('<line class="ds-bm-guide" x1="200" y1="40" x2="200" y2="360" '
    + 'stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="2,4"/>');
  parts.push('<line class="ds-bm-guide" x1="40" y1="200" x2="360" y2="200" '
    + 'stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="2,4"/>');

  // 7. Hemisphere labels
  parts.push('<text class="ds-bm-hemi" x="70" y="210" text-anchor="middle" '
    + 'font-size="11" fill="rgba(255,255,255,0.3)" font-family="system-ui, -apple-system, sans-serif">L</text>');
  parts.push('<text class="ds-bm-hemi" x="330" y="210" text-anchor="middle" '
    + 'font-size="11" fill="rgba(255,255,255,0.3)" font-family="system-ui, -apple-system, sans-serif">R</text>');

  // Target region ring overlay (dashed ring around anchor electrode) + caption
  let targetSiteId = null;
  if (targetRegion && TARGET_REGION_MAP[targetRegion]) {
    const tr = TARGET_REGION_MAP[targetRegion];
    targetSiteId = tr.anchor;
    const site = SITES_10_20.find(s => s.id === tr.anchor);
    if (site) {
      const [tx, ty] = toSvg(site.x, site.y);
      parts.push('<circle class="ds-bm-target-ring" cx="' + tx + '" cy="' + ty + '" r="30"/>');
      // Leader line + caption text (placed outside the head on the same side as the anchor)
      const captionOnLeft = site.x < 0;
      const leaderX1 = tx + (captionOnLeft ? -30 : 30);
      const leaderY1 = ty;
      const leaderX2 = captionOnLeft ? 18 : 382;
      const leaderY2 = ty - 24;
      parts.push('<line class="ds-bm-target-leader" x1="' + leaderX1 + '" y1="' + leaderY1
        + '" x2="' + leaderX2 + '" y2="' + leaderY2
        + '" stroke="rgba(74,158,255,0.45)" stroke-width="1" stroke-dasharray="2,2"/>');
      parts.push('<text class="ds-bm-target-caption" x="' + leaderX2 + '" y="' + (leaderY2 - 4)
        + '" text-anchor="' + (captionOnLeft ? 'start' : 'end')
        + '" font-size="10" font-weight="600" fill="#4a9eff" '
        + 'font-family="system-ui, -apple-system, sans-serif">' + tr.caption + '</text>');
    }
  }

  // 8. Connection line (anode ↔ cathode)
  if (showConnection && anode && cathode) {
    const a = SITES_10_20.find(s => s.id === anode);
    const c = SITES_10_20.find(s => s.id === cathode);
    if (a && c) {
      const [ax, ay] = toSvg(a.x, a.y);
      const [cx, cy] = toSvg(c.x, c.y);
      parts.push('<line class="ds-bm-connect" x1="' + ax + '" y1="' + ay
        + '" x2="' + cx + '" y2="' + cy
        + '" stroke="url(#bm-connect-grad)" stroke-width="2.5" stroke-dasharray="6,4"/>');
    }
  }

  // 9. Electrodes (rendered last so they sit on top)
  SITES_10_20.forEach(site => {
    const [sx, sy] = toSvg(site.x, site.y);
    const isAnode   = site.id === anode;
    const isCathode = site.id === cathode;
    const isTarget  = site.id === targetSiteId;
    const isHL      = highlightSites.indexOf(site.id) !== -1;

    let fill, stroke, strokeWidth, textFill, dash;
    if (isAnode) {
      fill = '#00d4bc';
      stroke = 'rgba(255,255,255,0.85)';
      strokeWidth = 2;
      textFill = '#0a1020';
      dash = '';
    } else if (isCathode) {
      fill = '#ff6b9d';
      stroke = 'rgba(255,255,255,0.85)';
      strokeWidth = 2;
      textFill = '#0a1020';
      dash = '';
    } else if (isTarget) {
      fill = 'rgba(74,158,255,0.25)';
      stroke = '#4a9eff';
      strokeWidth = 1.5;
      textFill = 'rgba(255,255,255,0.95)';
      dash = ' stroke-dasharray="3,2"';
    } else if (isHL) {
      fill = 'rgba(74,158,255,0.18)';
      stroke = 'rgba(74,158,255,0.5)';
      strokeWidth = 1.2;
      textFill = 'rgba(255,255,255,0.85)';
      dash = '';
    } else {
      fill = 'rgba(20,30,50,0.85)';
      stroke = 'rgba(255,255,255,0.2)';
      strokeWidth = 1;
      textFill = 'rgba(255,255,255,0.9)';
      dash = '';
    }

    const classes = ['ds-bm-electrode'];
    if (isAnode)   classes.push('is-anode');
    if (isCathode) classes.push('is-cathode');
    if (isTarget)  classes.push('is-target');

    // Outer halo (only visible for active electrodes via color; transparent otherwise)
    const haloStroke = (isAnode || isCathode)
      ? (isAnode ? '#00d4bc' : '#ff6b9d')
      : 'transparent';
    const haloOpacity = (isAnode || isCathode) ? 0.25 : 0;

    parts.push('<g class="' + classes.join(' ') + '" data-site="' + site.id
      + '" data-lobe="' + site.lobe + '" style="color:' + (isAnode ? '#00d4bc' : isCathode ? '#ff6b9d' : 'transparent') + '">');
    parts.push('<title>' + site.id + ' \u2014 ' + site.lobe + ' lobe</title>');
    parts.push('<circle class="ds-bm-halo" cx="' + sx + '" cy="' + sy + '" r="22" '
      + 'fill="transparent" stroke="' + haloStroke + '" stroke-width="2" opacity="' + haloOpacity + '"/>');
    parts.push('<circle class="ds-bm-chip" cx="' + sx + '" cy="' + sy + '" r="18" '
      + 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"' + dash + '/>');
    parts.push('<text class="ds-bm-label" x="' + sx + '" y="' + (sy + 4) + '" '
      + 'text-anchor="middle" font-size="11" font-weight="600" '
      + 'fill="' + textFill + '" font-family="system-ui, -apple-system, sans-serif" '
      + 'pointer-events="none">' + site.id + '</text>');
    parts.push('</g>');
  });

  parts.push('</svg>');
  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// renderTopoHeatmap — Power-colored electrode heatmap for qEEG analysis
//
// bandPowers: { [channelName]: number } — absolute or relative power per site
// options.band:      string — band name shown in legend (e.g. "alpha")
// options.unit:      string — unit label (e.g. "uV^2" or "%")
// options.size:      number — SVG width/height (default 360)
// options.colorScale: 'warm'|'cool'|'diverging' (default 'warm')
// ─────────────────────────────────────────────────────────────────────────────

const HEATMAP_PALETTES = {
  warm:      ['#0d1b2a', '#1b2838', '#2a4858', '#3a7ca5', '#56b870', '#d4e157', '#ffca28', '#ff7043', '#e53935'],
  cool:      ['#0d1b2a', '#1a237e', '#283593', '#3949ab', '#42a5f5', '#4fc3f7', '#80deea', '#b2ebf2', '#e0f7fa'],
  diverging: ['#2196f3', '#64b5f6', '#bbdefb', '#e0e0e0', '#ffcdd2', '#ef5350', '#c62828'],
  colorblind: ['#0d1b2a', '#253494', '#2c7fb8', '#41b6c4', '#a1dab4', '#ffffcc', '#fed976', '#fd8d3c', '#e31a1c'],
};

function _interpolateColor(palette, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (palette.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, palette.length - 1);
  const frac = idx - lo;
  const c1 = _hexToRgb(palette[lo]);
  const c2 = _hexToRgb(palette[hi]);
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function _hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function renderTopoHeatmap(bandPowers, options) {
  const opts = options || {};
  const band = opts.band || 'power';
  const unit = opts.unit || '';
  const size = Number.isFinite(opts.size) ? opts.size : 360;
  const palette = HEATMAP_PALETTES[opts.colorScale] || HEATMAP_PALETTES.warm;

  // Compute min/max for normalization
  const values = [];
  SITES_10_20.forEach(function (site) {
    const v = bandPowers[site.id];
    if (v !== undefined && v !== null && Number.isFinite(v)) values.push(v);
  });
  const vMin = values.length ? Math.min.apply(null, values) : 0;
  const vMax = values.length ? Math.max.apply(null, values) : 1;
  const range = vMax - vMin || 1;

  const parts = [];
  parts.push('<svg class="ds-topo-heatmap" viewBox="0 0 400 430" width="' + size + '" height="' + Math.round(size * 430 / 400) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="qEEG topographic heatmap — ' + band + '" tabindex="0">');

  // Defs: radial gradients per electrode for smooth interpolation
  parts.push('<defs><clipPath id="th-head-clip"><circle cx="200" cy="200" r="160"/></clipPath></defs>');

  // Background head
  parts.push('<circle cx="200" cy="200" r="160" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>');

  // Radial gradient fills per electrode (clipped to head)
  parts.push('<g clip-path="url(#th-head-clip)">');
  SITES_10_20.forEach(function (site) {
    const v = bandPowers[site.id];
    if (v === undefined || v === null) return;
    const t = (v - vMin) / range;
    const color = _interpolateColor(palette, t);
    const cx = 200 + site.x * 160;
    const cy = 200 + site.y * 160;
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="60" fill="' + color + '" opacity="0.55"/>');
  });
  parts.push('</g>');

  // Head outline
  parts.push('<circle cx="200" cy="200" r="160" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>');

  // Nose + ears
  parts.push('<polygon points="200,28 188,48 212,48" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="34" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="366" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');

  // Electrode dots with value labels and tooltips
  SITES_10_20.forEach(function (site) {
    const v = bandPowers[site.id];
    const cx = 200 + site.x * 160;
    const cy = 200 + site.y * 160;
    const hasValue = v !== undefined && v !== null && Number.isFinite(v);
    const t = hasValue ? (v - vMin) / range : 0;
    const dotColor = hasValue ? _interpolateColor(palette, t) : 'rgba(30,40,60,0.8)';
    const textVal = hasValue ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) : '-';
    const tooltipText = site.id + ' (' + site.lobe + ')' + (hasValue ? ': ' + textVal + (unit ? ' ' + unit : '') : ': no data');

    parts.push('<g class="ds-topo-electrode">');
    parts.push('<title>' + tooltipText + '</title>');
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="14" fill="' + dotColor + '" stroke="rgba(255,255,255,0.6)" stroke-width="1.2"/>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy - 2).toFixed(1) + '" text-anchor="middle" font-size="7" font-weight="600" fill="rgba(255,255,255,0.95)" font-family="system-ui,sans-serif">' + site.id + '</text>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 8).toFixed(1) + '" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + textVal + '</text>');
    parts.push('</g>');
  });

  // Color-bar legend below the head
  const legendY = 380;
  const legendW = 240;
  const legendX = 80;
  for (let i = 0; i < legendW; i++) {
    const color = _interpolateColor(palette, i / legendW);
    parts.push('<rect x="' + (legendX + i) + '" y="' + legendY + '" width="1.5" height="10" fill="' + color + '"/>');
  }
  parts.push('<rect x="' + legendX + '" y="' + legendY + '" width="' + legendW + '" height="10" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" rx="2"/>');
  parts.push('<text x="' + legendX + '" y="' + (legendY + 22) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + vMin.toFixed(1) + '</text>');
  parts.push('<text x="' + (legendX + legendW) + '" y="' + (legendY + 22) + '" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + vMax.toFixed(1) + '</text>');
  parts.push('<text x="200" y="' + (legendY + 22) + '" text-anchor="middle" font-size="9" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + band + (unit ? ' (' + unit + ')' : '') + '</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderConnectivityMatrix — NxN color-coded coherence/connectivity grid
//
// matrix:       2D array [N][N] of values 0-1
// channelNames: array of N channel name strings
// options.band: string — band label (e.g. "alpha")
// options.size: number — SVG width/height (default 400)
// ─────────────────────────────────────────────────────────────────────────────

export function renderConnectivityMatrix(matrix, channelNames, options) {
  const opts = options || {};
  const band = opts.band || 'coherence';
  const n = channelNames.length;
  if (n === 0 || !matrix || !matrix.length) return '<div>No data</div>';

  const cellSize = Math.max(12, Math.min(28, Math.floor(320 / n)));
  const labelSpace = 40;
  const totalSize = labelSpace + n * cellSize;
  const size = opts.size || Math.max(totalSize + 30, 300);

  const palette = ['#0d1b2a', '#1a237e', '#283593', '#42a5f5', '#66bb6a', '#d4e157', '#ffca28', '#ff7043', '#e53935'];

  function colorForValue(v) {
    var clamped = Math.max(0, Math.min(1, v));
    var idx = clamped * (palette.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.min(lo + 1, palette.length - 1);
    var frac = idx - lo;
    var c1 = _hexToRgb(palette[lo]);
    var c2 = _hexToRgb(palette[hi]);
    var r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
    var g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
    var b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var parts = [];
  parts.push('<svg class="ds-conn-matrix" viewBox="0 0 ' + (totalSize + 30) + ' ' + (totalSize + 50) + '" width="' + size + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Connectivity matrix — ' + band + '" tabindex="0">');

  // Column labels (rotated)
  for (var c = 0; c < n; c++) {
    var cx = labelSpace + c * cellSize + cellSize / 2;
    parts.push('<text x="' + cx + '" y="' + (labelSpace - 4) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" transform="rotate(-45,' + cx + ',' + (labelSpace - 4) + ')">' + channelNames[c] + '</text>');
  }

  // Row labels + cells
  for (var r = 0; r < n; r++) {
    var ry = labelSpace + r * cellSize;
    parts.push('<text x="' + (labelSpace - 4) + '" y="' + (ry + cellSize / 2 + 3) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + channelNames[r] + '</text>');

    for (var col = 0; col < n; col++) {
      var val = (matrix[r] && matrix[r][col] != null) ? matrix[r][col] : 0;
      var cx2 = labelSpace + col * cellSize;
      var color = colorForValue(val);
      parts.push('<rect x="' + cx2 + '" y="' + ry + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + color + '" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"><title>' + channelNames[r] + '-' + channelNames[col] + ': ' + val.toFixed(2) + '</title></rect>');
    }
  }

  // Color bar legend
  var legendY2 = totalSize + 10;
  var legendW2 = Math.min(200, totalSize - labelSpace);
  var legendX2 = labelSpace;
  for (var i = 0; i < legendW2; i++) {
    parts.push('<rect x="' + (legendX2 + i) + '" y="' + legendY2 + '" width="1.5" height="8" fill="' + colorForValue(i / legendW2) + '"/>');
  }
  parts.push('<text x="' + legendX2 + '" y="' + (legendY2 + 18) + '" font-size="8" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">0</text>');
  parts.push('<text x="' + (legendX2 + legendW2) + '" y="' + (legendY2 + 18) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">1</text>');
  parts.push('<text x="' + (legendX2 + legendW2 / 2) + '" y="' + (legendY2 + 18) + '" text-anchor="middle" font-size="8" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + band + '</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderConnectivityBrainMap — brain map with colored lines for connectivity
//
// connections: array of {ch1, ch2, value} (value 0-1)
// options.size:      number — SVG size (default 360)
// options.threshold: number — min value to draw a line (default 0.3)
// options.band:      string — band label
// ─────────────────────────────────────────────────────────────────────────────

// Map backend channel names (T3/T4/T5/T6) to frontend SVG names (T7/T8/P7/P8)
var _BACKEND_TO_SVG = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };

function _mapChannel(ch) {
  return _BACKEND_TO_SVG[ch] || ch;
}

export function renderConnectivityBrainMap(connections, options) {
  var opts = options || {};
  var size = Number.isFinite(opts.size) ? opts.size : 360;
  var threshold = opts.threshold != null ? opts.threshold : 0.3;
  var band = opts.band || 'connectivity';

  var parts = [];
  parts.push('<svg class="ds-conn-brain" viewBox="0 0 400 430" width="' + size + '" height="' + Math.round(size * 430 / 400) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Connectivity brain map — ' + band + '" tabindex="0">');

  // Head circle
  parts.push('<circle cx="200" cy="200" r="160" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>');
  // Nose + ears
  parts.push('<polygon points="200,28 188,48 212,48" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="34" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="366" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');

  // Build site lookup (use SVG names)
  var siteMap = {};
  SITES_10_20.forEach(function(s) { siteMap[s.id] = s; });

  // Draw connections as lines with opacity/width proportional to value
  if (connections && connections.length) {
    connections.forEach(function(conn) {
      if (conn.value < threshold) return;
      var s1 = siteMap[_mapChannel(conn.ch1)];
      var s2 = siteMap[_mapChannel(conn.ch2)];
      if (!s1 || !s2) return;

      var x1 = 200 + s1.x * 160, y1 = 200 + s1.y * 160;
      var x2 = 200 + s2.x * 160, y2 = 200 + s2.y * 160;
      var opacity = 0.2 + conn.value * 0.7;
      var width = 1 + conn.value * 3;

      // Color: blue (low) -> green (mid) -> red (high)
      var hue = (1 - conn.value) * 200; // 200=blue, 100=green, 0=red
      var color = 'hsl(' + hue + ',80%,55%)';

      parts.push('<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + color + '" stroke-width="' + width.toFixed(1) + '" opacity="' + opacity.toFixed(2) + '"><title>' + conn.ch1 + '-' + conn.ch2 + ': ' + conn.value.toFixed(2) + '</title></line>');
    });
  }

  // Electrode dots
  SITES_10_20.forEach(function(site) {
    var cx = 200 + site.x * 160;
    var cy = 200 + site.y * 160;
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="10" fill="rgba(20,30,50,0.85)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 3).toFixed(1) + '" text-anchor="middle" font-size="7" font-weight="600" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">' + site.id + '</text>');
  });

  // Legend
  parts.push('<text x="200" y="395" text-anchor="middle" font-size="10" font-weight="600" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + band + ' (threshold > ' + threshold.toFixed(1) + ')</text>');

  parts.push('</svg>');
  return parts.join('');
}