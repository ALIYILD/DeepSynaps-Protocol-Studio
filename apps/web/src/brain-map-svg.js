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
    + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="10-20 EEG electrode map">');

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
