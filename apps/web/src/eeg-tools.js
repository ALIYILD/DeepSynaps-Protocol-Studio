/**
 * eeg-tools.js
 * ---------------------------------------------------------------------------
 * Utility classes for the DeepSynaps clinical EEG viewer.
 * Vanilla JS / ES-module.  No external dependencies.
 *
 * Exports:
 *   - EEGEventEditor      Event marker management
 *   - EEGMeasurementTool  Two-point overlay measurement
 *   - EEGExporter         CSV / PNG / clipboard export
 *   - EEGUndoManager      Undo-redo stack for annotations
 * ---------------------------------------------------------------------------
 */

/* =========================================================================
   1. EEGEventEditor — named event markers on the EEG timeline
   ========================================================================= */

var _eventIdCounter = 0;

export class EEGEventEditor {
  /** Predefined clinical event types with keyboard shortcuts. */
  static EVENT_TYPES = [
    { label: 'Eyes Open',         color: '#4caf50', shortcut: 'O' },
    { label: 'Eyes Closed',       color: '#f44336', shortcut: 'C' },
    { label: 'Photic Stim',      color: '#ff9800', shortcut: 'P' },
    { label: 'Hyperventilation',  color: '#9c27b0', shortcut: 'H' },
    { label: 'Seizure Onset',    color: '#e91e63', shortcut: 'S' },
    { label: 'Seizure End',      color: '#00bcd4', shortcut: 'E' },
    { label: 'Artifact',         color: '#795548', shortcut: 'A' },
    { label: 'Custom',           color: '#607d8b', shortcut: 'X' },
  ];

  constructor() {
    /** @type {Array<{id:number, time:number, label:string, color:string}>} */
    this._events = [];
  }

  /**
   * Add an event marker at a given time.
   * @param {number} timeSec  - position in seconds
   * @param {string} label    - display label
   * @param {string} color    - CSS colour
   * @returns {{id:number, time:number, label:string, color:string}}
   */
  addEvent(timeSec, label, color) {
    var evt = {
      id: ++_eventIdCounter,
      time: timeSec,
      label: label,
      color: color,
    };
    this._events.push(evt);
    // Keep list sorted chronologically for rendering.
    this._events.sort(function (a, b) { return a.time - b.time; });
    return evt;
  }

  /**
   * Remove an event by id.
   * @param {number} eventId
   */
  removeEvent(eventId) {
    this._events = this._events.filter(function (e) { return e.id !== eventId; });
  }

  /**
   * Patch one or more fields of an existing event.
   * @param {number} eventId
   * @param {{time?:number, label?:string, color?:string}} patch
   */
  updateEvent(eventId, patch) {
    var evt = this._events.find(function (e) { return e.id === eventId; });
    if (!evt) return;
    if (patch.time  !== undefined) evt.time  = patch.time;
    if (patch.label !== undefined) evt.label = patch.label;
    if (patch.color !== undefined) evt.color = patch.color;
    this._events.sort(function (a, b) { return a.time - b.time; });
  }

  /** @returns {Array} all events (sorted by time). */
  getEvents() {
    return this._events.slice();
  }

  /**
   * Return events whose time falls within [tStart, tEnd].
   * @param {number} tStart
   * @param {number} tEnd
   */
  getEventsInRange(tStart, tEnd) {
    return this._events.filter(function (e) {
      return e.time >= tStart && e.time <= tEnd;
    });
  }

  /* ----- HTML helpers --------------------------------------------------- */

  /**
   * Render a dropdown picker for the predefined event types.
   * @returns {string} HTML string
   */
  static renderEventPicker() {
    var html = '<select class="eeg-event-picker" style="'
      + 'background:#161b22;color:#e2e8f0;border:1px solid rgba(255,255,255,0.08);'
      + 'padding:4px 8px;border-radius:4px;font:13px system-ui;outline:none;">';
    EEGEventEditor.EVENT_TYPES.forEach(function (t) {
      html += '<option value="' + t.label + '" data-color="' + t.color
        + '" data-shortcut="' + t.shortcut + '">'
        + t.shortcut + ' — ' + t.label + '</option>';
    });
    html += '</select>';
    return html;
  }

  /**
   * Render all events as a scrollable sidebar list.
   * Each row shows: time, colour dot, label, and a delete button.
   * @returns {string} HTML string
   */
  renderEventList() {
    if (this._events.length === 0) {
      return '<div style="color:#94a3b8;font:12px system-ui;padding:8px;">No events</div>';
    }
    var html = '<div class="eeg-event-list" style="'
      + 'max-height:260px;overflow-y:auto;font:12px system-ui;color:#e2e8f0;">';
    this._events.forEach(function (evt) {
      var timeStr = evt.time.toFixed(2) + ' s';
      html += '<div data-event-id="' + evt.id + '" style="'
        + 'display:flex;align-items:center;gap:6px;padding:4px 8px;'
        + 'border-bottom:1px solid rgba(255,255,255,0.08);">'
        // colour dot
        + '<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;'
        + 'background:' + evt.color + ';"></span>'
        // time (monospace)
        + '<span style="font:11px monospace;color:#94a3b8;min-width:60px;">'
        + timeStr + '</span>'
        // label
        + '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
        + evt.label + '</span>'
        // delete button
        + '<button data-delete-event="' + evt.id + '" style="'
        + 'background:none;border:none;color:#94a3b8;cursor:pointer;'
        + 'font:14px system-ui;padding:0 2px;" title="Remove event">&times;</button>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }
}


/* =========================================================================
   2. EEGMeasurementTool — overlay measurement between two points
   ========================================================================= */

export class EEGMeasurementTool {
  constructor() {
    this._active = false;
    /** @type {{timeSec:number, amplitudeUV:number, channelName:string}|null} */
    this._p1 = null;
    /** @type {{timeSec:number, amplitudeUV:number, channelName:string}|null} */
    this._p2 = null;
  }

  /** Enable or disable measurement mode. */
  setActive(active) { this._active = !!active; }

  /** @returns {boolean} */
  isActive() { return this._active; }

  /**
   * Record one of the two measurement points.
   * @param {1|2}    pointNum
   * @param {number} timeSec
   * @param {number} amplitudeUV
   * @param {string} channelName
   */
  setPoint(pointNum, timeSec, amplitudeUV, channelName) {
    var obj = { timeSec: timeSec, amplitudeUV: amplitudeUV, channelName: channelName };
    if (pointNum === 1) this._p1 = obj;
    else                this._p2 = obj;
  }

  /** Clear both measurement points. */
  clearPoints() { this._p1 = null; this._p2 = null; }

  /**
   * Compute the measurement between the two points.
   * @returns {{deltaTime:number, deltaAmplitude:number, frequency:number,
   *            point1:Object, point2:Object}|null}
   */
  getMeasurement() {
    if (!this._p1 || !this._p2) return null;
    var dt  = Math.abs(this._p2.timeSec - this._p1.timeSec);
    var dAmp = this._p2.amplitudeUV - this._p1.amplitudeUV;
    var freq = dt > 0 ? 1 / dt : Infinity;
    return {
      deltaTime: dt,
      deltaAmplitude: dAmp,
      frequency: freq,
      point1: Object.assign({}, this._p1),
      point2: Object.assign({}, this._p2),
    };
  }

  /* ----- Canvas overlay ------------------------------------------------- */

  /**
   * Draw the measurement overlay onto a 2-D canvas context.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   * @param {number} opts.labelWidth   - x-offset for signal area
   * @param {number} opts.signalW      - pixel width of signal area
   * @param {number} opts.signalTop    - y-offset for first channel
   * @param {number} opts.signalH      - total pixel height of signal area
   * @param {number} opts.tStart       - left-edge time (seconds)
   * @param {number} opts.windowSec    - visible time span
   * @param {number} opts.sensitivity  - µV per division
   * @param {number} opts.channelHeight - pixel height per channel
   * @param {string[]} opts.channels   - ordered channel names
   */
  drawOverlay(ctx, opts) {
    if (!this._p1 && !this._p2) return;

    var MARKER_COLOR = '#00d4bc';
    var LINE_COLOR   = 'rgba(0,212,188,0.5)';
    var BOX_BG       = 'rgba(0,0,0,0.85)';
    var BOX_BORDER   = 'rgba(0,212,188,0.4)';
    var TEXT_COLOR    = '#e2e8f0';

    /** Map a point to canvas pixel coordinates. */
    var toPixel = function (pt) {
      var xFrac = (pt.timeSec - opts.tStart) / opts.windowSec;
      var px    = opts.labelWidth + xFrac * opts.signalW;
      var chIdx = opts.channels.indexOf(pt.channelName);
      if (chIdx === -1) chIdx = 0;
      var chCenter = opts.signalTop + (chIdx + 0.5) * opts.channelHeight;
      var py = chCenter - (pt.amplitudeUV / opts.sensitivity) * (opts.channelHeight * 0.4);
      return { x: px, y: py };
    };

    /** Draw a small crosshair marker with a label. */
    var drawMarker = function (px, py, label) {
      var r = 5;
      ctx.strokeStyle = MARKER_COLOR;
      ctx.lineWidth   = 1.5;
      // Circle
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      // Crosshair lines
      ctx.beginPath();
      ctx.moveTo(px - r - 3, py); ctx.lineTo(px + r + 3, py);
      ctx.moveTo(px, py - r - 3); ctx.lineTo(px, py + r + 3);
      ctx.stroke();
      // Label
      ctx.font      = 'bold 10px system-ui';
      ctx.fillStyle = MARKER_COLOR;
      ctx.fillText(label, px + r + 4, py - r);
    };

    // --- Draw P1 ---
    if (this._p1) {
      var px1 = toPixel(this._p1);
      drawMarker(px1.x, px1.y, 'P1');
    }

    // --- Draw P2 ---
    if (this._p2) {
      var px2 = toPixel(this._p2);
      drawMarker(px2.x, px2.y, 'P2');
    }

    // --- Connecting dashed line + info box (only when both points exist) ---
    if (this._p1 && this._p2) {
      var a = toPixel(this._p1);
      var b = toPixel(this._p2);

      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Measurement values
      var m = this.getMeasurement();
      if (m) {
        var lines = [
          '\u0394t  = ' + m.deltaTime.toFixed(3) + ' s',
          '\u0394amp = ' + m.deltaAmplitude.toFixed(1) + ' \u00B5V',
          'freq = ' + (isFinite(m.frequency) ? m.frequency.toFixed(2) : '\u221E') + ' Hz',
        ];

        // Position box at midpoint of the two markers
        var bx = (a.x + b.x) / 2 + 12;
        var by = (a.y + b.y) / 2 - 30;

        ctx.font = '11px monospace';
        var boxW = 140;
        var boxH = lines.length * 16 + 12;

        // Clamp to canvas
        if (bx + boxW > ctx.canvas.width - 4)  bx = ctx.canvas.width - boxW - 4;
        if (by + boxH > ctx.canvas.height - 4) by = ctx.canvas.height - boxH - 4;
        if (by < 4) by = 4;

        // Box background
        ctx.fillStyle   = BOX_BG;
        ctx.strokeStyle = BOX_BORDER;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        // Text lines
        ctx.fillStyle = TEXT_COLOR;
        for (var i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], bx + 8, by + 16 + i * 16);
        }
      }
    }
  }
}


/* =========================================================================
   3. EEGExporter — CSV, PNG, and clipboard export
   ========================================================================= */

export class EEGExporter {
  /**
   * Export signal data as a CSV file and trigger download.
   *
   * @param {string[]} channels - channel names
   * @param {Float32Array[]|number[][]} data - per-channel sample arrays
   * @param {number} sfreq     - sampling frequency (Hz)
   * @param {number} tStart    - start time of the exported window (seconds)
   * @param {string} filename  - suggested file name
   */
  static exportCSV(channels, data, sfreq, tStart, filename) {
    var rows = [];
    // Header
    rows.push('Time,' + channels.join(','));

    var nSamples = data[0] ? data[0].length : 0;
    for (var i = 0; i < nSamples; i++) {
      var t = (tStart + i / sfreq).toFixed(6);
      var vals = [];
      for (var ch = 0; ch < channels.length; ch++) {
        vals.push(data[ch] ? data[ch][i].toFixed(4) : '0');
      }
      rows.push(t + ',' + vals.join(','));
    }

    var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    EEGExporter._download(blob, filename || 'eeg_export.csv');
  }

  /**
   * Export a canvas element as a PNG image.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {string} filename
   */
  static exportPNG(canvas, filename) {
    canvas.toBlob(function (blob) {
      if (blob) {
        EEGExporter._download(blob, filename || 'eeg_snapshot.png');
      }
    }, 'image/png');
  }

  /**
   * Copy a plain-text summary of the current viewer state to the clipboard.
   *
   * @param {Object} state
   * @param {string}   state.montage
   * @param {number}   state.sensitivity
   * @param {number}   state.timebase
   * @param {string[]} state.badChannels
   * @param {Array}    state.badSegments
   * @param {Object}   state.filters  - {lowCut, highCut, notch}
   */
  static exportSummary(state) {
    var lines = [
      '=== EEG Viewer Summary ===',
      'Montage:      ' + (state.montage      || 'N/A'),
      'Sensitivity:  ' + (state.sensitivity   || 'N/A') + ' \u00B5V/div',
      'Timebase:     ' + (state.timebase      || 'N/A') + ' s/page',
      'Bad channels: ' + (state.badChannels && state.badChannels.length
                          ? state.badChannels.join(', ') : 'none'),
      'Bad segments: ' + (state.badSegments && state.badSegments.length
                          ? state.badSegments.length + ' segment(s)' : 'none'),
    ];

    if (state.filters) {
      lines.push(
        'Filters:      '
        + 'LP ' + (state.filters.highCut || '-') + ' Hz | '
        + 'HP ' + (state.filters.lowCut  || '-') + ' Hz | '
        + 'Notch ' + (state.filters.notch || 'off') + ' Hz'
      );
    }

    var text = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
    return text;
  }

  /**
   * Trigger a browser file download from a Blob.
   * @param {Blob}   blob
   * @param {string} filename
   */
  static _download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up after a short delay so the browser can finish the download.
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }
}


/* =========================================================================
   4. EEGUndoManager — undo / redo stack for annotation operations
   ========================================================================= */

/** Recognised action types (informational, not enforced at runtime). */
var UNDO_ACTION_TYPES = [
  'add_bad_channel',
  'remove_bad_channel',
  'add_bad_segment',
  'remove_bad_segment',
  'add_event',
  'remove_event',
  'toggle_ica',
];

export class EEGUndoManager {
  /**
   * @param {number} [maxHistory=50] - maximum undo depth
   */
  constructor(maxHistory) {
    this._max  = maxHistory || 50;
    /** @type {Array<{type:string, data:any, undo:Function, redo:Function}>} */
    this._past   = [];
    /** @type {Array<{type:string, data:any, undo:Function, redo:Function}>} */
    this._future = [];
  }

  /**
   * Push a new action onto the undo stack.
   * Clears the redo stack (future actions are no longer reachable).
   *
   * @param {{type:string, data:any, undo:Function, redo:Function}} action
   */
  push(action) {
    this._past.push(action);
    // Enforce the depth limit.
    if (this._past.length > this._max) {
      this._past.shift();
    }
    // Any new action invalidates the redo branch.
    this._future = [];
  }

  /**
   * Undo the most recent action.
   * @returns {Object|null} the undone action, or null if nothing to undo
   */
  undo() {
    if (this._past.length === 0) return null;
    var action = this._past.pop();
    if (typeof action.undo === 'function') action.undo();
    this._future.push(action);
    return action;
  }

  /**
   * Redo the most recently undone action.
   * @returns {Object|null} the redone action, or null if nothing to redo
   */
  redo() {
    if (this._future.length === 0) return null;
    var action = this._future.pop();
    if (typeof action.redo === 'function') action.redo();
    this._past.push(action);
    return action;
  }

  /** @returns {boolean} */
  canUndo() { return this._past.length > 0; }

  /** @returns {boolean} */
  canRedo() { return this._future.length > 0; }

  /** Clear both undo and redo stacks. */
  clear() {
    this._past   = [];
    this._future = [];
  }

  /**
   * Return a lightweight history for debugging.
   * @returns {Array<{type:string, data:any}>}
   */
  getHistory() {
    return this._past.map(function (a) {
      return { type: a.type, data: a.data };
    });
  }
}
