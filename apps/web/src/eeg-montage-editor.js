/**
 * eeg-montage-editor.js
 *
 * Utility module for clinical EEG montage editing, channel management,
 * and recording metadata display. Vanilla JS, ES module exports, no
 * external dependencies. Dark-themed UI fragments returned as HTML strings.
 */

// ---------------------------------------------------------------------------
// 10-20 system region mapping
// ---------------------------------------------------------------------------
var REGION_MAP = {
  Fp1: 'frontal', Fp2: 'frontal', F7: 'frontal', F3: 'frontal',
  Fz: 'frontal', F4: 'frontal', F8: 'frontal',
  T3: 'temporal', T4: 'temporal', T5: 'temporal', T6: 'temporal',
  C3: 'central', Cz: 'central', C4: 'central',
  P3: 'parietal', Pz: 'parietal', P4: 'parietal',
  O1: 'occipital', O2: 'occipital',
};

var REGION_COLORS = {
  frontal: '#42a5f5',
  central: '#66bb6a',
  temporal: '#ffa726',
  parietal: '#ab47bc',
  occipital: '#ef5350',
};

var QUALITY_COLORS = {
  good: '#4caf50',
  moderate: '#ff9800',
  bad: '#ef5350',
  flat: '#9e9e9e',
};

// Shared style tokens used across rendered HTML
var STYLE = {
  bg: '#0d1117',
  overlay: 'rgba(0,0,0,0.7)',
  border: 'rgba(255,255,255,0.08)',
  radius: '6px',
  text: '#e2e8f0',
  textSec: '#94a3b8',
  accent: '#00d4bc',
  danger: '#ef5350',
  font: 'system-ui, -apple-system, sans-serif',
  mono: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short unique id for custom montages. */
function _uid() {
  return 'cm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Escape HTML entities. */
function _esc(str) {
  var div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) { div.textContent = str; return div.innerHTML; }
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =========================================================================
// 1. EEGMontageEditor
// =========================================================================

/**
 * Custom montage definition and management.
 *
 * @param {string[]} availableChannels - channel names from the loaded recording
 */
export class EEGMontageEditor {
  constructor(availableChannels) {
    /** @type {string[]} */
    this.availableChannels = availableChannels || [];

    /** @type {Map<string, {name: string, pairs: string[][]}>} */
    this._custom = new Map();

    this.loadFromStorage();
  }

  // -- Built-in montages (read-only) --------------------------------------

  static BUILTIN_MONTAGES = {
    referential: { name: 'Referential', pairs: null },
    bipolar_long: {
      name: 'Bipolar (Longitudinal)',
      pairs: [
        ['Fp1', 'F7'], ['F7', 'T3'], ['T3', 'T5'], ['T5', 'O1'],
        ['Fp2', 'F8'], ['F8', 'T4'], ['T4', 'T6'], ['T6', 'O2'],
        ['Fp1', 'F3'], ['F3', 'C3'], ['C3', 'P3'], ['P3', 'O1'],
        ['Fp2', 'F4'], ['F4', 'C4'], ['C4', 'P4'], ['P4', 'O2'],
        ['Fz', 'Cz'], ['Cz', 'Pz'],
      ],
    },
    bipolar_trans: {
      name: 'Bipolar (Transverse)',
      pairs: [
        ['F7', 'Fp1'], ['Fp1', 'Fp2'], ['Fp2', 'F8'],
        ['T3', 'C3'], ['C3', 'Cz'], ['Cz', 'C4'], ['C4', 'T4'],
        ['T5', 'P3'], ['P3', 'Pz'], ['Pz', 'P4'], ['P4', 'T6'],
        ['O1', 'O2'],
      ],
    },
    average: { name: 'Average Reference', pairs: null },
    laplacian: { name: 'Laplacian (Small)', pairs: null },
  };

  // -- Laplacian neighbor definitions (10-20 standard) --------------------

  static LAPLACIAN_NEIGHBORS = {
    Fp1: ['F3', 'F7'], Fp2: ['F4', 'F8'],
    F7: ['Fp1', 'F3', 'T3'], F3: ['Fp1', 'Fz', 'C3', 'F7'],
    Fz: ['F3', 'F4', 'Cz'], F4: ['Fp2', 'Fz', 'C4', 'F8'],
    F8: ['Fp2', 'F4', 'T4'],
    T3: ['F7', 'C3', 'T5'], C3: ['F3', 'Cz', 'T3', 'P3'],
    Cz: ['Fz', 'C3', 'C4', 'Pz'], C4: ['F4', 'Cz', 'T4', 'P4'],
    T4: ['F8', 'C4', 'T6'],
    T5: ['T3', 'P3', 'O1'], P3: ['C3', 'Pz', 'T5', 'O1'],
    Pz: ['Cz', 'P3', 'P4'], P4: ['C4', 'Pz', 'T6', 'O2'],
    T6: ['T4', 'P4', 'O2'],
    O1: ['T5', 'P3'], O2: ['T6', 'P4'],
  };

  // -- Custom montage CRUD ------------------------------------------------

  /** Add a user-defined montage. Returns its unique id. */
  addCustomMontage(name, pairs) {
    var id = _uid();
    this._custom.set(id, { name: name, pairs: pairs });
    this.saveToStorage();
    return id;
  }

  /** Remove a custom montage by id. */
  removeCustomMontage(id) {
    this._custom.delete(id);
    this.saveToStorage();
  }

  /** Return all custom montages as a plain array. */
  getCustomMontages() {
    var result = [];
    this._custom.forEach(function (v, k) {
      result.push({ id: k, name: v.name, pairs: v.pairs });
    });
    return result;
  }

  // -- Apply montage to signal data ---------------------------------------

  /**
   * Transform raw channel data according to the selected montage.
   *
   * @param {string}     montageType - built-in key or custom montage id
   * @param {string[]}   channels    - channel names matching data rows
   * @param {number[][]} data        - 2-D array [channel][sample]
   * @returns {{channels: string[], data: number[][]}}
   */
  applyMontage(montageType, channels, data) {
    var idx = {};
    var i, j;
    for (i = 0; i < channels.length; i++) { idx[channels[i]] = i; }

    // --- Referential (pass-through) ---
    if (montageType === 'referential') {
      return { channels: channels.slice(), data: data.map(function (r) { return r.slice(); }) };
    }

    // --- Average reference ---
    if (montageType === 'average') {
      var nSamples = data[0] ? data[0].length : 0;
      var avg = new Array(nSamples);
      for (j = 0; j < nSamples; j++) {
        var sum = 0;
        for (i = 0; i < data.length; i++) { sum += data[i][j]; }
        avg[j] = sum / data.length;
      }
      var outData = data.map(function (row) {
        var r = new Array(nSamples);
        for (var s = 0; s < nSamples; s++) { r[s] = row[s] - avg[s]; }
        return r;
      });
      return { channels: channels.map(function (c) { return c + '-Avg'; }), data: outData };
    }

    // --- Laplacian ---
    if (montageType === 'laplacian') {
      var lapCh = [];
      var lapData = [];
      var neighbors = EEGMontageEditor.LAPLACIAN_NEIGHBORS;
      for (i = 0; i < channels.length; i++) {
        var ch = channels[i];
        var nb = neighbors[ch];
        if (!nb) continue;
        // filter to available neighbors
        var validNb = nb.filter(function (n) { return idx[n] !== undefined; });
        if (validNb.length === 0) continue;
        var nS = data[i].length;
        var row = new Array(nS);
        for (j = 0; j < nS; j++) {
          var avgNb = 0;
          for (var k = 0; k < validNb.length; k++) { avgNb += data[idx[validNb[k]]][j]; }
          avgNb /= validNb.length;
          row[j] = data[i][j] - avgNb;
        }
        lapCh.push(ch + '-Lap');
        lapData.push(row);
      }
      return { channels: lapCh, data: lapData };
    }

    // --- Bipolar (built-in or custom pairs) ---
    var pairs = null;
    var builtin = EEGMontageEditor.BUILTIN_MONTAGES[montageType];
    if (builtin && builtin.pairs) {
      pairs = builtin.pairs;
    } else if (this._custom.has(montageType)) {
      pairs = this._custom.get(montageType).pairs;
    }

    if (pairs) {
      var bCh = [];
      var bData = [];
      for (i = 0; i < pairs.length; i++) {
        var a = pairs[i][0];
        var b = pairs[i][1];
        if (idx[a] === undefined || idx[b] === undefined) continue;
        var nS2 = data[idx[a]].length;
        var row2 = new Array(nS2);
        for (j = 0; j < nS2; j++) { row2[j] = data[idx[a]][j] - data[idx[b]][j]; }
        bCh.push(a + '-' + b);
        bData.push(row2);
      }
      return { channels: bCh, data: bData };
    }

    // Fallback: return data unchanged
    return { channels: channels.slice(), data: data.map(function (r) { return r.slice(); }) };
  }

  // -- Persistence --------------------------------------------------------

  saveToStorage() {
    try {
      var arr = [];
      this._custom.forEach(function (v, k) {
        arr.push({ id: k, name: v.name, pairs: v.pairs });
      });
      localStorage.setItem('eeg_custom_montages', JSON.stringify(arr));
    } catch (_) { /* storage unavailable */ }
  }

  loadFromStorage() {
    try {
      var raw = localStorage.getItem('eeg_custom_montages');
      if (!raw) return;
      var arr = JSON.parse(raw);
      var self = this;
      arr.forEach(function (item) {
        self._custom.set(item.id, { name: item.name, pairs: item.pairs });
      });
    } catch (_) { /* ignore parse errors */ }
  }

  // -- Modal HTML rendering -----------------------------------------------

  /**
   * Render an HTML string for the montage editor modal dialog.
   * Callers attach this to the DOM and wire up events via data-action attributes.
   *
   * @param {EEGMontageEditor} editor
   * @returns {string}
   */
  static renderEditorModal(editor) {
    var channels = editor.availableChannels;
    var customs = editor.getCustomMontages();

    var optionsHtml = channels.map(function (c) {
      return '<option value="' + _esc(c) + '">' + _esc(c) + '</option>';
    }).join('');

    var customListHtml = customs.length === 0
      ? '<p style="color:' + STYLE.textSec + ';font-size:13px;margin:0">No custom montages yet.</p>'
      : customs.map(function (m) {
        var pairsStr = m.pairs.map(function (p) { return p[0] + '-' + p[1]; }).join(', ');
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;'
          + 'border:1px solid ' + STYLE.border + ';border-radius:' + STYLE.radius + ';margin-bottom:4px">'
          + '<div><strong style="color:' + STYLE.text + '">' + _esc(m.name) + '</strong>'
          + ' <span style="color:' + STYLE.textSec + ';font-size:12px">' + _esc(pairsStr) + '</span></div>'
          + '<button data-action="delete-montage" data-id="' + m.id + '" style="background:none;border:1px solid '
          + STYLE.danger + ';color:' + STYLE.danger + ';border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px">'
          + 'Delete</button></div>';
      }).join('');

    return ''
      + '<div class="eeg-montage-modal-overlay" style="position:fixed;inset:0;background:' + STYLE.overlay
      + ';display:flex;align-items:center;justify-content:center;z-index:10000;font-family:' + STYLE.font + '">'
      + '<div style="background:' + STYLE.bg + ';border:1px solid ' + STYLE.border + ';border-radius:' + STYLE.radius
      + ';max-width:600px;width:92%;max-height:85vh;overflow-y:auto;padding:24px;position:relative;color:' + STYLE.text + '">'
      // Close button
      + '<button data-action="close-modal" style="position:absolute;top:12px;right:12px;background:none;border:none;'
      + 'color:' + STYLE.textSec + ';font-size:20px;cursor:pointer;line-height:1" title="Close">&times;</button>'
      // Title
      + '<h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Montage Editor</h2>'
      // Existing custom montages
      + '<h3 style="font-size:14px;color:' + STYLE.textSec + ';margin:0 0 8px">Custom Montages</h3>'
      + '<div data-ref="custom-list" style="margin-bottom:20px">' + customListHtml + '</div>'
      // New montage form
      + '<h3 style="font-size:14px;color:' + STYLE.textSec + ';margin:0 0 8px">New Montage</h3>'
      + '<div style="border:1px solid ' + STYLE.border + ';border-radius:' + STYLE.radius + ';padding:12px">'
      + '<label style="font-size:13px;color:' + STYLE.textSec + '">Name</label>'
      + '<input data-ref="montage-name" type="text" placeholder="My Montage" style="display:block;width:100%;'
      + 'box-sizing:border-box;margin:4px 0 12px;padding:6px 8px;background:#161b22;border:1px solid ' + STYLE.border
      + ';border-radius:4px;color:' + STYLE.text + ';font-size:14px" />'
      // Channel selectors row
      + '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px">'
      + '<div style="flex:1"><label style="font-size:12px;color:' + STYLE.textSec + '">Source</label>'
      + '<select data-ref="src-ch" style="display:block;width:100%;padding:5px;background:#161b22;border:1px solid '
      + STYLE.border + ';border-radius:4px;color:' + STYLE.text + ';font-size:13px">' + optionsHtml + '</select></div>'
      + '<div style="flex:1"><label style="font-size:12px;color:' + STYLE.textSec + '">Reference</label>'
      + '<select data-ref="ref-ch" style="display:block;width:100%;padding:5px;background:#161b22;border:1px solid '
      + STYLE.border + ';border-radius:4px;color:' + STYLE.text + ';font-size:13px">' + optionsHtml + '</select></div>'
      + '<button data-action="add-pair" style="border:1px solid ' + STYLE.accent + ';color:' + STYLE.accent
      + ';background:none;border-radius:4px;padding:5px 12px;cursor:pointer;font-size:13px;white-space:nowrap">'
      + '+ Add Pair</button></div>'
      // Current pairs list
      + '<div data-ref="pairs-list" style="margin-bottom:12px;min-height:24px;font-size:13px;color:'
      + STYLE.textSec + '">No pairs added.</div>'
      // Action buttons
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">'
      + '<button data-action="cancel-montage" style="border:1px solid ' + STYLE.border + ';color:' + STYLE.textSec
      + ';background:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:13px">Cancel</button>'
      + '<button data-action="save-montage" style="border:1px solid ' + STYLE.accent + ';color:' + STYLE.bg
      + ';background:' + STYLE.accent + ';border-radius:4px;padding:6px 16px;cursor:pointer;font-size:13px;font-weight:600">'
      + 'Save</button></div>'
      + '</div>' // end new-montage form
      + '</div>' // end modal card
      + '</div>'; // end overlay
  }
}

// =========================================================================
// 2. EEGChannelManager
// =========================================================================

/**
 * Manages channel visibility, ordering, and signal-quality tracking.
 *
 * @param {string[]} channels - initial channel list in default order
 */
export class EEGChannelManager {
  constructor(channels) {
    /** @type {string[]} ordered channel list */
    this._order = channels ? channels.slice() : [];
    /** @type {string[]} snapshot of the original order for resetOrder() */
    this._defaultOrder = this._order.slice();
    /** @type {Set<string>} set of hidden channel names */
    this._hidden = new Set();
    /** @type {Map<string, object>} per-channel quality info */
    this._quality = new Map();
  }

  // -- Visibility ---------------------------------------------------------

  setVisible(chName, visible) {
    if (visible) { this._hidden.delete(chName); }
    else { this._hidden.add(chName); }
  }

  toggleVisible(chName) {
    if (this._hidden.has(chName)) { this._hidden.delete(chName); }
    else { this._hidden.add(chName); }
  }

  isVisible(chName) {
    return !this._hidden.has(chName);
  }

  setAllVisible(visible) {
    var self = this;
    if (visible) {
      this._hidden.clear();
    } else {
      this._order.forEach(function (ch) { self._hidden.add(ch); });
    }
  }

  getVisibleChannels() {
    var hidden = this._hidden;
    return this._order.filter(function (ch) { return !hidden.has(ch); });
  }

  getHiddenChannels() {
    var hidden = this._hidden;
    return this._order.filter(function (ch) { return hidden.has(ch); });
  }

  // -- Ordering -----------------------------------------------------------

  moveUp(chName) {
    var i = this._order.indexOf(chName);
    if (i > 0) {
      this._order[i] = this._order[i - 1];
      this._order[i - 1] = chName;
    }
  }

  moveDown(chName) {
    var i = this._order.indexOf(chName);
    if (i >= 0 && i < this._order.length - 1) {
      this._order[i] = this._order[i + 1];
      this._order[i + 1] = chName;
    }
  }

  moveToIndex(chName, index) {
    var i = this._order.indexOf(chName);
    if (i < 0) return;
    this._order.splice(i, 1);
    this._order.splice(index, 0, chName);
  }

  getOrder() {
    return this._order.slice();
  }

  resetOrder() {
    this._order = this._defaultOrder.slice();
  }

  // -- Signal quality -----------------------------------------------------

  setQuality(chName, quality) {
    this._quality.set(chName, quality);
  }

  getQuality(chName) {
    return this._quality.get(chName) || null;
  }

  /**
   * Compute signal quality metrics from raw data.
   *
   * @param {string}   chName     - channel name (for storage)
   * @param {number[]} signalData - 1-D array of samples
   * @param {number}   sfreq      - sampling frequency (Hz)
   * @returns {{rms: number, peakToPeak: number, flatPercent: number, lineNoiseRatio: number, grade: string}}
   */
  computeQuality(chName, signalData, sfreq) {
    var n = signalData.length;
    if (n === 0) {
      var empty = { rms: 0, peakToPeak: 0, flatPercent: 100, lineNoiseRatio: 0, grade: 'flat' };
      this._quality.set(chName, empty);
      return empty;
    }

    // RMS
    var sumSq = 0;
    var minVal = signalData[0];
    var maxVal = signalData[0];
    var i;
    for (i = 0; i < n; i++) {
      sumSq += signalData[i] * signalData[i];
      if (signalData[i] < minVal) minVal = signalData[i];
      if (signalData[i] > maxVal) maxVal = signalData[i];
    }
    var rms = Math.sqrt(sumSq / n);
    var peakToPeak = maxVal - minVal;

    // Flat-line detection: consecutive samples with < 0.5 uV change
    var flatCount = 0;
    for (i = 1; i < n; i++) {
      if (Math.abs(signalData[i] - signalData[i - 1]) < 0.5) { flatCount++; }
    }
    var flatPercent = n > 1 ? (flatCount / (n - 1)) * 100 : 0;

    // Simplified line-noise ratio (power at 50/60 Hz vs total)
    // Uses a basic Goertzel-like magnitude estimate for efficiency
    var lineNoiseRatio = 0;
    if (sfreq > 0 && n >= sfreq) {
      var totalPower = sumSq / n;
      var noiseFreqs = [50, 60];
      var maxNoisePower = 0;
      for (var fi = 0; fi < noiseFreqs.length; fi++) {
        var freq = noiseFreqs[fi];
        if (freq >= sfreq / 2) continue; // above Nyquist
        var omega = (2 * Math.PI * freq) / sfreq;
        var cosSum = 0;
        var sinSum = 0;
        for (i = 0; i < n; i++) {
          cosSum += signalData[i] * Math.cos(omega * i);
          sinSum += signalData[i] * Math.sin(omega * i);
        }
        var power = (cosSum * cosSum + sinSum * sinSum) / (n * n);
        if (power > maxNoisePower) maxNoisePower = power;
      }
      lineNoiseRatio = totalPower > 0 ? maxNoisePower / totalPower : 0;
    }

    // Grade
    var grade;
    if (flatPercent > 50) {
      grade = 'flat';
    } else if (rms > 200 || lineNoiseRatio > 0.5) {
      grade = 'bad';
    } else if (rms > 100 || flatPercent > 5 || lineNoiseRatio > 0.3) {
      grade = 'moderate';
    } else {
      grade = 'good';
    }

    var result = {
      rms: Math.round(rms * 100) / 100,
      peakToPeak: Math.round(peakToPeak * 100) / 100,
      flatPercent: Math.round(flatPercent * 10) / 10,
      lineNoiseRatio: Math.round(lineNoiseRatio * 1000) / 1000,
      grade: grade,
    };
    this._quality.set(chName, result);
    return result;
  }

  // -- Sidebar HTML rendering ---------------------------------------------

  /**
   * Render channel list sidebar HTML.
   *
   * @param {string[]} badChannels - array of channel names marked bad
   * @returns {string}
   */
  renderChannelList(badChannels) {
    var badSet = new Set(badChannels || []);
    var self = this;

    var rows = this._order.map(function (ch) {
      var visible = self.isVisible(ch);
      var region = REGION_MAP[ch] || 'unknown';
      var regionColor = REGION_COLORS[region] || '#666';
      var quality = self._quality.get(ch);
      var isBad = badSet.has(ch);

      // Visibility icon
      var eyeIcon = visible
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + STYLE.text
          + '" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>'
          + '<circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + STYLE.textSec
          + '" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94'
          + 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>';

      // Quality badge
      var badgeHtml = '';
      if (quality) {
        var qColor = QUALITY_COLORS[quality.grade] || '#666';
        badgeHtml = '<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:'
          + qColor + '22;color:' + qColor + ';font-weight:500">' + quality.grade + '</span>';
      }

      // Bad-channel checkbox
      var checkedAttr = isBad ? ' checked' : '';
      var badCheckbox = '<input type="checkbox" data-action="toggle-bad" data-channel="' + _esc(ch)
        + '"' + checkedAttr + ' title="Mark as bad channel" style="accent-color:' + STYLE.danger + '" />';

      var opacity = visible ? '1' : '0.45';

      return '<div data-channel="' + _esc(ch) + '" style="display:flex;align-items:center;gap:8px;'
        + 'padding:5px 8px;border-bottom:1px solid ' + STYLE.border + ';opacity:' + opacity + '">'
        + '<span data-action="toggle-vis" data-channel="' + _esc(ch)
        + '" style="cursor:pointer;display:flex;align-items:center">' + eyeIcon + '</span>'
        + '<span style="width:8px;height:8px;border-radius:50%;background:' + regionColor
        + ';flex-shrink:0" title="' + region + '"></span>'
        + '<span style="flex:1;font-size:13px;color:' + STYLE.text + ';font-family:' + STYLE.mono + '">' + _esc(ch) + '</span>'
        + badgeHtml
        + badCheckbox
        + '</div>';
    }).join('');

    return '<div style="background:' + STYLE.bg + ';border:1px solid ' + STYLE.border + ';border-radius:'
      + STYLE.radius + ';overflow:hidden;font-family:' + STYLE.font + '">'
      + '<div style="padding:8px 10px;font-size:13px;font-weight:600;color:' + STYLE.textSec
      + ';border-bottom:1px solid ' + STYLE.border + ';display:flex;justify-content:space-between;align-items:center">'
      + '<span>Channels (' + this.getVisibleChannels().length + '/' + this._order.length + ')</span>'
      + '<button data-action="toggle-all" style="background:none;border:1px solid ' + STYLE.border
      + ';color:' + STYLE.textSec + ';border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">Toggle All</button>'
      + '</div>'
      + rows
      + '</div>';
  }
}

// =========================================================================
// 3. EEGRecordingInfo
// =========================================================================

/**
 * Recording metadata display panel.
 */
export class EEGRecordingInfo {
  constructor() {
    /** @type {object|null} */
    this._meta = null;
  }

  /**
   * Set the recording metadata.
   *
   * @param {object} info
   * @param {string[]} info.channels
   * @param {number}   info.sfreq
   * @param {number}   info.duration_sec
   * @param {number}   info.n_channels
   * @param {number}   info.n_samples
   * @param {string}   [info.recordingDate]
   * @param {string}   [info.patientId]
   * @param {string}   [info.technician]
   * @param {string}   [info.equipment]
   * @param {string}   [info.fileFormat]
   */
  setMetadata(info) {
    this._meta = info;
  }

  /**
   * Format seconds into a human-friendly duration string (e.g. "2m 30s").
   * @param {number} sec
   * @returns {string}
   */
  static _formatDuration(sec) {
    if (sec < 60) return Math.round(sec) + 's';
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    if (m < 60) return m + 'm ' + (s > 0 ? s + 's' : '');
    var h = Math.floor(m / 60);
    var rm = m % 60;
    return h + 'h ' + (rm > 0 ? rm + 'm' : '');
  }

  /**
   * Render the metadata panel HTML.
   * Returns a compact, expandable panel with recording information.
   *
   * @returns {string}
   */
  renderPanel() {
    var m = this._meta;
    if (!m) {
      return '<div style="color:' + STYLE.textSec + ';font-size:13px;font-family:' + STYLE.font
        + '">No recording loaded.</div>';
    }

    var duration = EEGRecordingInfo._formatDuration(m.duration_sec || 0);
    var format = m.fileFormat || 'Unknown';

    // Value helper: monospace styled span
    var val = function (v) {
      return '<span style="font-family:' + STYLE.mono + ';color:' + STYLE.text + '">' + _esc(String(v)) + '</span>';
    };

    var sep = '<span style="color:' + STYLE.border + ';margin:0 10px">|</span>';

    // Primary row (always visible)
    var row1 = ''
      + '<span style="color:' + STYLE.textSec + '">Channels:</span> ' + val(m.n_channels || 0) + sep
      + '<span style="color:' + STYLE.textSec + '">Sample Rate:</span> ' + val((m.sfreq || 0) + ' Hz') + sep
      + '<span style="color:' + STYLE.textSec + '">Duration:</span> ' + val(duration) + sep
      + '<span style="color:' + STYLE.textSec + '">Format:</span> ' + val(format);

    // Expanded row (toggled via details/summary)
    var detailItems = [];
    if (m.recordingDate) detailItems.push('<span style="color:' + STYLE.textSec + '">Recording Date:</span> ' + val(m.recordingDate));
    if (m.patientId) detailItems.push('<span style="color:' + STYLE.textSec + '">Patient ID:</span> ' + val(m.patientId));
    if (m.technician) detailItems.push('<span style="color:' + STYLE.textSec + '">Technician:</span> ' + val(m.technician));
    if (m.equipment) detailItems.push('<span style="color:' + STYLE.textSec + '">Equipment:</span> ' + val(m.equipment));

    var expandedHtml = detailItems.length > 0
      ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid ' + STYLE.border
        + ';display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px">'
        + detailItems.join('') + '</div>'
      : '';

    return ''
      + '<details style="background:' + STYLE.bg + ';border:1px solid ' + STYLE.border + ';border-radius:'
      + STYLE.radius + ';font-family:' + STYLE.font + ';font-size:13px;padding:10px 14px">'
      + '<summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;color:'
      + STYLE.text + ';user-select:none">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="' + STYLE.textSec
      + '" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
      + '<span style="font-weight:600;font-size:13px;color:' + STYLE.accent + '">Recording Info</span>'
      + '<span style="flex:1"></span>'
      + '<span style="font-size:12px">' + row1 + '</span>'
      + '</summary>'
      + expandedHtml
      + '</details>';
  }

  /**
   * Render artifact summary badges.
   *
   * @param {{blinks: number, muscle: number, movement: number, electrode_pop: number}} artifacts
   * @returns {string}
   */
  renderArtifactSummary(artifacts) {
    if (!artifacts) return '';

    var types = [
      { key: 'blinks', label: 'Blinks', color: '#42a5f5' },
      { key: 'muscle', label: 'Muscle', color: '#ffa726' },
      { key: 'movement', label: 'Movement', color: '#ab47bc' },
      { key: 'electrode_pop', label: 'Electrode Pop', color: '#ef5350' },
    ];

    var badges = types.map(function (t) {
      var count = artifacts[t.key] || 0;
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;'
        + 'font-size:12px;font-weight:500;background:' + t.color + '18;color:' + t.color + ';border:1px solid '
        + t.color + '33">'
        + '<span style="font-family:' + STYLE.mono + '">' + count + '</span> ' + t.label
        + '</span>';
    }).join(' ');

    return '<div style="display:flex;flex-wrap:wrap;gap:8px;font-family:' + STYLE.font + '">' + badges + '</div>';
  }
}
