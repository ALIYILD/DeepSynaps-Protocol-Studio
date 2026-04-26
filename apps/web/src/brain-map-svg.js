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
// renderTopoHeatmap — Publication-quality Canvas 2D topographic heatmap
//
// Uses Inverse Distance Weighting (IDW) interpolation to produce smooth,
// continuous brain maps matching MNE/EEGLAB quality. Renders to an offscreen
// canvas → data-URI <img>, overlaid with crisp SVG for head chrome and
// electrode labels. Fully innerHTML-compatible (no post-render hooks).
//
// bandPowers: { [channelName]: number } — absolute or relative power per site
// options.band:      string — band name shown in legend (e.g. "alpha")
// options.unit:      string — unit label (e.g. "uV^2" or "%")
// options.size:      number — rendered width in px (default 360)
// options.colorScale: 'warm'|'cool'|'diverging'|'colorblind' (default 'warm')
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

// ── Palette LUT: precomputed 256-entry [r,g,b] tables for fast pixel fill ──
var _paletteLUTCache = {};
function _buildPaletteLUT(palette) {
  var key = palette.join('|');
  if (_paletteLUTCache[key]) return _paletteLUTCache[key];
  var lut = new Uint8Array(256 * 3);
  for (var i = 0; i < 256; i++) {
    var t = i / 255;
    var idx = t * (palette.length - 1);
    var lo = Math.floor(idx);
    var hi = Math.min(lo + 1, palette.length - 1);
    var frac = idx - lo;
    var c1 = _hexToRgb(palette[lo]);
    var c2 = _hexToRgb(palette[hi]);
    lut[i * 3]     = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
    lut[i * 3 + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
    lut[i * 3 + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
  }
  _paletteLUTCache[key] = lut;
  return lut;
}

// ── IDW weight table: cached per resolution ─────────────────────────────────
var _weightCache = {};
function _buildWeightTable(res) {
  if (_weightCache[res]) return _weightCache[res];
  var cx = res / 2, cy = res / 2;
  var hr = res * 0.4;  // head radius (matches 160/400 ratio)
  var hr2 = hr * hr;
  var minDist = hr * 0.05; // soften electrode peaks
  var nElec = SITES_10_20.length;

  // Precompute electrode pixel positions
  var ex = new Float32Array(nElec);
  var ey = new Float32Array(nElec);
  for (var e = 0; e < nElec; e++) {
    ex[e] = cx + SITES_10_20[e].x * hr;
    ey[e] = cy + SITES_10_20[e].y * hr;
  }

  // Count pixels inside head circle
  var maskList = [];
  for (var py = 0; py < res; py++) {
    for (var px = 0; px < res; px++) {
      var dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= hr2) {
        maskList.push(py * res + px);
      }
    }
  }

  var maskLen = maskList.length;
  var mask = new Uint32Array(maskLen);
  var weights = new Float32Array(maskLen * nElec);

  for (var m = 0; m < maskLen; m++) {
    mask[m] = maskList[m];
    var pixIdx = maskList[m];
    var ppx = pixIdx % res;
    var ppy = (pixIdx - ppx) / res;
    var wSum = 0;
    for (var ei = 0; ei < nElec; ei++) {
      var ddx = ppx - ex[ei], ddy = ppy - ey[ei];
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < minDist) dist = minDist;
      var w = 1 / (dist * dist);
      weights[m * nElec + ei] = w;
      wSum += w;
    }
    // Normalize
    if (wSum > 0) {
      var invSum = 1 / wSum;
      for (var ni = 0; ni < nElec; ni++) {
        weights[m * nElec + ni] *= invSum;
      }
    }
  }

  var table = { mask: mask, weights: weights, maskLen: maskLen, nElec: nElec, res: res };
  _weightCache[res] = table;
  return table;
}

// ── Canvas heatmap renderer → data-URI string ──────────────────────────────
function _renderHeatmapToDataUri(canvasRes, electrodeValues, paletteLUT, bgColor) {
  var canvas;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(canvasRes, canvasRes);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = canvasRes;
      canvas.height = canvasRes;
    }
  } catch (_e) {
    return null; // fallback to SVG
  }
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;

  var imgData = ctx.createImageData(canvasRes, canvasRes);
  var data = imgData.data;

  // Fill background (dark, matching theme)
  var bgR = bgColor[0], bgG = bgColor[1], bgB = bgColor[2];
  for (var i = 0; i < data.length; i += 4) {
    data[i] = bgR; data[i + 1] = bgG; data[i + 2] = bgB; data[i + 3] = 0; // transparent outside
  }

  var table = _buildWeightTable(canvasRes);
  var mask = table.mask, weights = table.weights, maskLen = table.maskLen, nElec = table.nElec;

  for (var m = 0; m < maskLen; m++) {
    var pixIdx = mask[m];
    var wOff = m * nElec;
    var val = 0, wUsed = 0;
    for (var ei = 0; ei < nElec; ei++) {
      var ev = electrodeValues[ei];
      if (ev !== ev) continue; // NaN check
      var w = weights[wOff + ei];
      val += w * ev;
      wUsed += w;
    }
    if (wUsed > 0) {
      val /= wUsed;
    }
    // Clamp to [0,1] and look up color
    var ti = Math.round(Math.max(0, Math.min(1, val)) * 255);
    var off = pixIdx * 4;
    data[off]     = paletteLUT[ti * 3];
    data[off + 1] = paletteLUT[ti * 3 + 1];
    data[off + 2] = paletteLUT[ti * 3 + 2];
    data[off + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  // Convert to data-URI
  try {
    if (canvas.convertToBlob) {
      // OffscreenCanvas — use toDataURL workaround via temporary canvas
      var tmpCanvas = document.createElement('canvas');
      if (!tmpCanvas || typeof tmpCanvas.getContext !== 'function' || typeof tmpCanvas.toDataURL !== 'function') return null;
      tmpCanvas.width = canvasRes;
      tmpCanvas.height = canvasRes;
      var tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx || typeof tmpCtx.drawImage !== 'function') return null;
      tmpCtx.drawImage(canvas, 0, 0);
      return tmpCanvas.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
  } catch (_e2) {
    return null;
  }
}

// ── Electrode overlay SVG (vector, crisp at any zoom) ──────────────────────
function _buildElectrodeOverlaySvg(bandPowers, vMin, range, palette, unit, size) {
  var parts = [];
  parts.push('<svg viewBox="0 0 400 400" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;pointer-events:none" aria-hidden="true">');

  // Head outline
  parts.push('<circle cx="200" cy="200" r="160" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>');
  // Nose + ears
  parts.push('<polygon points="200,28 188,48 212,48" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="34" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="366" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');

  // Electrode dots with labels
  SITES_10_20.forEach(function (site) {
    var v = bandPowers[site.id];
    var cx = 200 + site.x * 160;
    var cy = 200 + site.y * 160;
    var hasValue = v !== undefined && v !== null && Number.isFinite(v);
    var t = hasValue ? (v - vMin) / range : 0;
    var dotColor = hasValue ? _interpolateColor(palette, t) : 'rgba(30,40,60,0.8)';
    var textVal = hasValue ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) : '-';
    var tooltipText = site.id + ' (' + site.lobe + ')' + (hasValue ? ': ' + textVal + (unit ? ' ' + unit : '') : ': no data');

    parts.push('<g class="ds-topo-electrode" style="pointer-events:auto">');
    parts.push('<title>' + tooltipText + '</title>');
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="12" fill="' + dotColor + '" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy - 1.5).toFixed(1) + '" text-anchor="middle" font-size="6.5" font-weight="700" fill="rgba(255,255,255,0.95)" font-family="system-ui,sans-serif">' + site.id + '</text>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 7).toFixed(1) + '" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.75)" font-family="system-ui,sans-serif">' + textVal + '</text>');
    parts.push('</g>');
  });

  parts.push('</svg>');
  return parts.join('');
}

// ── Color-bar legend SVG ──────────────────────────────────────────────────
function _buildLegendSvg(palette, vMin, vMax, band, unit, size, options) {
  var opts = options || {};
  var legendMinLabel = opts.legendMinLabel != null ? String(opts.legendMinLabel) : vMin.toFixed(1);
  var legendMaxLabel = opts.legendMaxLabel != null ? String(opts.legendMaxLabel) : vMax.toFixed(1);
  var legendMidLabel = opts.legendMidLabel != null ? String(opts.legendMidLabel) : null;
  var parts = [];
  var legendW = 240, legendX = 80, legendY = 4;
  var legendH = 30;
  parts.push('<svg viewBox="0 0 400 ' + legendH + '" width="' + size + '" height="' + Math.round(size * legendH / 400) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">');
  for (var i = 0; i < legendW; i++) {
    var color = _interpolateColor(palette, i / legendW);
    parts.push('<rect x="' + (legendX + i) + '" y="' + legendY + '" width="1.5" height="10" fill="' + color + '"/>');
  }
  parts.push('<rect x="' + legendX + '" y="' + legendY + '" width="' + legendW + '" height="10" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" rx="2"/>');
  parts.push('<text x="' + legendX + '" y="' + (legendY + 22) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMinLabel + '</text>');
  parts.push('<text x="' + (legendX + legendW) + '" y="' + (legendY + 22) + '" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMaxLabel + '</text>');
  if (legendMidLabel != null) {
    parts.push('<text x="' + (legendX + legendW / 2) + '" y="' + (legendY + 22) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMidLabel + '</text>');
  }
  parts.push('<text x="200" y="' + (legendY + 22) + '" text-anchor="middle" font-size="9" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + band + (unit ? ' (' + unit + ')' : '') + '</text>');
  parts.push('</svg>');
  return parts.join('');
}

// ── SVG fallback (original dot-based renderer for non-canvas environments) ─
function _renderTopoHeatmapSvgFallback(bandPowers, options) {
  var opts = options || {};
  var band = opts.band || 'power';
  var unit = opts.unit || '';
  var size = Number.isFinite(opts.size) ? opts.size : 360;
  var palette = HEATMAP_PALETTES[opts.colorScale] || HEATMAP_PALETTES.warm;
  var domain = Array.isArray(opts.valueDomain) && opts.valueDomain.length === 2
    ? [Number(opts.valueDomain[0]), Number(opts.valueDomain[1])]
    : null;

  var values = [];
  SITES_10_20.forEach(function (site) {
    var v = bandPowers[site.id];
    if (v !== undefined && v !== null && Number.isFinite(v)) values.push(v);
  });
  var vMin = domain && Number.isFinite(domain[0]) ? domain[0] : (values.length ? Math.min.apply(null, values) : 0);
  var vMax = domain && Number.isFinite(domain[1]) ? domain[1] : (values.length ? Math.max.apply(null, values) : 1);
  var range = vMax - vMin || 1;
  var legendMinLabel = opts.legendMinLabel != null ? String(opts.legendMinLabel) : vMin.toFixed(1);
  var legendMaxLabel = opts.legendMaxLabel != null ? String(opts.legendMaxLabel) : vMax.toFixed(1);
  var legendMidLabel = opts.legendMidLabel != null ? String(opts.legendMidLabel) : null;

  var parts = [];
  parts.push('<svg class="ds-topo-heatmap" viewBox="0 0 400 430" width="' + size + '" height="' + Math.round(size * 430 / 400) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="qEEG topographic heatmap — ' + band + '" tabindex="0">');
  parts.push('<defs><clipPath id="th-head-clip"><circle cx="200" cy="200" r="160"/></clipPath></defs>');
  parts.push('<circle cx="200" cy="200" r="160" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>');
  parts.push('<g clip-path="url(#th-head-clip)">');
  SITES_10_20.forEach(function (site) {
    var v = bandPowers[site.id];
    if (v === undefined || v === null) return;
    var t = (v - vMin) / range;
    var color = _interpolateColor(palette, t);
    var cx = 200 + site.x * 160;
    var cy = 200 + site.y * 160;
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="60" fill="' + color + '" opacity="0.55"/>');
  });
  parts.push('</g>');
  parts.push('<circle cx="200" cy="200" r="160" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>');
  parts.push('<polygon points="200,28 188,48 212,48" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="34" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="366" cy="200" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  SITES_10_20.forEach(function (site) {
    var v = bandPowers[site.id];
    var cx = 200 + site.x * 160;
    var cy = 200 + site.y * 160;
    var hasValue = v !== undefined && v !== null && Number.isFinite(v);
    var t = hasValue ? (v - vMin) / range : 0;
    var dotColor = hasValue ? _interpolateColor(palette, t) : 'rgba(30,40,60,0.8)';
    var textVal = hasValue ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) : '-';
    var tooltipText = site.id + ' (' + site.lobe + ')' + (hasValue ? ': ' + textVal + (unit ? ' ' + unit : '') : ': no data');
    parts.push('<g class="ds-topo-electrode">');
    parts.push('<title>' + tooltipText + '</title>');
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="14" fill="' + dotColor + '" stroke="rgba(255,255,255,0.6)" stroke-width="1.2"/>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy - 2).toFixed(1) + '" text-anchor="middle" font-size="7" font-weight="600" fill="rgba(255,255,255,0.95)" font-family="system-ui,sans-serif">' + site.id + '</text>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 8).toFixed(1) + '" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + textVal + '</text>');
    parts.push('</g>');
  });
  var legendY = 380, legendW = 240, legendX = 80;
  for (var i = 0; i < legendW; i++) {
    var color = _interpolateColor(palette, i / legendW);
    parts.push('<rect x="' + (legendX + i) + '" y="' + legendY + '" width="1.5" height="10" fill="' + color + '"/>');
  }
  parts.push('<rect x="' + legendX + '" y="' + legendY + '" width="' + legendW + '" height="10" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" rx="2"/>');
  parts.push('<text x="' + legendX + '" y="' + (legendY + 22) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMinLabel + '</text>');
  parts.push('<text x="' + (legendX + legendW) + '" y="' + (legendY + 22) + '" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMaxLabel + '</text>');
  if (legendMidLabel != null) {
    parts.push('<text x="' + (legendX + legendW / 2) + '" y="' + (legendY + 22) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + legendMidLabel + '</text>');
  }
  parts.push('<text x="200" y="' + (legendY + 22) + '" text-anchor="middle" font-size="9" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + band + (unit ? ' (' + unit + ')' : '') + '</text>');
  parts.push('</svg>');
  return parts.join('');
}

// ── Main export: Canvas IDW topomap with SVG overlay ────────────────────────
export function renderTopoHeatmap(bandPowers, options) {
  var opts = options || {};
  var band = opts.band || 'power';
  var unit = opts.unit || '';
  var size = Number.isFinite(opts.size) ? opts.size : 360;
  var palette = HEATMAP_PALETTES[opts.colorScale] || HEATMAP_PALETTES.warm;
  var isDiverging = opts.colorScale === 'diverging';
  var domain = Array.isArray(opts.valueDomain) && opts.valueDomain.length === 2
    ? [Number(opts.valueDomain[0]), Number(opts.valueDomain[1])]
    : null;

  // Collect values and compute normalization range
  var values = [];
  SITES_10_20.forEach(function (site) {
    var v = bandPowers[site.id];
    if (v !== undefined && v !== null && Number.isFinite(v)) values.push(v);
  });
  var vMin = domain && Number.isFinite(domain[0]) ? domain[0] : (values.length ? Math.min.apply(null, values) : 0);
  var vMax = domain && Number.isFinite(domain[1]) ? domain[1] : (values.length ? Math.max.apply(null, values) : 1);

  // For diverging palettes, center at zero
  if (isDiverging) {
    var absMax = Math.max(Math.abs(vMin), Math.abs(vMax), 0.001);
    vMin = -absMax;
    vMax = absMax;
  }
  var range = vMax - vMin || 1;

  // Build normalized electrode values array (NaN for missing)
  var electrodeValues = new Float32Array(SITES_10_20.length);
  for (var i = 0; i < SITES_10_20.length; i++) {
    var v = bandPowers[SITES_10_20[i].id];
    if (v !== undefined && v !== null && Number.isFinite(v)) {
      electrodeValues[i] = (v - vMin) / range;
    } else {
      electrodeValues[i] = NaN;
    }
  }

  // Render the heatmap via Canvas
  var canvasRes = size; // 1:1 for performance; adequate quality at 180-360px
  var paletteLUT = _buildPaletteLUT(palette);
  var bgColor = _hexToRgb(palette[0]);
  var dataUri = _renderHeatmapToDataUri(canvasRes, electrodeValues, paletteLUT, bgColor);

  // Fallback to SVG if canvas unavailable
  if (!dataUri) {
    return _renderTopoHeatmapSvgFallback(bandPowers, opts);
  }

  // Compose: Canvas <img> + SVG overlay + legend
  var html = '<div class="ds-topo-heatmap-wrap" style="width:' + size + 'px;display:inline-block;position:relative">'
    + '<img src="' + dataUri + '" width="' + size + '" height="' + size + '" alt="qEEG topographic heatmap — ' + band + '" style="display:block;border-radius:50%" />'
    + _buildElectrodeOverlaySvg(bandPowers, vMin, range, palette, unit, size)
    + _buildLegendSvg(
      palette,
      vMin,
      vMax,
      band,
      unit,
      size,
      {
        legendMinLabel: opts.legendMinLabel,
        legendMaxLabel: opts.legendMaxLabel,
        legendMidLabel: opts.legendMidLabel,
      }
    )
    + '</div>';

  return html;
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

export function renderConnectivityChordLite(nodes, edges, options) {
  var opts = options || {};
  var size = Number.isFinite(opts.size) ? opts.size : 360;
  var threshold = opts.threshold != null ? opts.threshold : 0.3;
  var title = opts.title || 'Connectivity chord';
  var cx = 200;
  var cy = 200;
  var radius = 132;
  var safeNodes = Array.isArray(nodes) ? nodes : [];
  var safeEdges = Array.isArray(edges) ? edges : [];
  if (!safeNodes.length) return '<div>No connectivity nodes</div>';

  var nodePositions = {};
  safeNodes.forEach(function (node, index) {
    var theta = (-Math.PI / 2) + (index / safeNodes.length) * Math.PI * 2;
    nodePositions[node.id] = {
      x: cx + Math.cos(theta) * radius,
      y: cy + Math.sin(theta) * radius,
      theta: theta,
    };
  });

  function edgeStroke(edge) {
    if (edge.sign != null && edge.sign < 0) return 'rgba(96,165,250,0.55)';
    return 'rgba(248,113,113,0.55)';
  }

  var parts = [];
  parts.push('<svg class="ds-conn-chord" viewBox="0 0 400 430" width="' + size + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + title + '" tabindex="0">');
  parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>');

  safeEdges.forEach(function (edge) {
    if (!edge || Math.abs(Number(edge.weight) || 0) < threshold) return;
    var source = nodePositions[edge.source];
    var target = nodePositions[edge.target];
    if (!source || !target) return;
    var midX = (source.x + target.x) / 2;
    var midY = (source.y + target.y) / 2;
    var pull = 0.28;
    var ctrlX = cx + (midX - cx) * pull;
    var ctrlY = cy + (midY - cy) * pull;
    var width = 0.8 + Math.min(4.2, Math.abs(Number(edge.weight) || 0) * 4.0);
    parts.push('<path d="M' + source.x.toFixed(1) + ',' + source.y.toFixed(1)
      + ' Q' + ctrlX.toFixed(1) + ',' + ctrlY.toFixed(1)
      + ' ' + target.x.toFixed(1) + ',' + target.y.toFixed(1)
      + '" fill="none" stroke="' + edgeStroke(edge) + '" stroke-width="' + width.toFixed(2) + '" opacity="0.9">'
      + '<title>' + (edge.source + ' → ' + edge.target + ': ' + Number(edge.weight || 0).toFixed(2)) + '</title></path>');
  });

  safeNodes.forEach(function (node) {
    var pos = nodePositions[node.id];
    var labelRadius = radius + 20;
    var lx = cx + Math.cos(pos.theta) * labelRadius;
    var ly = cy + Math.sin(pos.theta) * labelRadius;
    var anchor = lx < cx ? 'end' : 'start';
    var color = node.color || 'rgba(226,232,240,0.95)';
    parts.push('<circle cx="' + pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="5.5" fill="' + color + '" stroke="rgba(255,255,255,0.65)" stroke-width="1"/>');
    parts.push('<text x="' + lx.toFixed(1) + '" y="' + (ly + 3).toFixed(1) + '" text-anchor="' + anchor + '" font-size="8.5" fill="rgba(226,232,240,0.88)" font-family="system-ui,sans-serif">'
      + (node.label || node.id) + '</text>');
  });

  parts.push('<text x="200" y="404" text-anchor="middle" font-size="10" font-weight="600" fill="rgba(255,255,255,0.76)" font-family="system-ui,sans-serif">'
    + title + ' · |w| ≥ ' + threshold.toFixed(2) + '</text>');
  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderICAComponents — Grid of ICA component topographic mini-maps
//
// components:  array of {label, type, weights: {ch: val}, variance_explained}
// channels:    array of channel name strings
// options.size:          number — overall SVG width (default 280)
// options.maxComponents: number — max components to render (default 6)
// ─────────────────────────────────────────────────────────────────────────────

var _ICA_TYPE_COLORS = {
  brain_alpha: '#4caf50',
  brain:       '#4caf50',
  eye_blink:   '#ef5350',
  muscle:      '#ff9800',
  cardiac:     '#ab47bc',
  other:       '#9e9e9e',
};

function _icaTypeLabel(type) {
  if (type === 'brain_alpha' || type === 'brain') return 'Brain';
  if (type === 'eye_blink') return 'Eye';
  if (type === 'muscle')    return 'Muscle';
  if (type === 'cardiac')   return 'Cardiac';
  return 'Other';
}

function _icaIsArtifact(type) {
  return type === 'eye_blink' || type === 'muscle' || type === 'cardiac';
}

export function renderICAComponents(components, channels, options) {
  var opts = options || {};
  var size = Number.isFinite(opts.size) ? opts.size : 280;
  var maxComponents = opts.maxComponents || 6;

  if (!components || !components.length) return '<div>No ICA data</div>';

  var comps = components.slice(0, maxComponents);
  var cols = Math.min(comps.length, 3);
  var rows = Math.ceil(comps.length / cols);

  // Each mini-topo cell dimensions (viewBox units)
  var cellW = 160;
  var cellH = 200;
  var pad = 10;
  var totalW = cols * cellW + (cols + 1) * pad;
  var totalH = rows * cellH + (rows + 1) * pad;

  var icaPalette = HEATMAP_PALETTES.diverging;

  var parts = [];
  parts.push('<svg class="ds-ica-components" viewBox="0 0 ' + totalW + ' ' + totalH + '" width="' + size + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ICA component topographic maps" tabindex="0">');

  comps.forEach(function (comp, idx) {
    var col = idx % cols;
    var row = Math.floor(idx / cols);
    var ox = pad + col * (cellW + pad);
    var oy = pad + row * (cellH + pad);
    var artifact = _icaIsArtifact(comp.type);
    var groupOpacity = artifact ? 0.55 : 1.0;

    // Weight min/max for symmetric normalization
    var absMax = 0;
    SITES_10_20.forEach(function (site) {
      var w = comp.weights ? comp.weights[site.id] : undefined;
      if (w !== undefined && w !== null && Number.isFinite(w)) {
        if (Math.abs(w) > absMax) absMax = Math.abs(w);
      }
    });
    absMax = absMax || 1;

    var headCx = ox + cellW / 2;
    var headCy = oy + 60;
    var headR = 50;
    var clipId = 'ica-clip-' + idx;

    parts.push('<g class="ds-ica-comp" opacity="' + groupOpacity + '">');

    // Clip definition for this mini-head
    parts.push('<defs><clipPath id="' + clipId + '"><circle cx="' + headCx + '" cy="' + headCy + '" r="' + headR + '"/></clipPath></defs>');

    // Mini head background
    parts.push('<circle cx="' + headCx + '" cy="' + headCy + '" r="' + headR + '" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="1.2"/>');

    // Nose indicator
    parts.push('<polygon points="' + headCx + ',' + (headCy - headR - 6) + ' ' + (headCx - 4) + ',' + (headCy - headR + 1) + ' ' + (headCx + 4) + ',' + (headCy - headR + 1) + '" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" stroke-linejoin="round"/>');

    // Radial weight fills (clipped to head)
    parts.push('<g clip-path="url(#' + clipId + ')">');
    SITES_10_20.forEach(function (site) {
      var w = comp.weights ? comp.weights[site.id] : undefined;
      if (w === undefined || w === null) return;
      // Normalize: -absMax -> 0, 0 -> 0.5, +absMax -> 1
      var t = (w / absMax + 1) / 2;
      var color = _interpolateColor(icaPalette, t);
      var ecx = headCx + site.x * headR;
      var ecy = headCy + site.y * headR;
      parts.push('<circle cx="' + ecx.toFixed(1) + '" cy="' + ecy.toFixed(1) + '" r="20" fill="' + color + '" opacity="0.6"/>');
    });
    parts.push('</g>');

    // Head outline (on top)
    parts.push('<circle cx="' + headCx + '" cy="' + headCy + '" r="' + headR + '" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>');

    // Small electrode dots
    SITES_10_20.forEach(function (site) {
      var ecx = headCx + site.x * headR;
      var ecy = headCy + site.y * headR;
      parts.push('<circle cx="' + ecx.toFixed(1) + '" cy="' + ecy.toFixed(1) + '" r="2.5" fill="rgba(255,255,255,0.5)" stroke="none"/>');
    });

    // Component label
    var labelY = oy + 125;
    var labelText = comp.label || 'IC?';
    parts.push('<text x="' + headCx + '" y="' + labelY + '" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">' + labelText + '</text>');

    // Strikethrough line for artifacts
    if (artifact) {
      var halfW = labelText.length * 3.5;
      parts.push('<line x1="' + (headCx - halfW) + '" y1="' + (labelY - 3) + '" x2="' + (headCx + halfW) + '" y2="' + (labelY - 3) + '" stroke="rgba(239,68,68,0.7)" stroke-width="1.5"/>');
    }

    // Type badge
    var badgeColor = _ICA_TYPE_COLORS[comp.type] || _ICA_TYPE_COLORS.other;
    var badgeText = _icaTypeLabel(comp.type);
    var badgeW = badgeText.length * 6 + 12;
    var badgeY = labelY + 14;
    parts.push('<rect x="' + (headCx - badgeW / 2) + '" y="' + (badgeY - 9) + '" width="' + badgeW + '" height="14" rx="3" fill="' + badgeColor + '" opacity="0.25"/>');
    parts.push('<text x="' + headCx + '" y="' + (badgeY + 2) + '" text-anchor="middle" font-size="8" font-weight="600" fill="' + badgeColor + '" font-family="system-ui,sans-serif">' + badgeText + '</text>');

    // Variance explained
    var varY = badgeY + 18;
    var varPct = (comp.variance_explained != null) ? (comp.variance_explained * 100).toFixed(1) : '?';
    parts.push('<text x="' + headCx + '" y="' + varY + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif">Var: ' + varPct + '%</text>');

    parts.push('</g>');
  });

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderWaveletHeatmap — Time-frequency spectral power heatmap
//
// timeFreqData: {times: [], frequencies: [], power: [[]], channel: "Cz"}
// options.width:      number — SVG width (default 500)
// options.height:     number — SVG height (default 300)
// options.colorScale: string — palette name (default 'warm')
// ─────────────────────────────────────────────────────────────────────────────

var _BAND_DEFS = [
  { name: 'Delta', lo: 0.5, hi: 4   },
  { name: 'Theta', lo: 4,   hi: 8   },
  { name: 'Alpha', lo: 8,   hi: 13  },
  { name: 'Beta',  lo: 13,  hi: 30  },
  { name: 'Gamma', lo: 30,  hi: 100 },
];

export function renderWaveletHeatmap(timeFreqData, options) {
  var opts = options || {};
  var width  = opts.width  || 500;
  var height = opts.height || 300;
  var colorScaleName = opts.colorScale || 'warm';

  if (!timeFreqData || !timeFreqData.times || !timeFreqData.frequencies || !timeFreqData.power) {
    return '<div>No time-frequency data</div>';
  }

  var times   = timeFreqData.times;
  var freqs   = timeFreqData.frequencies;
  var power   = timeFreqData.power;
  var channel = timeFreqData.channel || '';
  var palette = HEATMAP_PALETTES[colorScaleName] || HEATMAP_PALETTES.warm;

  // Layout margins
  var mL = 50;   // left  (y-axis labels)
  var mR = 80;   // right (band labels + color bar)
  var mT = 30;   // top   (title)
  var mB = 40;   // bottom (x-axis labels)
  var plotW = width  - mL - mR;
  var plotH = height - mT - mB;

  // Power range for color mapping
  var pMin = Infinity, pMax = -Infinity;
  for (var ri = 0; ri < power.length; ri++) {
    for (var ci = 0; ci < power[ri].length; ci++) {
      var pv = power[ri][ci];
      if (Number.isFinite(pv)) {
        if (pv < pMin) pMin = pv;
        if (pv > pMax) pMax = pv;
      }
    }
  }
  if (!Number.isFinite(pMin)) pMin = 0;
  if (!Number.isFinite(pMax)) pMax = 1;
  var pRange = pMax - pMin || 1;

  // Frequency log-scale helpers
  var fMin    = Math.max(0.5, freqs[0]);
  var fMax    = freqs[freqs.length - 1];
  var logMin  = Math.log10(fMin);
  var logMax  = Math.log10(fMax);
  var logSpan = logMax - logMin || 1;

  function freqToY(f) {
    var logF = Math.log10(Math.max(0.5, f));
    var t = (logF - logMin) / logSpan;
    return mT + plotH * (1 - t);   // high freq at top
  }

  // Time linear helpers
  var tMin  = times[0];
  var tMax  = times[times.length - 1];
  var tSpan = tMax - tMin || 1;

  function timeToX(tv) {
    return mL + plotW * ((tv - tMin) / tSpan);
  }

  var nFreqs = freqs.length;
  var nTimes = times.length;
  var cellW  = plotW / Math.max(1, nTimes);

  var parts = [];
  parts.push('<svg class="ds-wavelet-heatmap" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Time-frequency wavelet heatmap' + (channel ? ' \u2014 ' + channel : '') + '" tabindex="0">');

  // Plot background
  parts.push('<rect x="' + mL + '" y="' + mT + '" width="' + plotW + '" height="' + plotH + '" fill="#0d1b2a"/>');

  // Heatmap cells (frequency rows x time columns)
  for (var fi = 0; fi < nFreqs; fi++) {
    var fLo  = fi > 0          ? (freqs[fi - 1] + freqs[fi]) / 2 : freqs[fi];
    var fHi  = fi < nFreqs - 1 ? (freqs[fi] + freqs[fi + 1]) / 2 : freqs[fi];
    var yTop = freqToY(fHi);
    var yBot = freqToY(fLo);
    var rH   = Math.max(0.5, yBot - yTop);

    for (var ti = 0; ti < nTimes; ti++) {
      var val = (power[fi] && power[fi][ti] != null) ? power[fi][ti] : 0;
      var tn  = Number.isFinite(val) ? (val - pMin) / pRange : 0;
      var col = _interpolateColor(palette, tn);
      var xPos = mL + ti * cellW;
      parts.push('<rect x="' + xPos.toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + (cellW + 0.5).toFixed(1) + '" height="' + (rH + 0.5).toFixed(1) + '" fill="' + col + '"/>');
    }
  }

  // Band boundary dashed lines + right-side labels
  var drawnBoundaries = {};
  _BAND_DEFS.forEach(function (band) {
    [band.lo, band.hi].forEach(function (f) {
      if (f >= fMin && f <= fMax && !drawnBoundaries[f]) {
        drawnBoundaries[f] = true;
        var yLine = freqToY(f);
        parts.push('<line x1="' + mL + '" y1="' + yLine.toFixed(1) + '" x2="' + (mL + plotW) + '" y2="' + yLine.toFixed(1) + '" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" stroke-dasharray="4,3"/>');
      }
    });
    // Band label at geometric midpoint
    var bLo = Math.max(band.lo, fMin);
    var bHi = Math.min(band.hi, fMax);
    if (bLo < bHi) {
      var midFreq = Math.sqrt(bLo * bHi);
      var yLabel  = freqToY(midFreq);
      parts.push('<text x="' + (mL + plotW + 4) + '" y="' + (yLabel + 3).toFixed(1) + '" font-size="7" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif">' + band.name + '</text>');
    }
  });

  // Y-axis label (Frequency)
  var yAxisLabelY = mT + plotH / 2;
  parts.push('<text x="14" y="' + yAxisLabelY + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif" transform="rotate(-90,14,' + yAxisLabelY + ')">Frequency (Hz)</text>');

  // Y-axis tick marks
  var yTicks = [1, 2, 4, 8, 13, 20, 30, 40];
  for (var yi = 0; yi < yTicks.length; yi++) {
    var yf = yTicks[yi];
    if (yf >= fMin && yf <= fMax) {
      var yp = freqToY(yf);
      parts.push('<line x1="' + (mL - 3) + '" y1="' + yp.toFixed(1) + '" x2="' + mL + '" y2="' + yp.toFixed(1) + '" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>');
      parts.push('<text x="' + (mL - 5) + '" y="' + (yp + 3).toFixed(1) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">' + yf + '</text>');
    }
  }

  // X-axis label (Time)
  parts.push('<text x="' + (mL + plotW / 2) + '" y="' + (height - 5) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">Time (s)</text>');

  // X-axis tick marks
  var nXTicks = Math.min(8, nTimes);
  for (var xi = 0; xi <= nXTicks; xi++) {
    var tv = tMin + (tSpan * xi / nXTicks);
    var xp = timeToX(tv);
    parts.push('<line x1="' + xp.toFixed(1) + '" y1="' + (mT + plotH) + '" x2="' + xp.toFixed(1) + '" y2="' + (mT + plotH + 3) + '" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>');
    parts.push('<text x="' + xp.toFixed(1) + '" y="' + (mT + plotH + 13) + '" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">' + tv.toFixed(1) + '</text>');
  }

  // Plot border
  parts.push('<rect x="' + mL + '" y="' + mT + '" width="' + plotW + '" height="' + plotH + '" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>');

  // Title (channel name)
  if (channel) {
    parts.push('<text x="' + (mL + plotW / 2) + '" y="' + (mT - 10) + '" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif">' + channel + ' \u2014 Time-Frequency</text>');
  }

  // Color bar legend on the right
  var cbX = mL + plotW + 45;
  var cbW = 10;
  var cbH = plotH;
  for (var cbi = 0; cbi < cbH; cbi++) {
    var cbT   = 1 - cbi / cbH;  // top = high, bottom = low
    var cbCol = _interpolateColor(palette, cbT);
    parts.push('<rect x="' + cbX + '" y="' + (mT + cbi) + '" width="' + cbW + '" height="1.5" fill="' + cbCol + '"/>');
  }
  parts.push('<rect x="' + cbX + '" y="' + mT + '" width="' + cbW + '" height="' + cbH + '" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>');
  parts.push('<text x="' + (cbX + cbW / 2) + '" y="' + (mT - 3) + '" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">' + pMax.toFixed(1) + '</text>');
  parts.push('<text x="' + (cbX + cbW / 2) + '" y="' + (mT + cbH + 9) + '" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">' + pMin.toFixed(1) + '</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderChannelQualityMap — Topographic map colored by recording quality
//
// channelStats: { [ch]: {quality, peak_to_peak, std, flat_pct} }
// channels:     array of channel name strings
// options.size: number — SVG width (default 320)
// ─────────────────────────────────────────────────────────────────────────────

function _qualityColor(q) {
  if (q >= 0.8) return '#4caf50';   // green
  if (q >= 0.6) return '#ffca28';   // yellow
  return '#ef5350';                  // red
}

function _qualityGrade(q) {
  if (q >= 0.9) return 'A';
  if (q >= 0.8) return 'B';
  if (q >= 0.7) return 'C';
  if (q >= 0.6) return 'D';
  return 'F';
}

export function renderChannelQualityMap(channelStats, channels, options) {
  var opts = options || {};
  var size = Number.isFinite(opts.size) ? opts.size : 320;

  if (!channelStats) return '<div>No quality data</div>';

  // Compute overall average quality
  var chList = channels || Object.keys(channelStats);
  var qualitySum   = 0;
  var qualityCount = 0;
  chList.forEach(function (ch) {
    var stat = channelStats[ch] || channelStats[_mapChannel(ch)];
    if (stat && stat.quality != null && Number.isFinite(stat.quality)) {
      qualitySum += stat.quality;
      qualityCount++;
    }
  });
  var avgQuality = qualityCount > 0 ? qualitySum / qualityCount : 0;
  var grade      = _qualityGrade(avgQuality);
  var gradeColor = _qualityColor(avgQuality);

  // Head center shifted down to make room for title
  var headCx = 200;
  var headCy = 220;
  var headR  = 155;

  var parts = [];
  parts.push('<svg class="ds-channel-quality" viewBox="0 0 400 480" width="' + size + '" height="' + Math.round(size * 480 / 400) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Channel quality topographic map" tabindex="0">');

  // Overall quality grade at top
  parts.push('<text x="200" y="22" text-anchor="middle" font-size="12" font-weight="700" fill="' + gradeColor + '" font-family="system-ui,sans-serif">Overall Quality: Grade ' + grade + ' (' + (avgQuality * 100).toFixed(0) + '%)</text>');

  // Head circle
  parts.push('<circle cx="' + headCx + '" cy="' + headCy + '" r="' + headR + '" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>');

  // Nose + ears (adjusted to headCy)
  parts.push('<polygon points="' + headCx + ',' + (headCy - headR - 12) + ' ' + (headCx - 12) + ',' + (headCy - headR + 8) + ' ' + (headCx + 12) + ',' + (headCy - headR + 8) + '" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="' + (headCx - 166) + '" cy="' + headCy + '" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="' + (headCx + 166) + '" cy="' + headCy + '" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');

  // Midline + coronal guides
  parts.push('<line x1="' + headCx + '" y1="' + (headCy - headR) + '" x2="' + headCx + '" y2="' + (headCy + headR) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="2,4"/>');
  parts.push('<line x1="' + (headCx - headR) + '" y1="' + headCy + '" x2="' + (headCx + headR) + '" y2="' + headCy + '" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="2,4"/>');

  // Electrode dots colored and sized by quality
  SITES_10_20.forEach(function (site) {
    var cx = headCx + site.x * headR;
    var cy = headCy + site.y * headR;

    // Look up stats (try direct name, then mapped backend names)
    var stat = channelStats[site.id];
    if (!stat) {
      // Try reverse: find a backend key whose SVG mapping is this site
      for (var bk in _BACKEND_TO_SVG) {
        if (_BACKEND_TO_SVG[bk] === site.id && channelStats[bk]) {
          stat = channelStats[bk];
          break;
        }
      }
    }

    var quality = (stat && stat.quality != null && Number.isFinite(stat.quality)) ? stat.quality : null;
    var hasData = quality !== null;

    var dotColor  = hasData ? _qualityColor(quality) : 'rgba(60,60,80,0.6)';
    var dotRadius = hasData ? 8 + quality * 10 : 8;   // 8 (poor) to 18 (perfect)
    var strokeCol = hasData ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';

    // Tooltip
    var tip = [site.id + ' (' + site.lobe + ')'];
    if (hasData) {
      tip.push('Quality: ' + (quality * 100).toFixed(0) + '%');
      if (stat.peak_to_peak != null) tip.push('Peak-to-peak: ' + stat.peak_to_peak.toFixed(1) + ' uV');
      if (stat.std != null)          tip.push('Std: ' + stat.std.toFixed(1));
      if (stat.flat_pct != null)     tip.push('Flat: ' + (stat.flat_pct * 100).toFixed(1) + '%');
    } else {
      tip.push('No data');
    }

    parts.push('<g class="ds-quality-electrode">');
    parts.push('<title>' + tip.join('\n') + '</title>');
    // Outer halo (proportional to quality)
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + dotRadius.toFixed(1) + '" fill="' + dotColor + '" fill-opacity="0.3" stroke="' + dotColor + '" stroke-width="1.5"/>');
    // Inner solid dot
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3" fill="' + dotColor + '"/>');
    // Channel label above the dot
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy - dotRadius - 3).toFixed(1) + '" text-anchor="middle" font-size="7" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + site.id + '</text>');
    // Quality percentage inside the halo
    if (hasData) {
      parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 3).toFixed(1) + '" text-anchor="middle" font-size="6" font-weight="600" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">' + (quality * 100).toFixed(0) + '%</text>');
    }
    parts.push('</g>');
  });

  // Legend
  var legendY = 420;
  var legendItems = [
    { color: '#4caf50', label: 'Good (>80%)' },
    { color: '#ffca28', label: 'Fair (60-80%)' },
    { color: '#ef5350', label: 'Poor (<60%)' },
  ];
  legendItems.forEach(function (item, idx) {
    var lx = 60 + idx * 110;
    parts.push('<circle cx="' + lx + '" cy="' + legendY + '" r="5" fill="' + item.color + '" fill-opacity="0.5" stroke="' + item.color + '" stroke-width="1"/>');
    parts.push('<text x="' + (lx + 10) + '" y="' + (legendY + 3) + '" font-size="8" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + item.label + '</text>');
  });

  // Size legend note
  parts.push('<text x="200" y="448" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">Dot size proportional to signal quality</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderAsymmetryMap — Hemispheric asymmetry topographic map
//
// regions:  { frontal: {index, direction}, central: {...}, temporal: {...},
//             parietal: {...}, occipital: {...} }
// options.size: number — SVG width/height (default 400)
// ─────────────────────────────────────────────────────────────────────────────

export function renderAsymmetryMap(regions, options) {
  var opts = options || {};
  var size = Number.isFinite(opts.size) ? opts.size : 400;

  if (!regions) return '<div>No asymmetry data</div>';

  // Find max absolute index for normalization
  var maxIdx = 0;
  var regionKeys = ['frontal', 'central', 'temporal', 'parietal', 'occipital'];
  regionKeys.forEach(function (key) {
    if (regions[key] && regions[key].index != null) {
      var absVal = Math.abs(regions[key].index);
      if (absVal > maxIdx) maxIdx = absVal;
    }
  });
  maxIdx = maxIdx || 1;

  var parts = [];
  parts.push('<svg class="ds-asymmetry-map" viewBox="0 0 400 480" width="' + size + '" height="' + Math.round(size * 480 / 400) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hemispheric asymmetry map" tabindex="0">');

  // Title
  parts.push('<text x="200" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">Hemispheric Asymmetry</text>');

  // Head circle
  var headCx = 200;
  var headCy = 220;
  var headR = 155;
  parts.push('<circle cx="' + headCx + '" cy="' + headCy + '" r="' + headR + '" fill="#0d1b2a" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>');

  // Nose + ears
  parts.push('<polygon points="' + headCx + ',' + (headCy - headR - 12) + ' ' + (headCx - 12) + ',' + (headCy - headR + 8) + ' ' + (headCx + 12) + ',' + (headCy - headR + 8) + '" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linejoin="round"/>');
  parts.push('<ellipse cx="' + (headCx - 166) + '" cy="' + headCy + '" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  parts.push('<ellipse cx="' + (headCx + 166) + '" cy="' + headCy + '" rx="10" ry="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');

  // Vertical midline (hemispheric divider)
  parts.push('<line x1="' + headCx + '" y1="' + (headCy - headR) + '" x2="' + headCx + '" y2="' + (headCy + headR) + '" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-dasharray="6,3"/>');

  // Hemisphere labels
  parts.push('<text x="' + (headCx - headR + 20) + '" y="' + (headCy - headR + 25) + '" font-size="11" font-weight="600" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">L</text>');
  parts.push('<text x="' + (headCx + headR - 20) + '" y="' + (headCy - headR + 25) + '" text-anchor="end" font-size="11" font-weight="600" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">R</text>');

  // Draw electrode dots colored by asymmetry
  SITES_10_20.forEach(function (site) {
    var cx = headCx + site.x * headR;
    var cy = headCy + site.y * headR;
    var regionData = regions[site.lobe];
    var fillColor = 'rgba(60,60,80,0.6)';

    if (regionData && regionData.index != null) {
      var idx = regionData.index;
      var intensity = Math.min(1, Math.abs(idx) / maxIdx);

      if (idx > 0) {
        // Left dominant = red shading on left electrodes
        if (site.x <= 0) {
          fillColor = 'rgba(239,68,68,' + (0.2 + intensity * 0.7).toFixed(2) + ')';
        } else {
          fillColor = 'rgba(239,68,68,' + (0.05 + intensity * 0.15).toFixed(2) + ')';
        }
      } else if (idx < 0) {
        // Right dominant = blue shading on right electrodes
        if (site.x >= 0) {
          fillColor = 'rgba(66,165,245,' + (0.2 + intensity * 0.7).toFixed(2) + ')';
        } else {
          fillColor = 'rgba(66,165,245,' + (0.05 + intensity * 0.15).toFixed(2) + ')';
        }
      } else {
        fillColor = 'rgba(150,150,150,0.3)';
      }
    }

    parts.push('<g class="ds-asym-electrode">');
    parts.push('<title>' + site.id + ' (' + site.lobe + ')</title>');
    parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="14" fill="' + fillColor + '" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>');
    parts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy + 4).toFixed(1) + '" text-anchor="middle" font-size="7" font-weight="600" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">' + site.id + '</text>');
    parts.push('</g>');
  });

  // Asymmetry value labels per region (placed near lobe areas)
  var regionLabelPositions = {
    frontal:   { x: 200, y: 100 },
    central:   { x: 130, y: 215 },
    temporal:  { x: 270, y: 215 },
    parietal:  { x: 200, y: 310 },
    occipital: { x: 200, y: 380 }
  };
  regionKeys.forEach(function (key) {
    var regionData = regions[key];
    if (!regionData || regionData.index == null) return;
    var pos = regionLabelPositions[key];
    var dirLabel = regionData.direction === 'left' ? 'L' : 'R';
    var idxText = regionData.index > 0 ? '+' + regionData.index.toFixed(2) : regionData.index.toFixed(2);

    // Background pill for label
    var pillW = 80;
    var pillH = 16;
    parts.push('<rect x="' + (pos.x - pillW / 2) + '" y="' + (pos.y - 11) + '" width="' + pillW + '" height="' + pillH + '" rx="4" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>');
    parts.push('<text x="' + pos.x + '" y="' + (pos.y + 1) + '" text-anchor="middle" font-size="8" font-weight="600" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif">' + key.charAt(0).toUpperCase() + key.slice(1) + ': ' + idxText + ' ' + dirLabel + '</text>');
  });

  // Legend
  var legendY = 440;
  parts.push('<circle cx="80" cy="' + legendY + '" r="6" fill="rgba(239,68,68,0.7)"/>');
  parts.push('<text x="92" y="' + (legendY + 3) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">Left dominant</text>');
  parts.push('<circle cx="230" cy="' + legendY + '" r="6" fill="rgba(66,165,245,0.7)"/>');
  parts.push('<text x="242" y="' + (legendY + 3) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">Right dominant</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderPowerBarChart — Horizontal bar chart of absolute/relative band powers
//
// bandPowers: { delta: {mean, status}, theta: {...}, alpha: {...},
//               beta: {...}, gamma: {...} }
// options.width:      number (default 500)
// options.height:     number (default 250)
// options.title:      string (default 'Absolute Power Spectra')
// options.showStatus: boolean (default true)
// ─────────────────────────────────────────────────────────────────────────────

var _POWER_BAND_COLORS = {
  delta: '#42a5f5',
  theta: '#ab47bc',
  alpha: '#66bb6a',
  beta:  '#ffa726',
  gamma: '#ec407a'
};

export function renderPowerBarChart(bandPowers, options) {
  var opts = options || {};
  var width  = opts.width  || 500;
  var height = opts.height || 250;
  var title  = opts.title != null ? opts.title : 'Absolute Power Spectra';
  var showStatus = opts.showStatus !== false;

  if (!bandPowers) return '<div>No band power data</div>';

  var bandKeys = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  var maxVal = 0;
  bandKeys.forEach(function (key) {
    if (bandPowers[key] && bandPowers[key].mean != null) {
      var v = Math.abs(bandPowers[key].mean);
      if (v > maxVal) maxVal = v;
    }
  });
  maxVal = maxVal || 1;

  var mL = 70;   // left margin for labels
  var mR = showStatus ? 120 : 60;  // right margin for value + status
  var mT = 35;   // top margin for title
  var mB = 15;   // bottom margin
  var barAreaW = width - mL - mR;
  var barH = 22;
  var barGap = 8;
  var totalBarsH = bandKeys.length * (barH + barGap) - barGap;
  var adjHeight = Math.max(height, mT + totalBarsH + mB);

  var parts = [];
  parts.push('<svg class="ds-power-bar-chart" viewBox="0 0 ' + width + ' ' + adjHeight + '" width="' + width + '" height="' + adjHeight + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + title + '" tabindex="0">');

  // Title
  parts.push('<text x="' + (width / 2) + '" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">' + title + '</text>');

  // Subtle grid lines
  for (var gi = 0; gi <= 4; gi++) {
    var gx = mL + barAreaW * gi / 4;
    parts.push('<line x1="' + gx.toFixed(1) + '" y1="' + mT + '" x2="' + gx.toFixed(1) + '" y2="' + (mT + totalBarsH) + '" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>');
  }

  // Bars
  bandKeys.forEach(function (key, idx) {
    var data = bandPowers[key];
    if (!data) return;
    var val = data.mean != null ? data.mean : 0;
    var barW = Math.max(2, (Math.abs(val) / maxVal) * barAreaW);
    var yPos = mT + idx * (barH + barGap);
    var color = _POWER_BAND_COLORS[key] || '#9e9e9e';

    // Band label on left
    parts.push('<text x="' + (mL - 8) + '" y="' + (yPos + barH / 2 + 4) + '" text-anchor="end" font-size="10" font-weight="600" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif">' + key.charAt(0).toUpperCase() + key.slice(1) + '</text>');

    // Bar background
    parts.push('<rect x="' + mL + '" y="' + yPos + '" width="' + barAreaW + '" height="' + barH + '" rx="3" fill="rgba(255,255,255,0.04)"/>');

    // Bar fill
    parts.push('<rect x="' + mL + '" y="' + yPos + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="3" fill="' + color + '" fill-opacity="0.7"/>');

    // Value text on right of bar
    var valText = val.toExponential(2);
    parts.push('<text x="' + (mL + barAreaW + 8) + '" y="' + (yPos + barH / 2 + 4) + '" font-size="9" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + valText + '</text>');

    // Status badge
    if (showStatus && data.status) {
      var statusColor = '#66bb6a'; // Normal = green
      if (data.status === 'Reduced') statusColor = '#ffa726';
      if (data.status === 'Elevated') statusColor = '#ef5350';

      var badgeX = mL + barAreaW + 70;
      var badgeW = data.status.length * 6 + 10;
      parts.push('<rect x="' + badgeX + '" y="' + (yPos + 3) + '" width="' + badgeW + '" height="' + (barH - 6) + '" rx="4" fill="' + statusColor + '" fill-opacity="0.2" stroke="' + statusColor + '" stroke-width="0.5"/>');
      parts.push('<text x="' + (badgeX + badgeW / 2) + '" y="' + (yPos + barH / 2 + 3) + '" text-anchor="middle" font-size="8" font-weight="600" fill="' + statusColor + '" font-family="system-ui,sans-serif">' + data.status + '</text>');
    }
  });

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderTBRBarChart — Vertical bar chart of theta/beta ratio per channel
//
// tbrPerChannel: { Fp1: 2.47, Fp2: 3.17, F7: 2.85, ... }
// options.width:     number (default 600)
// options.height:    number (default 280)
// options.threshold: number — clinical TBR threshold line (default 4.0)
// ─────────────────────────────────────────────────────────────────────────────

var _TBR_CHANNEL_ORDER = [
  'Fp1','Fp2','F7','F3','Fz','F4','F8',
  'T7','C3','Cz','C4','T8',
  'P7','P3','Pz','P4','P8',
  'O1','O2'
];

export function renderTBRBarChart(tbrPerChannel, options) {
  var opts = options || {};
  var width  = opts.width  || 600;
  var height = opts.height || 280;
  var threshold = opts.threshold != null ? opts.threshold : 4.0;

  if (!tbrPerChannel) return '<div>No TBR data</div>';

  // Collect channels in standard order, filtering to those present
  var channels = [];
  _TBR_CHANNEL_ORDER.forEach(function (ch) {
    if (tbrPerChannel[ch] != null) channels.push(ch);
  });
  // Add any remaining channels not in standard order
  var chKeys = Object.keys(tbrPerChannel);
  chKeys.forEach(function (ch) {
    if (channels.indexOf(ch) === -1 && tbrPerChannel[ch] != null) channels.push(ch);
  });

  if (channels.length === 0) return '<div>No TBR data</div>';

  // Find max TBR and compute overall average
  var maxTBR = 0;
  var tbrSum = 0;
  channels.forEach(function (ch) {
    var v = tbrPerChannel[ch];
    if (v > maxTBR) maxTBR = v;
    tbrSum += v;
  });
  maxTBR = Math.max(maxTBR, threshold + 1); // ensure threshold line is visible
  var avgTBR = tbrSum / channels.length;

  var mL = 45;   // left margin for y-axis
  var mR = 15;   // right margin
  var mT = 50;   // top margin for title + overall TBR
  var mB = 55;   // bottom margin for labels
  var plotW = width - mL - mR;
  var plotH = height - mT - mB;
  var barW = Math.max(6, Math.min(24, (plotW / channels.length) * 0.7));
  var barGap = plotW / channels.length;

  var parts = [];
  parts.push('<svg class="ds-tbr-bar-chart" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Theta/Beta Ratio by Channel" tabindex="0">');

  // Title
  parts.push('<text x="' + (width / 2) + '" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">Theta/Beta Ratio by Channel</text>');

  // Overall TBR display
  parts.push('<text x="' + (width / 2) + '" y="38" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">Overall TBR: ' + avgTBR.toFixed(2) + '</text>');

  // Plot background
  parts.push('<rect x="' + mL + '" y="' + mT + '" width="' + plotW + '" height="' + plotH + '" fill="rgba(255,255,255,0.02)" rx="2"/>');

  // Y-axis grid lines and labels
  var yTicks = 5;
  for (var yi = 0; yi <= yTicks; yi++) {
    var yVal = maxTBR * yi / yTicks;
    var yPos = mT + plotH - (plotH * yi / yTicks);
    parts.push('<line x1="' + mL + '" y1="' + yPos.toFixed(1) + '" x2="' + (mL + plotW) + '" y2="' + yPos.toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>');
    parts.push('<text x="' + (mL - 6) + '" y="' + (yPos + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">' + yVal.toFixed(1) + '</text>');
  }

  // Threshold line
  var threshY = mT + plotH - (plotH * (threshold / maxTBR));
  parts.push('<line x1="' + mL + '" y1="' + threshY.toFixed(1) + '" x2="' + (mL + plotW) + '" y2="' + threshY.toFixed(1) + '" stroke="rgba(239,68,68,0.6)" stroke-width="1.5" stroke-dasharray="6,3"/>');
  parts.push('<text x="' + (mL + plotW + 2) + '" y="' + (threshY - 4).toFixed(1) + '" font-size="7" font-weight="600" fill="rgba(239,68,68,0.8)" font-family="system-ui,sans-serif">Clinical Threshold (' + threshold.toFixed(1) + ')</text>');

  // Vertical bars
  channels.forEach(function (ch, idx) {
    var val = tbrPerChannel[ch];
    var barHeight = Math.max(1, (val / maxTBR) * plotH);
    var xPos = mL + idx * barGap + (barGap - barW) / 2;
    var yPos = mT + plotH - barHeight;

    // Color by TBR range
    var color;
    if (val < 2.0) {
      color = '#42a5f5'; // blue - hypoarousal
    } else if (val <= 4.0) {
      color = '#66bb6a'; // green - normal
    } else {
      color = '#ef5350'; // red - elevated
    }

    parts.push('<rect x="' + xPos.toFixed(1) + '" y="' + yPos.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="2" fill="' + color + '" fill-opacity="0.75"><title>' + ch + ': ' + val.toFixed(2) + '</title></rect>');

    // Value on top of bar
    parts.push('<text x="' + (xPos + barW / 2).toFixed(1) + '" y="' + (yPos - 4).toFixed(1) + '" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + val.toFixed(1) + '</text>');

    // Channel label (rotated 45 degrees)
    var labelX = xPos + barW / 2;
    var labelY = mT + plotH + 12;
    parts.push('<text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="end" font-size="8" font-weight="600" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" transform="rotate(-45,' + labelX.toFixed(1) + ',' + labelY.toFixed(1) + ')">' + ch + '</text>');
  });

  // Y-axis label
  var yAxisY = mT + plotH / 2;
  parts.push('<text x="12" y="' + yAxisY + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif" transform="rotate(-90,12,' + yAxisY + ')">TBR Value</text>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderSignalDeviationChart — Dual bar chart: mean amplitude + std deviation
//
// deviations: { Fp1: {mean, std}, Fp2: {mean, std}, ... }
// options.width:  number (default 600)
// options.height: number (default 350)
// ─────────────────────────────────────────────────────────────────────────────

export function renderSignalDeviationChart(deviations, options) {
  var opts = options || {};
  var width  = opts.width  || 600;
  var height = opts.height || 350;

  if (!deviations) return '<div>No signal deviation data</div>';

  // Collect channels in standard order
  var channels = [];
  _TBR_CHANNEL_ORDER.forEach(function (ch) {
    if (deviations[ch]) channels.push(ch);
  });
  var devKeys = Object.keys(deviations);
  devKeys.forEach(function (ch) {
    if (channels.indexOf(ch) === -1 && deviations[ch]) channels.push(ch);
  });

  if (channels.length === 0) return '<div>No signal deviation data</div>';

  // Find max values for normalization
  var maxMean = 0;
  var maxStd = 0;
  var highestMeanCh = channels[0];
  var highestStdCh = channels[0];
  channels.forEach(function (ch) {
    var d = deviations[ch];
    var absMean = Math.abs(d.mean || 0);
    var absStd = Math.abs(d.std || 0);
    if (absMean > maxMean) { maxMean = absMean; highestMeanCh = ch; }
    if (absStd > maxStd) { maxStd = absStd; highestStdCh = ch; }
  });
  maxMean = maxMean || 1;
  maxStd = maxStd || 1;

  var mL = 60;
  var mR = 15;
  var mT = 35;
  var mMid = 20;  // gap between top and bottom sections
  var mB = 50;
  var plotW = width - mL - mR;
  var sectionH = (height - mT - mMid - mB) / 2;
  var barGap = plotW / channels.length;
  var barW = Math.max(6, Math.min(20, barGap * 0.7));

  var parts = [];
  parts.push('<svg class="ds-signal-deviation" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="EEG Signal Deviations" tabindex="0">');

  // Title
  parts.push('<text x="' + (width / 2) + '" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">EEG Signal Deviations</text>');

  // ── Top section: Mean amplitude (bars from zero line) ──
  var topY = mT;
  var zeroY = topY + sectionH / 2; // zero line in middle of top section

  // Section label
  parts.push('<text x="' + (width / 2) + '" y="' + (topY - 2) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">Mean Amplitude</text>');

  // Background
  parts.push('<rect x="' + mL + '" y="' + topY + '" width="' + plotW + '" height="' + sectionH + '" fill="rgba(255,255,255,0.02)" rx="2"/>');

  // Zero line
  parts.push('<line x1="' + mL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (mL + plotW) + '" y2="' + zeroY.toFixed(1) + '" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>');

  // Y-axis labels for top section
  parts.push('<text x="' + (mL - 5) + '" y="' + (topY + 8) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">+' + maxMean.toExponential(1) + '</text>');
  parts.push('<text x="' + (mL - 5) + '" y="' + (zeroY + 3) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">0</text>');
  parts.push('<text x="' + (mL - 5) + '" y="' + (topY + sectionH) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">-' + maxMean.toExponential(1) + '</text>');

  // Mean amplitude bars
  channels.forEach(function (ch, idx) {
    var d = deviations[ch];
    var val = d.mean || 0;
    var normalized = val / maxMean;
    var barHeight = Math.abs(normalized) * (sectionH / 2);
    var xPos = mL + idx * barGap + (barGap - barW) / 2;

    // Color gradient based on magnitude
    var intensity = Math.min(1, Math.abs(normalized));
    var color = 'rgba(74,158,255,' + (0.3 + intensity * 0.6).toFixed(2) + ')';

    if (val >= 0) {
      // Bar goes up from zero
      parts.push('<rect x="' + xPos.toFixed(1) + '" y="' + (zeroY - barHeight).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="1" fill="' + color + '"><title>' + ch + ' mean: ' + val.toExponential(2) + '</title></rect>');
    } else {
      // Bar goes down from zero
      parts.push('<rect x="' + xPos.toFixed(1) + '" y="' + zeroY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="1" fill="' + color + '"><title>' + ch + ' mean: ' + val.toExponential(2) + '</title></rect>');
    }

    // Highlight annotation for highest mean
    if (ch === highestMeanCh) {
      parts.push('<circle cx="' + (xPos + barW / 2).toFixed(1) + '" cy="' + (val >= 0 ? zeroY - barHeight - 8 : zeroY + barHeight + 8).toFixed(1) + '" r="3" fill="#ffa726"/>');
      parts.push('<text x="' + (xPos + barW / 2).toFixed(1) + '" y="' + (val >= 0 ? zeroY - barHeight - 14 : zeroY + barHeight + 16).toFixed(1) + '" text-anchor="middle" font-size="6" font-weight="600" fill="#ffa726" font-family="system-ui,sans-serif">Highest</text>');
    }
  });

  // ── Bottom section: Standard deviation (bars going up only) ──
  var botY = topY + sectionH + mMid;

  // Section label
  parts.push('<text x="' + (width / 2) + '" y="' + (botY - 2) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif">Standard Deviation</text>');

  // Background
  parts.push('<rect x="' + mL + '" y="' + botY + '" width="' + plotW + '" height="' + sectionH + '" fill="rgba(255,255,255,0.02)" rx="2"/>');

  // Y-axis labels for bottom section
  parts.push('<text x="' + (mL - 5) + '" y="' + (botY + 8) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">' + maxStd.toExponential(1) + '</text>');
  parts.push('<text x="' + (mL - 5) + '" y="' + (botY + sectionH) + '" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif">0</text>');

  // Std deviation bars
  channels.forEach(function (ch, idx) {
    var d = deviations[ch];
    var val = d.std || 0;
    var normalized = val / maxStd;
    var barHeight = Math.max(1, normalized * sectionH);
    var xPos = mL + idx * barGap + (barGap - barW) / 2;
    var yPos = botY + sectionH - barHeight;

    // Color gradient based on deviation magnitude
    var intensity = Math.min(1, normalized);
    var r = Math.round(100 + intensity * 139);
    var g = Math.round(200 - intensity * 130);
    var b = Math.round(255 - intensity * 180);
    var color = 'rgb(' + r + ',' + g + ',' + b + ')';

    parts.push('<rect x="' + xPos.toFixed(1) + '" y="' + yPos.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" rx="1" fill="' + color + '" fill-opacity="0.75"><title>' + ch + ' std: ' + val.toExponential(2) + '</title></rect>');

    // Highlight annotation for highest variability
    if (ch === highestStdCh) {
      parts.push('<circle cx="' + (xPos + barW / 2).toFixed(1) + '" cy="' + (yPos - 8).toFixed(1) + '" r="3" fill="#ef5350"/>');
      parts.push('<text x="' + (xPos + barW / 2).toFixed(1) + '" y="' + (yPos - 14).toFixed(1) + '" text-anchor="middle" font-size="6" font-weight="600" fill="#ef5350" font-family="system-ui,sans-serif">Most Variable</text>');
    }

    // Channel label on x-axis (shared between sections)
    var labelX = xPos + barW / 2;
    var labelY = botY + sectionH + 12;
    parts.push('<text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="end" font-size="7" font-weight="600" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif" transform="rotate(-45,' + labelX.toFixed(1) + ',' + labelY.toFixed(1) + ')">' + ch + '</text>');
  });

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderBiomarkerGauges — Semi-circular gauge meters for condition likelihoods
//
// conditions: [{name, likelihood, relevance}, ...]
// options.width:     number (default 600)
// options.columns:   number (default 3)
// options.gaugeSize: number — diameter of each gauge (default 100)
// ─────────────────────────────────────────────────────────────────────────────

export function renderBiomarkerGauges(conditions, options) {
  var opts = options || {};
  var svgWidth   = opts.width     || 600;
  var columns    = opts.columns   || 3;
  var gaugeSize  = opts.gaugeSize || 100;

  if (!conditions || !conditions.length) return '<div>No biomarker data</div>';

  // Sort by likelihood descending
  var sorted = conditions.slice().sort(function (a, b) {
    return (b.likelihood || 0) - (a.likelihood || 0);
  });

  var rows = Math.ceil(sorted.length / columns);
  var cellW = svgWidth / columns;
  var cellH = gaugeSize + 55; // gauge + name + badge
  var totalH = rows * cellH + 30; // +30 for title

  var parts = [];
  parts.push('<svg class="ds-biomarker-gauges" viewBox="0 0 ' + svgWidth + ' ' + totalH + '" width="' + svgWidth + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Biomarker condition gauges" tabindex="0">');

  // Title
  parts.push('<text x="' + (svgWidth / 2) + '" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">Condition Likelihood Gauges</text>');

  sorted.forEach(function (cond, idx) {
    var col = idx % columns;
    var row = Math.floor(idx / columns);
    var cx = col * cellW + cellW / 2;
    var cy = 30 + row * cellH + gaugeSize / 2 + 10;
    var r = gaugeSize / 2 - 5;
    var likelihood = cond.likelihood || 0;

    // Arc color based on likelihood range
    var arcColor;
    if (likelihood <= 0) {
      arcColor = '#616161'; // gray for 0%
    } else if (likelihood <= 30) {
      arcColor = '#66bb6a'; // green
    } else if (likelihood <= 50) {
      arcColor = '#ffa726'; // amber
    } else if (likelihood <= 70) {
      arcColor = '#ff7043'; // orange
    } else {
      arcColor = '#ef5350'; // red
    }

    // Background arc (full semi-circle, 180 degrees)
    // Semi-circle from left to right (180 degrees, going clockwise from 9 o'clock to 3 o'clock)
    var bgStartX = cx - r;
    var bgStartY = cy;
    var bgEndX = cx + r;
    var bgEndY = cy;
    parts.push('<path d="M' + bgStartX.toFixed(1) + ',' + bgStartY.toFixed(1) + ' A' + r + ',' + r + ' 0 0,1 ' + bgEndX.toFixed(1) + ',' + bgEndY.toFixed(1) + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linecap="round"/>');

    // Filled arc proportional to likelihood
    if (likelihood > 0) {
      var fraction = Math.min(1, likelihood / 100);
      var angle = Math.PI * fraction;  // 0 to PI for 0% to 100%
      var endX = cx - r * Math.cos(angle);
      var endY = cy - r * Math.sin(angle);
      // Arc spans at most 180deg (PI), so large-arc-flag is always 0
      var largeArc = 0;
      parts.push('<path d="M' + bgStartX.toFixed(1) + ',' + bgStartY.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + endX.toFixed(1) + ',' + endY.toFixed(1) + '" fill="none" stroke="' + arcColor + '" stroke-width="8" stroke-linecap="round" opacity="0.85"/>');
    }

    // Percentage text in center
    parts.push('<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="16" font-weight="700" fill="' + (likelihood > 0 ? arcColor : 'rgba(255,255,255,0.3)') + '" font-family="system-ui,sans-serif">' + likelihood.toFixed(0) + '%</text>');

    // Condition name below gauge
    var nameY = cy + r / 2 + 12;
    parts.push('<text x="' + cx + '" y="' + nameY.toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="600" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif">' + (cond.name || 'Unknown') + '</text>');

    // Relevance badge below name
    if (cond.relevance) {
      var rel = cond.relevance.toLowerCase();
      var relColor = '#66bb6a'; // default green
      if (rel.indexOf('limited') >= 0 || rel.indexOf('minimal') >= 0) relColor = '#78909c';
      if (rel.indexOf('mild') >= 0) relColor = '#a1887f';
      if (rel.indexOf('moderate') >= 0) relColor = '#ffa726';
      if (rel.indexOf('high') >= 0 || rel.indexOf('significant') >= 0 || rel.indexOf('strong') >= 0) relColor = '#ef5350';

      var badgeY = nameY + 14;
      var badgeW = cond.relevance.length * 5.5 + 12;
      parts.push('<rect x="' + (cx - badgeW / 2) + '" y="' + (badgeY - 9) + '" width="' + badgeW + '" height="14" rx="4" fill="' + relColor + '" fill-opacity="0.2" stroke="' + relColor + '" stroke-width="0.5"/>');
      parts.push('<text x="' + cx + '" y="' + (badgeY + 2) + '" text-anchor="middle" font-size="7" font-weight="600" fill="' + relColor + '" font-family="system-ui,sans-serif">' + cond.relevance + '</text>');
    }
  });

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// renderBrodmannTable — SVG table of Brodmann area Z-scores
//
// areas: [{area, name, z_score, status, channels: [...]}, ...]
// options.width: number (default 600)
// ─────────────────────────────────────────────────────────────────────────────

export function renderBrodmannTable(areas, options) {
  var opts = options || {};
  var width = opts.width || 900;

  if (!areas || !areas.length) return '<div>No Brodmann area data</div>';

  // Check if any area has clinical_relevance data
  var hasClinRel = areas.some(function (a) { return a.clinical_relevance && a.clinical_relevance.length > 0; });
  var hasFunctions = areas.some(function (a) { return a.functions && a.functions.length > 0; });

  // Table layout
  var mL = 10;
  var mT = 35;
  var rowH = 28;
  var headerH = 30;
  var tableW = width - mL * 2;

  // Column widths (proportional) — expand based on available data
  var colWidths, colLabels;
  if (hasFunctions && hasClinRel) {
    colWidths = [0.13, 0.13, 0.09, 0.10, 0.11, 0.22, 0.22];
    colLabels = ['Area', 'Name', 'Z-Score', 'Status', 'Channels', 'Functions', 'Clinical Relevance'];
  } else if (hasFunctions) {
    colWidths = [0.15, 0.15, 0.10, 0.12, 0.13, 0.35];
    colLabels = ['Area', 'Name', 'Z-Score', 'Status', 'Channels', 'Functions'];
  } else {
    colWidths = [0.22, 0.22, 0.16, 0.18, 0.22];
    colLabels = ['Area', 'Name', 'Z-Score', 'Status', 'Channels'];
  }

  var totalH = mT + headerH + areas.length * rowH + 10;

  function colX(colIdx) {
    var x = mL;
    for (var i = 0; i < colIdx; i++) {
      x += tableW * colWidths[i];
    }
    return x;
  }

  function colMidX(colIdx) {
    return colX(colIdx) + tableW * colWidths[colIdx] / 2;
  }

  // Escape helper for text content
  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Truncate long text to fit column width
  function truncate(str, maxChars) {
    if (!str || str.length <= maxChars) return str || '';
    return str.substring(0, maxChars - 1) + '\u2026';
  }

  var parts = [];
  parts.push('<svg class="ds-brodmann-table" viewBox="0 0 ' + width + ' ' + totalH + '" width="' + width + '" height="' + totalH + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Brodmann Area Analysis" tabindex="0">');

  // Title
  parts.push('<text x="' + (width / 2) + '" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif">Brodmann Area Analysis</text>');

  // Header row background
  parts.push('<rect x="' + mL + '" y="' + mT + '" width="' + tableW + '" height="' + headerH + '" rx="3" fill="rgba(255,255,255,0.08)"/>');

  // Header labels
  for (var hi = 0; hi < colLabels.length; hi++) {
    parts.push('<text x="' + (colX(hi) + 8) + '" y="' + (mT + headerH / 2 + 4) + '" font-size="9" font-weight="700" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + colLabels[hi] + '</text>');
  }

  // Data rows
  areas.forEach(function (row, idx) {
    var ry = mT + headerH + idx * rowH;

    // Alternating row backgrounds
    if (idx % 2 === 0) {
      parts.push('<rect x="' + mL + '" y="' + ry + '" width="' + tableW + '" height="' + rowH + '" fill="rgba(255,255,255,0.03)"/>');
    }

    // Row border
    parts.push('<line x1="' + mL + '" y1="' + (ry + rowH) + '" x2="' + (mL + tableW) + '" y2="' + (ry + rowH) + '" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>');

    var textY = ry + rowH / 2 + 4;

    // Column 0: Area name
    parts.push('<text x="' + (colX(0) + 8) + '" y="' + textY + '" font-size="8" fill="rgba(255,255,255,0.75)" font-family="system-ui,sans-serif">' + esc(row.area || '') + '</text>');

    // Column 1: Anatomical name
    parts.push('<text x="' + (colX(1) + 8) + '" y="' + textY + '" font-size="8" fill="rgba(255,255,255,0.75)" font-family="system-ui,sans-serif">' + esc(row.name || '') + '</text>');

    // Column 2: Z-score with color and inline bar
    var zScore = row.z_score != null ? row.z_score : 0;
    var absZ = Math.abs(zScore);
    var zColor;
    if (absZ > 2.0) {
      zColor = '#ef5350'; // red — significant
    } else if (absZ > 1.5) {
      zColor = '#ffa726'; // amber — borderline
    } else {
      zColor = '#66bb6a'; // green — normal
    }

    // Z-score cell background tint
    var zCellX = colX(2);
    var zCellW = tableW * colWidths[2];
    parts.push('<rect x="' + zCellX + '" y="' + ry + '" width="' + zCellW + '" height="' + rowH + '" fill="' + zColor + '" fill-opacity="0.08"/>');

    // Small horizontal deviation bar (centered at midpoint of cell)
    var barMaxW = zCellW * 0.4;
    var barW = Math.min(barMaxW, (absZ / 3) * barMaxW); // normalize to z=3
    var barMidX = zCellX + zCellW / 2;
    var barY = ry + rowH / 2 - 2;
    if (zScore >= 0) {
      parts.push('<rect x="' + barMidX + '" y="' + barY + '" width="' + barW.toFixed(1) + '" height="4" rx="1" fill="' + zColor + '" fill-opacity="0.5"/>');
    } else {
      parts.push('<rect x="' + (barMidX - barW).toFixed(1) + '" y="' + barY + '" width="' + barW.toFixed(1) + '" height="4" rx="1" fill="' + zColor + '" fill-opacity="0.5"/>');
    }

    // Z-score text
    parts.push('<text x="' + (zCellX + 8) + '" y="' + textY + '" font-size="9" font-weight="600" fill="' + zColor + '" font-family="system-ui,sans-serif">' + zScore.toFixed(2) + '</text>');

    // Column 3: Status badge
    var status = row.status || '';
    var statusColor = '#66bb6a';
    if (status === 'borderline') statusColor = '#ffa726';
    if (status === 'abnormal' || status === 'significant' || status === 'mild_increase') statusColor = '#ef5350';

    var statusX = colX(3) + 8;
    var statusBadgeW = Math.max(40, status.length * 5.5 + 12);
    parts.push('<rect x="' + statusX + '" y="' + (ry + 6) + '" width="' + statusBadgeW + '" height="' + (rowH - 12) + '" rx="4" fill="' + statusColor + '" fill-opacity="0.15" stroke="' + statusColor + '" stroke-width="0.5"/>');
    parts.push('<text x="' + (statusX + statusBadgeW / 2) + '" y="' + textY + '" text-anchor="middle" font-size="8" font-weight="600" fill="' + statusColor + '" font-family="system-ui,sans-serif">' + esc(status) + '</text>');

    // Column 4: Channels
    var chText = Array.isArray(row.channels) ? row.channels.join(', ') : '';
    parts.push('<text x="' + (colX(4) + 8) + '" y="' + textY + '" font-size="8" fill="rgba(255,255,255,0.65)" font-family="system-ui,sans-serif">' + esc(chText) + '</text>');

    // Column 5: Functions (if present)
    if (hasFunctions) {
      var funcText = Array.isArray(row.functions) ? row.functions.join(', ') : (row.functions || '');
      var maxFuncChars = hasClinRel ? 35 : 55;
      parts.push('<text x="' + (colX(5) + 8) + '" y="' + textY + '" font-size="7" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + esc(truncate(funcText, maxFuncChars)) + '</text>');
    }

    // Column 6: Clinical Relevance (if present)
    if (hasFunctions && hasClinRel) {
      var clinText = row.clinical_relevance || '';
      var clinColor = clinText ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
      parts.push('<text x="' + (colX(6) + 8) + '" y="' + textY + '" font-size="7" fill="' + clinColor + '" font-family="system-ui,sans-serif">' + esc(truncate(clinText, 35) || '\u2014') + '</text>');
    }
  });

  // Table outer border
  parts.push('<rect x="' + mL + '" y="' + mT + '" width="' + tableW + '" height="' + (headerH + areas.length * rowH) + '" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" rx="3"/>');

  parts.push('</svg>');
  return parts.join('');
}


// ─────────────────────────────────────────────────────────────────────────────
// render3DBrainMap — 3D-style top-down brain visualization for qEEG
//
// Renders a realistic top-down brain SVG with lobe regions color-coded by
// qEEG band power data.  Uses gradients, sulci lines and shadows for a 3D
// appearance.
//
// bandPowers:    { [channelName]: number }
// options.band / .size / .colorScale / .showElectrodes / .animate / .mini
// ─────────────────────────────────────────────────────────────────────────────

var QEEG_BAND_COLORS = {
  delta:     { base: '#42a5f5', glow: '#1565c0', label: 'Delta (0.5-4 Hz)' },
  theta:     { base: '#7e57c2', glow: '#4527a0', label: 'Theta (4-8 Hz)' },
  alpha:     { base: '#66bb6a', glow: '#2e7d32', label: 'Alpha (8-12 Hz)' },
  beta:      { base: '#ffa726', glow: '#e65100', label: 'Beta (12-30 Hz)' },
  high_beta: { base: '#ef5350', glow: '#b71c1c', label: 'Hi-Beta (20-30 Hz)' },
  gamma:     { base: '#ec407a', glow: '#880e4f', label: 'Gamma (30-100 Hz)' },
};

var BRAIN_LOBE_PATHS = {
  frontal_l:  { path: 'M196,52 C170,54 148,62 130,78 C112,96 102,118 98,142 C96,158 96,172 98,186 L196,186 Z',  electrodes: ['Fp1','F7','F3','Fz'] },
  frontal_r:  { path: 'M204,52 C230,54 252,62 270,78 C288,96 298,118 302,142 C304,158 304,172 302,186 L204,186 Z', electrodes: ['Fp2','F4','F8'] },
  temporal_l: { path: 'M98,186 C92,196 86,210 82,228 C78,248 80,268 86,286 C90,296 96,304 104,310 L130,310 L130,186 Z', electrodes: ['T7','P7'] },
  central_l:  { path: 'M130,186 L130,310 L196,310 L196,186 Z', electrodes: ['C3','Cz'] },
  central_r:  { path: 'M204,186 L204,310 L270,310 L270,186 Z', electrodes: ['C4'] },
  temporal_r: { path: 'M270,186 L270,310 L296,310 C304,304 310,296 314,286 C320,268 322,248 318,228 C314,210 308,196 302,186 Z', electrodes: ['T8','P8'] },
  parietal_l: { path: 'M104,310 C112,320 124,330 138,338 L196,338 L196,310 L130,310 Z', electrodes: ['P3','Pz'] },
  parietal_r: { path: 'M204,310 L204,338 L262,338 C276,330 288,320 296,310 L270,310 Z', electrodes: ['P4'] },
  occipital_l:{ path: 'M138,338 C154,348 172,354 190,356 L196,356 L196,338 Z', electrodes: ['O1'] },
  occipital_r:{ path: 'M204,338 L204,356 L210,356 C228,354 246,348 262,338 Z', electrodes: ['O2'] },
};

var BRAIN_3D_ELECTRODE_POS = {
  Fp1:{x:160,y:80},  Fp2:{x:240,y:80},
  F7:{x:110,y:130},  F3:{x:158,y:130}, Fz:{x:200,y:120},
  F4:{x:242,y:130},  F8:{x:290,y:130},
  T7:{x:90,y:220},   C3:{x:156,y:220}, Cz:{x:200,y:215},
  C4:{x:244,y:220},  T8:{x:310,y:220},
  P7:{x:108,y:298},  P3:{x:158,y:300}, Pz:{x:200,y:310},
  P4:{x:242,y:300},  P8:{x:292,y:298},
  O1:{x:172,y:346},  O2:{x:228,y:346},
};

function _getLobeAvgPower(lobe, bandPowers) {
  var sum = 0, count = 0;
  lobe.electrodes.forEach(function (ch) {
    var v = bandPowers[ch];
    if (v !== undefined && v !== null && Number.isFinite(v)) { sum += v; count++; }
  });
  return count > 0 ? sum / count : null;
}

var _BRAIN_OUTLINE = 'M200,48 C168,50 138,60 114,76 C90,94 74,118 68,148 C62,178 64,210 70,240 C76,268 88,294 106,314 C124,334 148,350 176,358 C188,362 196,362 200,362 C204,362 212,362 224,358 C252,350 276,334 294,314 C312,294 324,268 330,240 C336,210 338,178 332,148 C326,118 310,94 286,76 C262,60 232,50 200,48 Z';

export function render3DBrainMap(bandPowers, options) {
  var opts = options || {};
  var band = opts.band || 'alpha';
  var size = Number.isFinite(opts.size) ? opts.size : 380;
  var showElectrodes = opts.showElectrodes !== false;
  var palette = HEATMAP_PALETTES[opts.colorScale] || HEATMAP_PALETTES.warm;
  var bandColor = QEEG_BAND_COLORS[band] || QEEG_BAND_COLORS.alpha;

  var values = [];
  if (bandPowers) {
    Object.keys(bandPowers).forEach(function (ch) {
      var v = bandPowers[ch];
      if (v !== undefined && v !== null && Number.isFinite(v)) values.push(v);
    });
  }
  var vMin = values.length ? Math.min.apply(null, values) : 0;
  var vMax = values.length ? Math.max.apply(null, values) : 1;
  var range = vMax - vMin || 1;

  var uid = 'b3d-' + Math.random().toString(36).substr(2, 6);
  var p = [];
  p.push('<svg class="ds-brain-3d" viewBox="0 0 400 430" width="' + size + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="3D Brain Map — ' + band + '">');

  // Defs
  p.push('<defs>');
  p.push('<radialGradient id="' + uid + '-light" cx="45%" cy="35%" r="60%"><stop offset="0%" stop-color="rgba(255,255,255,0.15)"/><stop offset="70%" stop-color="rgba(255,255,255,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.15)"/></radialGradient>');
  p.push('<filter id="' + uid + '-shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="rgba(0,0,0,0.5)"/></filter>');
  p.push('<clipPath id="' + uid + '-clip"><path d="' + _BRAIN_OUTLINE + '"/></clipPath>');
  Object.keys(BRAIN_LOBE_PATHS).forEach(function (k) {
    var avg = _getLobeAvgPower(BRAIN_LOBE_PATHS[k], bandPowers || {});
    var t = avg !== null ? (avg - vMin) / range : 0.3;
    var c = _interpolateColor(palette, t);
    p.push('<linearGradient id="' + uid + '-' + k + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + c + '" stop-opacity="0.85"/><stop offset="100%" stop-color="' + c + '" stop-opacity="0.6"/></linearGradient>');
  });
  p.push('</defs>');

  // Shadow + base
  p.push('<path d="' + _BRAIN_OUTLINE + '" fill="#0a1428" filter="url(#' + uid + '-shadow)" opacity="0.7"/>');
  p.push('<path d="' + _BRAIN_OUTLINE + '" fill="#0f1e36"/>');

  // Lobe regions
  p.push('<g clip-path="url(#' + uid + '-clip)">');
  Object.keys(BRAIN_LOBE_PATHS).forEach(function (k) {
    p.push('<path d="' + BRAIN_LOBE_PATHS[k].path + '" fill="url(#' + uid + '-' + k + ')" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>');
  });
  p.push('</g>');

  // Sulci
  p.push('<g clip-path="url(#' + uid + '-clip)" opacity="0.15" stroke="rgba(255,255,255,0.5)" stroke-width="0.8" fill="none">');
  p.push('<line x1="200" y1="52" x2="200" y2="358" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>');
  ['M90,190 C130,178 160,186 196,186','M204,186 C240,186 270,178 310,190',
   'M86,215 C100,225 118,228 136,220','M264,220 C282,228 300,225 314,215',
   'M140,330 C160,336 180,340 196,342','M204,342 C220,340 240,336 260,330',
   'M120,100 C148,108 172,106 196,102','M204,102 C228,106 252,108 280,100',
   'M108,148 C140,156 168,154 196,150','M204,150 C232,154 260,156 292,148',
   'M120,260 C148,268 172,266 196,262','M204,262 C228,266 252,268 280,260'
  ].forEach(function (d) { p.push('<path d="' + d + '"/>'); });
  p.push('</g>');

  // 3D lighting + outline
  p.push('<path d="' + _BRAIN_OUTLINE + '" fill="url(#' + uid + '-light)" pointer-events="none"/>');
  p.push('<path d="' + _BRAIN_OUTLINE + '" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>');

  // Electrodes
  if (showElectrodes) {
    Object.keys(BRAIN_3D_ELECTRODE_POS).forEach(function (ch) {
      var pos = BRAIN_3D_ELECTRODE_POS[ch];
      var v = bandPowers ? bandPowers[ch] : undefined;
      var hasVal = v !== undefined && v !== null && Number.isFinite(v);
      var t = hasVal ? (v - vMin) / range : 0;
      var dotColor = hasVal ? _interpolateColor(palette, t) : 'rgba(30,40,60,0.8)';
      var textVal = hasVal ? (v < 10 ? v.toFixed(1) : Math.round(v)) : '';
      p.push('<circle cx="' + pos.x + '" cy="' + pos.y + '" r="11" fill="' + dotColor + '" stroke="rgba(255,255,255,0.55)" stroke-width="1" opacity="0.9"/>');
      p.push('<text x="' + pos.x + '" y="' + (pos.y - 1) + '" text-anchor="middle" font-size="6.5" font-weight="700" fill="rgba(255,255,255,0.95)" font-family="system-ui,sans-serif">' + ch + '</text>');
      if (textVal) p.push('<text x="' + pos.x + '" y="' + (pos.y + 7) + '" text-anchor="middle" font-size="5.5" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif">' + textVal + '</text>');
    });
  }

  // Legend
  var lY = 380, lW = 240, lX = 80;
  for (var i = 0; i < lW; i++) { p.push('<rect x="' + (lX + i) + '" y="' + lY + '" width="1.5" height="10" fill="' + _interpolateColor(palette, i / lW) + '"/>'); }
  p.push('<rect x="' + lX + '" y="' + lY + '" width="' + lW + '" height="10" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" rx="2"/>');
  p.push('<text x="' + lX + '" y="' + (lY + 22) + '" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + vMin.toFixed(1) + '</text>');
  p.push('<text x="' + (lX + lW) + '" y="' + (lY + 22) + '" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif">' + vMax.toFixed(1) + '</text>');
  p.push('<text x="200" y="' + (lY + 22) + '" text-anchor="middle" font-size="9" font-weight="600" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif">' + (bandColor.label || band) + '</text>');
  p.push('</svg>');
  return p.join('');
}

export function render3DBrainMapMini(activeBand) {
  var band = activeBand || 'alpha';
  var bc = QEEG_BAND_COLORS[band] || QEEG_BAND_COLORS.alpha;
  var uid = 'bm-' + Math.random().toString(36).substr(2, 5);
  var brainD = 'M24,5 C18,5.3 13,7.5 9.5,11 C6,14.8 4.2,19.5 3.8,24.5 C3.4,29.5 4,34.2 6.2,38 C8.4,41.8 12,44.5 16.5,45.5 C20,46.2 22.5,46.2 24,46.2 C25.5,46.2 28,46.2 31.5,45.5 C36,44.5 39.6,41.8 41.8,38 C44,34.2 44.6,29.5 44.2,24.5 C43.8,19.5 42,14.8 38.5,11 C35,7.5 30,5.3 24,5 Z';
  var svg = '<svg class="ds-brain-3d-mini" viewBox="0 0 48 48" width="42" height="42" xmlns="http://www.w3.org/2000/svg">';
  svg += '<defs><radialGradient id="' + uid + '-rg" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="' + bc.base + '" stop-opacity="0.35"/><stop offset="60%" stop-color="' + bc.glow + '" stop-opacity="0.2"/><stop offset="100%" stop-color="#0a1428" stop-opacity="0.6"/></radialGradient>';
  svg += '<filter id="' + uid + '-gl"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  svg += '<path d="' + brainD + '" fill="url(#' + uid + '-rg)" stroke="' + bc.base + '" stroke-width="0.8" stroke-opacity="0.5"/>';
  svg += '<line x1="24" y1="6" x2="24" y2="45" stroke="rgba(255,255,255,0.15)" stroke-width="0.6"/>';
  svg += '<path d="M8,23 C14,21 19,22.5 24,22.5" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>';
  svg += '<path d="M24,22.5 C29,22.5 34,21 40,23" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>';
  svg += '<path d="' + brainD + '" fill="none" stroke="' + bc.base + '" stroke-width="1.2" filter="url(#' + uid + '-gl)"><animate attributeName="stroke-opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite"/></path>';
  [{ x:17,y:12 },{ x:31,y:12 },{ x:13,y:19 },{ x:35,y:19 },{ x:24,y:17 },{ x:10,y:27 },{ x:38,y:27 },{ x:24,y:26 },{ x:17,y:40 },{ x:31,y:40 }].forEach(function (d) {
    svg += '<circle cx="' + d.x + '" cy="' + d.y + '" r="1.5" fill="' + bc.base + '" opacity="0.5"/>';
  });
  svg += '</svg>';
  return svg;
}
