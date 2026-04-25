// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis.js — MRI Analyzer (Clinical Portal)
//
// Mirrors the structure of pages-qeeg-analysis.js.  The page renders a
// 2-column layout (per portal_integration/DASHBOARD_PAGE_SPEC.md §Page layout):
//
//   Left column:  Session uploader, patient meta form, condition selector,
//                 pipeline progress pills.
//   Right column: Stim-target cards, 3-plane slice viewer placeholder,
//                 glass-brain summary, MedRAG literature panel.
//
// Demo mode auto-loads DEMO_MRI_REPORT (a verbatim copy of
// packages/mri-pipeline/demo/sample_mri_report.json) so reviewers on the
// Netlify preview (VITE_ENABLE_DEMO=1) see the full populated report without
// the Fly API being online.
// ─────────────────────────────────────────────────────────────────────────────
import { api, downloadBlob } from './api.js';
import { emptyState, showToast } from './helpers.js';
// Cornerstone3D viewer is loaded dynamically — the @cornerstonejs/* packages
// are optional and may not be installed.  When absent the build still succeeds
// and the MRI page falls back to the NiiVue viewer.
let _cs3dModule = null;
async function _loadCornerstoneMPR() {
  if (_cs3dModule) return _cs3dModule.mountCornerstoneMPR;
  try {
    _cs3dModule = await import('./mri-viewer-cs3d.js');
    return _cs3dModule.mountCornerstoneMPR;
  } catch { return null; }
}

const FUSION_API_BASE = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const FUSION_TOKEN_KEY = 'ds_access_token';

// ── Module state ────────────────────────────────────────────────────────────
var _mriAnalysisId = null;
var _uploadId      = null;
var _jobId         = null;
var _report        = null;
var _patientMeta   = null;
var _medragCache   = null;
var _jobStatus     = null;       // { stage, state } snapshot
var _jobPollTimer  = null;
var _jobWatchAbort = null;       // AbortController for SSE-over-fetch
var _jobError      = null;
var _selectedCondition = 'mdd';
var _fusionSummary = null;
// Populated by pgMRIAnalysis() and re-read by the compare modal's submit
// handler so we don't refetch on every click.
var _patientAnalysesCache = { patientId: null, rows: [] };

// ── Brain Atlas Viewer state ────────────────────────────────────────────────
var _customTargets = [];
var _atlasLabelsVisible = true;
var _atlasEfieldVisible = true;
var _atlasAnimFrame = null;

// ── Modality color map (shared by glass-brain + atlas viewer) ───────────────
// MRI-based stimulation only: TPS, tFUS (techniques requiring MRI-guided targeting)
var MODALITY_DOT_COLOR = {
  tps: '#c026d3', tfus: '#06b6d4', custom: '#94a3b8',
};
var PERSONALISED_DOT_COLOR = '#f43f5e';

// ── MNI ↔ Pixel coordinate mapping ─────────────────────────────────────────
// MNI space: x[-90,90], y[-126,90], z[-72,108]
// Template cut planes: axial z=30, coronal y=30, sagittal x=0
var _ATLAS_CUT = { axial: 30, coronal: 30, sagittal: 0 };
var _ATLAS_SLAB = 40; // mm — targets within this distance of cut plane are shown

function mniToPixel(mni_xyz, plane, cw, ch) {
  var x = Number(mni_xyz[0]), y = Number(mni_xyz[1]), z = Number(mni_xyz[2]);
  if (plane === 'axial')    return { x: ((x + 90) / 180) * cw, y: ((90 - y) / 216) * ch };
  if (plane === 'coronal')  return { x: ((x + 90) / 180) * cw, y: ((108 - z) / 180) * ch };
  if (plane === 'sagittal') return { x: ((y + 126) / 216) * cw, y: ((108 - z) / 180) * ch };
  return { x: cw / 2, y: ch / 2 };
}

function pixelToMni(px, py, plane, cw, ch) {
  if (plane === 'axial')    return [ Math.round((px / cw) * 180 - 90), Math.round(90 - (py / ch) * 216), _ATLAS_CUT.axial ];
  if (plane === 'coronal')  return [ Math.round((px / cw) * 180 - 90), _ATLAS_CUT.coronal, Math.round(108 - (py / ch) * 180) ];
  if (plane === 'sagittal') return [ _ATLAS_CUT.sagittal, Math.round((px / cw) * 216 - 126), Math.round(108 - (py / ch) * 180) ];
  return [0, 0, 0];
}

function _targetVisibleOnPlane(mni_xyz, plane) {
  var val;
  if (plane === 'axial')    val = Math.abs(Number(mni_xyz[2]) - _ATLAS_CUT.axial);
  else if (plane === 'coronal')  val = Math.abs(Number(mni_xyz[1]) - _ATLAS_CUT.coronal);
  else if (plane === 'sagittal') val = Math.abs(Number(mni_xyz[0]) - _ATLAS_CUT.sagittal);
  else return false;
  return val <= _ATLAS_SLAB;
}

function _targetDotColor(target) {
  if (String(target.method || '').endsWith('_personalised')) return PERSONALISED_DOT_COLOR;
  if (target.is_custom) return MODALITY_DOT_COLOR.custom;
  return MODALITY_DOT_COLOR[String(target.modality || '').toLowerCase()] || '#60a5fa';
}

// ── E-field heatmap helpers ─────────────────────────────────────────────────
var _EFIELD_DEFAULT_SIGMA_MM = 15;
var _EFIELD_MAX_ALPHA = 0.7;

function _efieldHexToRgb(hex) {
  var n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _pixelsPerMm(plane, cw, ch) {
  // MNI ranges per plane axis:
  // axial:    x=180mm (cw), y=216mm (ch)
  // coronal:  x=180mm (cw), y=180mm (ch, z-range [-72,108])
  // sagittal: x=216mm (cw, y-range [-126,90]), y=180mm (ch, z-range)
  if (plane === 'axial')    return (cw / 180 + ch / 216) / 2;
  if (plane === 'coronal')  return (cw / 180 + ch / 180) / 2;
  if (plane === 'sagittal') return (cw / 216 + ch / 180) / 2;
  return cw / 180;
}

function _computeTargetSigmaPx(target, pxPerMm) {
  var sigmaMm = _EFIELD_DEFAULT_SIGMA_MM;
  if (target.efield_dose && target.efield_dose.focality_50pct_volume_cm3 > 0) {
    // Approximate sphere radius from volume: V = 4/3 pi r^3 => r = cbrt(3V / 4pi)
    // Volume is in cm^3, convert radius to mm (*10)
    var vol = target.efield_dose.focality_50pct_volume_cm3;
    sigmaMm = Math.cbrt(3 * vol / (4 * Math.PI)) * 10;
  }
  return sigmaMm * pxPerMm;
}

function _efieldOutOfPlaneDistance(mni_xyz, plane) {
  if (plane === 'axial')    return Math.abs(Number(mni_xyz[2]) - _ATLAS_CUT.axial);
  if (plane === 'coronal')  return Math.abs(Number(mni_xyz[1]) - _ATLAS_CUT.coronal);
  if (plane === 'sagittal') return Math.abs(Number(mni_xyz[0]) - _ATLAS_CUT.sagittal);
  return _ATLAS_SLAB;
}

// ── Feature flag ────────────────────────────────────────────────────────────
function _mriFeatureFlagEnabled() {
  try {
    var v = (typeof window !== 'undefined' && window)
      ? window.DEEPSYNAPS_ENABLE_MRI_ANALYZER
      : (typeof globalThis !== 'undefined' ? globalThis.DEEPSYNAPS_ENABLE_MRI_ANALYZER : undefined);
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  } catch (_) { return true; }
}

// ── Demo mode ───────────────────────────────────────────────────────────────
function _isDemoMode() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) { return false; }
}

// ── XSS helper ──────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Small shared helpers ────────────────────────────────────────────────────
function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:24px;color:var(--text-secondary)">'
    + '<span class="spinner"></span>' + esc(msg || 'Loading...') + '</div>';
}

function card(title, body, extra) {
  return '<div class="ds-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

function _renderMRIAnnotationList(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="analysis-anno-empty">No notes pinned to this scan yet.</div>';
  }
  return items.map(function (item) {
    return '<div class="analysis-anno-item">'
      + (item.title ? '<div class="analysis-anno-item__title">' + esc(item.title) + '</div>' : '')
      + (item.anchor_label ? '<div class="analysis-anno-item__anchor">' + esc(item.anchor_label) + '</div>' : '')
      + '<div class="analysis-anno-item__body">' + esc(item.body || '') + '</div>'
      + '<div class="analysis-anno-item__meta">' + esc(item.created_at ? new Date(item.created_at).toLocaleString() : '') + '</div>'
      + '<button class="analysis-anno-item__delete" data-mri-annotation-delete="' + esc(item.id) + '">Delete</button>'
      + '</div>';
  }).join('');
}

function _mriAnnotationButton(context) {
  if (!context || !context.patient_id || !context.target_id) return '';
  var payload = JSON.stringify(context).replace(/"/g, '&quot;');
  return '<button class="btn btn-sm btn-outline analysis-anno-launch" data-mri-annotation="' + payload + '">Notes</button>';
}

async function _openMRIAnnotationDrawer(context) {
  if (!context || !context.patient_id || !context.target_id) return;
  var host = document.getElementById('mri-annotation-drawer-host');
  if (!host) return;
  host.innerHTML = '<div class="analysis-anno-backdrop" data-mri-annotation-close="1"></div>'
    + '<aside class="analysis-anno-drawer">'
    + '<div class="analysis-anno-drawer__hd"><div><strong>Scan notes</strong><div class="analysis-anno-drawer__sub">'
    + esc(context.anchor_label || 'MRI analysis') + '</div></div><button class="analysis-anno-drawer__close" data-mri-annotation-close="1">Close</button></div>'
    + '<div id="mri-annotation-list" class="analysis-anno-list">' + spinner('Loading notes...') + '</div>'
    + '<div class="analysis-anno-form">'
    + '<input id="mri-annotation-title" class="form-control" maxlength="160" placeholder="Short title (optional)"/>'
    + '<textarea id="mri-annotation-body" class="form-control" rows="4" maxlength="5000" placeholder="Add a note for this scan"></textarea>'
    + '<input id="mri-annotation-anchor" class="form-control" maxlength="120" placeholder="Anchor label (optional)" value="' + esc(context.anchor_label || '') + '"/>'
    + '<div style="display:flex;justify-content:flex-end"><button class="btn btn-sm btn-primary" id="mri-annotation-save">Save note</button></div>'
    + '</div></aside>';
  host.classList.add('analysis-anno-host--open');
  var listEl = document.getElementById('mri-annotation-list');
  try {
    var rows = await api.listAnnotations({ patientId: context.patient_id, targetType: 'mri', targetId: context.target_id });
    if (listEl) listEl.innerHTML = _renderMRIAnnotationList(rows);
  } catch (err) {
    if (listEl) listEl.innerHTML = '<div class="analysis-anno-empty">Could not load notes: ' + esc(err.message || err) + '</div>';
  }
  host.querySelectorAll('[data-mri-annotation-close="1"]').forEach(function (node) {
    node.addEventListener('click', function () {
      host.classList.remove('analysis-anno-host--open');
      host.innerHTML = '';
    });
  });
  host.querySelectorAll('[data-mri-annotation-delete]').forEach(function (node) {
    node.addEventListener('click', async function () {
      var id = node.getAttribute('data-mri-annotation-delete');
      if (!id) return;
      try {
        await api.deleteAnnotation(id);
        showToast('Note deleted', 'success');
        _openMRIAnnotationDrawer(context);
      } catch (err) {
        showToast('Could not delete note: ' + (err.message || err), 'error');
      }
    });
  });
  var saveBtn = document.getElementById('mri-annotation-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      var bodyEl = document.getElementById('mri-annotation-body');
      var titleEl = document.getElementById('mri-annotation-title');
      var anchorEl = document.getElementById('mri-annotation-anchor');
      var body = bodyEl && bodyEl.value ? bodyEl.value.trim() : '';
      if (!body) {
        showToast('Add some note text first', 'warning');
        return;
      }
      saveBtn.disabled = true;
      try {
        await api.createAnnotation({
          patient_id: context.patient_id,
          target_type: 'mri',
          target_id: context.target_id,
          title: titleEl && titleEl.value ? titleEl.value.trim() : null,
          body: body,
          anchor_label: anchorEl && anchorEl.value ? anchorEl.value.trim() : null,
          anchor_data: { analysis_id: context.target_id },
        });
        showToast('Note saved', 'success');
        _openMRIAnnotationDrawer(context);
      } catch (err) {
        showToast('Could not save note: ' + (err.message || err), 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
}

function _bindMRIAnnotationButtons() {
  document.querySelectorAll('[data-mri-annotation]').forEach(function (btn) {
    if (btn.dataset.annotationBound === '1') return;
    btn.dataset.annotationBound = '1';
    btn.addEventListener('click', function () {
      try {
        var ctx = JSON.parse(btn.getAttribute('data-mri-annotation') || '{}');
        _openMRIAnnotationDrawer(ctx);
      } catch (_err) {
        showToast('Could not open notes', 'error');
      }
    });
  });
}

function _getFusionToken() {
  try {
    return globalThis.localStorage?.getItem?.(FUSION_TOKEN_KEY) || null;
  } catch (_) {
    return null;
  }
}
function _demoFusionSummary(patientId) {
  return {
    patient_id: patientId || 'demo-patient',
    qeeg_analysis_id: null,
    mri_analysis_id: DEMO_MRI_REPORT.analysis_id,
    recommendations: ['MRI targeting is available. Add qEEG biomarkers to create a higher-confidence dual-modality plan.'],
    summary: 'Partial fusion available from one modality only. Add qEEG data to strengthen target confidence.',
    confidence: 0.4,
    generated_at: new Date().toISOString(),
  };
}

async function _fetchFusionSummary(patientId) {
  if (!patientId) return null;
  if (_isDemoMode()) return _demoFusionSummary(patientId);
  try {
    return await api.getFusionRecommendation(patientId);
  } catch (_) {
    return null;
  }
}

export function renderFusionSummaryCard(fusion, patientId) {
  if (!patientId && !fusion) {
    return card('Fusion summary',
      '<div style="color:var(--text-secondary);font-size:13px">Run or load an MRI analysis to assemble a fusion summary.</div>');
  }
  if (!fusion) {
    return card('Fusion summary',
      '<div style="color:var(--text-secondary);font-size:13px">Fusion summary unavailable right now. Existing MRI targeting remains available.</div>');
  }
  var recs = Array.isArray(fusion.recommendations) ? fusion.recommendations : [];
  var tags = [];
  if (fusion.qeeg_analysis_id) tags.push('qEEG ready');
  if (fusion.mri_analysis_id) tags.push('MRI ready');
  if (fusion.confidence != null) tags.push('confidence ' + Math.round(Number(fusion.confidence || 0) * 100) + '%');
  return card('Fusion summary',
    '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">' + esc(fusion.summary || '') + '</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + tags.map(function (item) {
      return '<span class="ds-mri-mod-pill">' + esc(item) + '</span>';
    }).join('') + '</div>'
    + (recs.length
      ? '<ul style="margin:10px 0 0 18px;padding:0;color:var(--text-secondary);font-size:12.5px;line-height:1.5">'
        + recs.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('')
        + '</ul>'
      : '')
  );
}

var _niivueLoaderPromise = null;

function _getApiBase() {
  return (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
}

function _viewerVolumeCandidates(report, payload) {
  if (payload && payload.base_volume && payload.base_volume.url) {
    var out = [];
    var base = { url: payload.base_volume.url };
    if (payload.base_volume.colormap) base.colormap = payload.base_volume.colormap;
    if (payload.base_volume.opacity != null) base.opacity = payload.base_volume.opacity;
    if (payload.base_volume.cal_min != null) base.cal_min = payload.base_volume.cal_min;
    if (payload.base_volume.cal_max != null) base.cal_max = payload.base_volume.cal_max;
    out.push(base);
    (payload.overlays || []).forEach(function (overlay) {
      if (!overlay || !overlay.url) return;
      out.push({
        url: overlay.url,
        colormap: overlay.colormap,
        opacity: overlay.opacity,
        cal_min: overlay.cal_min,
        cal_max: overlay.cal_max,
      });
    });
    return out;
  }
  if (!report) return [];
  var candidates = [];
  function push(label, url) {
    if (!url || typeof url !== 'string') return;
    candidates.push({ name: label, url: url });
  }
  push('T1', report._t1_mni_path);
  if (report.diffusion) {
    push('FA', report.diffusion.fa_map_s3);
    push('MD', report.diffusion.md_map_s3);
  }
  return candidates;
}

function _renderViewerFallback(el, opts, reason) {
  if (!el) return false;
  var firstTarget = opts && opts.targets && opts.targets[0] ? opts.targets[0] : null;
  var coords = firstTarget && Array.isArray(firstTarget.mni_xyz) ? firstTarget.mni_xyz.join(', ') : 'n/a';
  el.innerHTML =
    '<div class="ds-mri-progressive-viewer__fallback">'
    + '<div class="ds-mri-progressive-viewer__badge">Viewer fallback</div>'
    + '<div class="ds-mri-progressive-viewer__title">' + esc(firstTarget && firstTarget.region_name || 'MRI target preview') + '</div>'
    + '<div class="ds-mri-progressive-viewer__meta">MNI ' + esc(coords) + '</div>'
    + '<p>' + esc(reason || 'Interactive viewer assets are not staged for this analysis.') + '</p>'
    + '</div>';
  return false;
}

function _renderOverlayIframe(el, opts) {
  if (!el || !opts || !opts.analysisId || !opts.targetId) return false;
  var src = _getApiBase() + '/api/v1/mri/overlay/' + encodeURIComponent(opts.analysisId) + '/' + encodeURIComponent(opts.targetId);
  el.innerHTML =
    '<iframe class="ds-mri-progressive-viewer__iframe" src="' + esc(src) + '" title="MRI overlay viewer"></iframe>';
  return true;
}

function _loadNiiVueScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('window unavailable'));
  if (window.niivue && window.niivue.Niivue) return Promise.resolve(window.niivue);
  if (_niivueLoaderPromise) return _niivueLoaderPromise;
  _niivueLoaderPromise = new Promise(function (resolve, reject) {
    var prior = document.querySelector('script[data-niivue-loader="1"]');
    if (prior) {
      prior.addEventListener('load', function () { resolve(window.niivue); }, { once: true });
      prior.addEventListener('error', function () { reject(new Error('NiiVue failed to load')); }, { once: true });
      return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/niivue@0.64.0/dist/niivue.umd.js';
    script.async = true;
    script.dataset.niivueLoader = '1';
    script.onload = function () {
      if (window.niivue && window.niivue.Niivue) resolve(window.niivue);
      else reject(new Error('NiiVue global missing'));
    };
    script.onerror = function () { reject(new Error('NiiVue failed to load')); };
    document.head.appendChild(script);
  }).catch(function (err) {
    _niivueLoaderPromise = null;
    throw err;
  });
  return _niivueLoaderPromise;
}

export async function mountNiiVue(el, opts) {
  if (!el) return false;
  var payload = null;
  try {
    if (opts && opts.analysisId && api.getMRIViewerPayload) {
      payload = await api.getMRIViewerPayload(opts.analysisId);
    }
  } catch (_payloadErr) {
    payload = null;
  }
  var volumes = _viewerVolumeCandidates(opts && opts.report, payload);
  if (!volumes.length) {
    return _renderOverlayIframe(el, opts) || _renderViewerFallback(el, opts, 'No staged NIfTI volumes were found for this analysis.');
  }
  try {
    var niivueLib = await _loadNiiVueScript();
    var canvas = document.createElement('canvas');
    canvas.className = 'ds-mri-progressive-viewer__canvas';
    el.innerHTML = '';
    el.appendChild(canvas);
    var nv = new niivueLib.Niivue({ show3Dcrosshair: true, backColor: [0.03, 0.07, 0.12, 1] });
    if (typeof nv.attachToCanvas === 'function') nv.attachToCanvas(canvas);
    if (typeof nv.setSliceType === 'function') nv.setSliceType(nv.sliceTypeMultiplanar || 4);
    await nv.loadVolumes(volumes);
    if (payload && payload.initial_view === 'render' && typeof nv.setSliceType === 'function') {
      nv.setSliceType(nv.sliceTypeRender || nv.sliceTypeMultiplanar || 4);
    }
    if (payload && Array.isArray(payload.meshes) && payload.meshes.length && typeof nv.loadMeshes === 'function') {
      try { await nv.loadMeshes(payload.meshes); } catch (_meshErr) {}
    }
    if (payload && Array.isArray(payload.points) && payload.points.length) {
      payload.points.forEach(function (point) {
        if (typeof nv.addPoint === 'function') {
          try {
            nv.addPoint({
              x: point.x,
              y: point.y,
              z: point.z,
              label: point.label,
              color: point.rgba,
              radius: point.radius_mm,
            });
          } catch (_pointErr) {}
        }
      });
    }
    return true;
  } catch (_err) {
    return _renderOverlayIframe(el, opts) || _renderViewerFallback(el, opts, 'The viewer library was unavailable, so the target overlay was loaded instead.');
  }
}

async function mountBestMRIViewer(host, opts) {
  // Prefer Cornerstone3D MPR (tools + clinical-grade interaction),
  // fall back to NiiVue, then iframe overlay.
  try {
    var payload = null;
    if (opts && opts.analysisId && api.getMRIViewerPayload) {
      try { payload = await api.getMRIViewerPayload(opts.analysisId); } catch (_) { payload = null; }
    }
    var vols = _viewerVolumeCandidates(opts && opts.report, payload);
    var baseUrl = (vols && vols[0] && vols[0].url) ? vols[0].url : null;
    if (baseUrl) {
      var mountCornerstoneMPR = await _loadCornerstoneMPR();
      if (mountCornerstoneMPR) {
        var ok = await mountCornerstoneMPR(host, {
          analysisId: opts.analysisId,
          baseVolumeUrl: baseUrl,
        });
        if (ok) return true;
      }
    }
  } catch (_) {}
  return mountNiiVue(host, opts);
}

function _mountBrainAtlasViewer(report) {
  var planes = ['axial', 'coronal', 'sagittal'];
  var canvases = {};
  var images = {};
  var loaded = 0;

  planes.forEach(function (plane) {
    canvases[plane] = document.getElementById('ds-atlas-canvas-' + plane);
    images[plane] = document.getElementById('ds-atlas-img-' + plane);
  });

  // Wait for all images to load before sizing canvases
  function onAllLoaded() {
    _drawAtlasTargets(report, canvases, images);
    _wireAtlasClickHandlers(report, canvases, images);
    // Resize observer
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        _drawAtlasTargets(report, canvases, images);
      }, 150);
    });
  }

  planes.forEach(function (plane) {
    var img = images[plane];
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      loaded++;
      if (loaded === 3) onAllLoaded();
    } else {
      img.addEventListener('load', function () {
        loaded++;
        if (loaded === 3) onAllLoaded();
      });
      img.addEventListener('error', function () {
        loaded++;
        if (loaded === 3) onAllLoaded();
      });
    }
  });
}

// ── E-field Gaussian heatmap renderer ───────────────────────────────────────
function _drawEfieldHeatmap(ctx, plane, cw, ch, targets) {
  // Filter to targets visible on this plane
  var visible = [];
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (!Array.isArray(t.mni_xyz) || t.mni_xyz.length < 3) continue;
    if (!_targetVisibleOnPlane(t.mni_xyz, plane)) continue;
    visible.push(t);
  }
  if (!visible.length) return;

  // Half-resolution for performance (Gaussian blur hides 2x upscale)
  var hw = Math.ceil(cw / 2);
  var hh = Math.ceil(ch / 2);
  if (hw < 4 || hh < 4) return;

  var tmpCanvas;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      tmpCanvas = new OffscreenCanvas(hw, hh);
    } else {
      tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = hw;
      tmpCanvas.height = hh;
    }
  } catch (_) { return; }

  var tmpCtx = tmpCanvas.getContext('2d');
  if (!tmpCtx) return;
  var imgData = tmpCtx.createImageData(hw, hh);
  var data = imgData.data;

  var pxPerMm = _pixelsPerMm(plane, cw, ch);
  var halfPxPerMm = pxPerMm / 2; // for half-res coordinates

  // Precompute per-target data
  var tData = [];
  for (var ti = 0; ti < visible.length; ti++) {
    var tgt = visible[ti];
    var p = mniToPixel(tgt.mni_xyz, plane, cw, ch);
    var col = _targetDotColor(tgt);
    var rgb = _efieldHexToRgb(col);
    var sigmaPx = _computeTargetSigmaPx(tgt, halfPxPerMm);
    var sigma2x2 = 2 * sigmaPx * sigmaPx;
    var maxR2 = (3 * sigmaPx) * (3 * sigmaPx); // 3-sigma cutoff

    // Peak alpha from efield_dose or default
    var peakAlpha = 0.55;
    if (tgt.efield_dose && tgt.efield_dose.v_per_m_at_target > 0 && tgt.efield_dose.peak_v_per_m > 0) {
      peakAlpha = Math.min(_EFIELD_MAX_ALPHA, Math.max(0.3, tgt.efield_dose.v_per_m_at_target / tgt.efield_dose.peak_v_per_m));
    }
    // Custom targets get lower alpha
    if (tgt.is_custom) peakAlpha = 0.35;

    // Out-of-plane attenuation: closer to slice = brighter
    var ood = _efieldOutOfPlaneDistance(tgt.mni_xyz, plane);
    var planeAtten = 1 - (ood / _ATLAS_SLAB);
    if (planeAtten < 0.1) planeAtten = 0.1;
    peakAlpha *= planeAtten;

    tData.push({
      cx: p.x / 2, // half-res center
      cy: p.y / 2,
      rgb: rgb,
      sigma2x2: sigma2x2,
      maxR2: maxR2,
      peakAlpha: peakAlpha,
    });
  }

  // Per-pixel Gaussian sum
  for (var py = 0; py < hh; py++) {
    for (var px = 0; px < hw; px++) {
      var rAcc = 0, gAcc = 0, bAcc = 0, aMax = 0;

      for (var k = 0; k < tData.length; k++) {
        var td = tData[k];
        var dx = px - td.cx;
        var dy = py - td.cy;
        var dist2 = dx * dx + dy * dy;
        if (dist2 > td.maxR2) continue;

        var g = Math.exp(-dist2 / td.sigma2x2);
        var alpha = g * td.peakAlpha;

        rAcc += td.rgb[0] * alpha;
        gAcc += td.rgb[1] * alpha;
        bAcc += td.rgb[2] * alpha;
        if (alpha > aMax) aMax = alpha;
      }

      if (aMax > 0.005) {
        var idx = (py * hw + px) * 4;
        // Premultiplied -> straight alpha conversion
        var invA = 1 / aMax;
        data[idx]     = Math.min(255, Math.round(rAcc * invA));
        data[idx + 1] = Math.min(255, Math.round(gAcc * invA));
        data[idx + 2] = Math.min(255, Math.round(bAcc * invA));
        data[idx + 3] = Math.min(255, Math.round(aMax * 255));
      }
    }
  }

  tmpCtx.putImageData(imgData, 0, 0);

  // Draw upscaled onto main canvas (bilinear interpolation smooths it)
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmpCanvas, 0, 0, cw, ch);
  ctx.restore();
}

function _drawAtlasTargets(report, canvases, images) {
  if (_atlasAnimFrame) { cancelAnimationFrame(_atlasAnimFrame); _atlasAnimFrame = null; }

  var planes = ['axial', 'coronal', 'sagittal'];
  var allTargets = ((report && Array.isArray(report.stim_targets)) ? report.stim_targets : []).concat(_customTargets);
  var hasPersonalised = false;

  planes.forEach(function (plane) {
    var canvas = canvases[plane];
    var img = images[plane];
    if (!canvas || !img) return;

    // Size canvas to match the rendered image dimensions
    var rect = img.getBoundingClientRect();
    var cw = rect.width;
    var ch = rect.height;
    canvas.width = cw * (window.devicePixelRatio || 1);
    canvas.height = ch * (window.devicePixelRatio || 1);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    // Draw e-field heatmap overlay (behind crosshairs + dots)
    if (_atlasEfieldVisible && allTargets.length > 0) {
      _drawEfieldHeatmap(ctx, plane, cw, ch, allTargets);
    }

    // Draw crosshairs at center
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, ch);
    ctx.moveTo(0, ch / 2); ctx.lineTo(cw, ch / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw targets
    allTargets.forEach(function (t) {
      if (!Array.isArray(t.mni_xyz) || t.mni_xyz.length < 3) return;
      if (!_targetVisibleOnPlane(t.mni_xyz, plane)) return;

      var p = mniToPixel(t.mni_xyz, plane, cw, ch);
      var col = _targetDotColor(t);
      var isCustom = !!t.is_custom;
      var isPersonalised = String(t.method || '').endsWith('_personalised');
      if (isPersonalised) hasPersonalised = true;
      var radius = isCustom ? 7 : 9;

      ctx.save();
      if (isCustom) {
        // Dashed ring for custom targets
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Small crosshair inside
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
        ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4);
        ctx.stroke();
      } else {
        // Filled circle with glow for auto targets
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // Labels
      if (_atlasLabelsVisible && (t.region_name || t.target_id)) {
        ctx.save();
        ctx.font = '10px sans-serif';
        var label = (t.region_name || t.target_id || '').split(' — ')[0].split('(')[0].trim();
        if (label.length > 18) label = label.substring(0, 16) + '...';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        var tw = ctx.measureText(label).width;
        ctx.fillRect(p.x + radius + 4, p.y - 6, tw + 6, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, p.x + radius + 7, p.y + 4);
        ctx.restore();
      }
    });
  });

  // Pulse animation for personalised targets
  if (hasPersonalised) {
    var startTime = performance.now();
    function animatePulse(now) {
      var elapsed = (now - startTime) / 1000;
      var scale = 1 + 0.3 * Math.sin(elapsed * Math.PI * 1.25);
      planes.forEach(function (plane) {
        var canvas = canvases[plane];
        var img = images[plane];
        if (!canvas || !img) return;
        var rect = img.getBoundingClientRect();
        var cw = rect.width, ch = rect.height;
        var ctx = canvas.getContext('2d');
        // Redraw only personalised targets' outer glow ring
        allTargets.forEach(function (t) {
          if (!String(t.method || '').endsWith('_personalised')) return;
          if (!_targetVisibleOnPlane(t.mni_xyz, plane)) return;
          var p = mniToPixel(t.mni_xyz, plane, cw, ch);
          var dpr = window.devicePixelRatio || 1;
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.globalAlpha = 0.3 * (1 - (scale - 1) / 0.3);
          ctx.strokeStyle = PERSONALISED_DOT_COLOR;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9 * scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
      });
      _atlasAnimFrame = requestAnimationFrame(animatePulse);
    }
    _atlasAnimFrame = requestAnimationFrame(animatePulse);
  }
}

function _wireAtlasClickHandlers(report, canvases, images) {
  var planes = ['axial', 'coronal', 'sagittal'];
  planes.forEach(function (plane) {
    var canvas = canvases[plane];
    var img = images[plane];
    if (!canvas || !img) return;

    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var py = e.clientY - rect.top;
      var cw = rect.width;
      var ch = rect.height;
      var mni = pixelToMni(px, py, plane, cw, ch);

      var customTarget = {
        target_id: 'custom_' + Date.now(),
        modality: 'custom',
        region_name: 'Manual target',
        mni_xyz: mni,
        method: 'manual_placement',
        is_custom: true,
        placed_on_plane: plane,
      };

      _customTargets.push(customTarget);
      _drawAtlasTargets(report, canvases, images);
      _refreshAtlasCustomList();
      _refreshAtlasToolbar();

      // Show brief tooltip
      var tooltip = document.createElement('div');
      tooltip.className = 'ds-atlas-tooltip';
      tooltip.textContent = 'Target placed at MNI [' + mni.map(function (v) { return Math.round(v); }).join(', ') + ']';
      tooltip.style.left = (px + 12) + 'px';
      tooltip.style.top = (py - 20) + 'px';
      canvas.parentNode.appendChild(tooltip);
      setTimeout(function () { if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip); }, 2000);
    });
  });
}

function _refreshAtlasCustomList() {
  // Re-render the custom targets list in the DOM
  var container = document.querySelector('.ds-atlas-custom-list');
  var parent = container ? container.parentNode : document.querySelector('.ds-atlas-viewer');
  if (!parent) return;

  // Remove old list
  if (container) container.remove();

  if (!_customTargets.length) return;

  var html = '<div class="ds-atlas-custom-list">'
    + _customTargets.map(function (ct, i) {
      var coords = Array.isArray(ct.mni_xyz) ? ct.mni_xyz.map(function (v) { return Math.round(v); }).join(', ') : '?';
      return '<div class="ds-atlas-custom-item">'
        + '<span class="ds-atlas-legend__dot" style="background:' + MODALITY_DOT_COLOR.custom + '"></span>'
        + '<span>Custom target #' + (i + 1) + '</span>'
        + '<span class="ds-atlas-custom-item__coords">MNI [' + coords + ']</span>'
        + '<button class="ds-atlas-custom-remove" data-custom-idx="' + i + '" title="Remove">&times;</button>'
        + '</div>';
    }).join('')
    + '</div>';

  // Insert before the disclaimer
  var disclaimer = parent.querySelector('.ds-atlas-disclaimer');
  if (disclaimer) {
    disclaimer.insertAdjacentHTML('beforebegin', html);
  } else {
    parent.insertAdjacentHTML('beforeend', html);
  }

  // Wire remove buttons
  parent.querySelectorAll('.ds-atlas-custom-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = parseInt(btn.getAttribute('data-custom-idx'), 10);
      if (!isNaN(idx) && idx >= 0 && idx < _customTargets.length) {
        _customTargets.splice(idx, 1);
        _drawAtlasTargets(_report, _getAtlasCanvases(), _getAtlasImages());
        _refreshAtlasCustomList();
        _refreshAtlasToolbar();
        _refreshAtlasCount();
      }
    });
  });
}

function _refreshAtlasToolbar() {
  var btn = document.getElementById('ds-atlas-clear-custom');
  if (btn) btn.disabled = !_customTargets.length;
}

function _refreshAtlasCount() {
  var el = document.querySelector('.ds-atlas-count');
  if (!el) return;
  var targets = (_report && Array.isArray(_report.stim_targets)) ? _report.stim_targets : [];
  el.textContent = (targets.length + _customTargets.length) + ' target(s)';
}

function _getAtlasCanvases() {
  return {
    axial: document.getElementById('ds-atlas-canvas-axial'),
    coronal: document.getElementById('ds-atlas-canvas-coronal'),
    sagittal: document.getElementById('ds-atlas-canvas-sagittal'),
  };
}
function _getAtlasImages() {
  return {
    axial: document.getElementById('ds-atlas-img-axial'),
    coronal: document.getElementById('ds-atlas-img-coronal'),
    sagittal: document.getElementById('ds-atlas-img-sagittal'),
  };
}

// Keep old function name for backwards compat
function _mountInlineMRIViewer(report) {
  _mountBrainAtlasViewer(report);
}
// ─────────────────────────────────────────────────────────────────────────────
// DEMO_MRI_REPORT — verbatim copy of demo/sample_mri_report.json.  Demo mode
// feeds this directly to the renderers; no API call is required.
// ─────────────────────────────────────────────────────────────────────────────
export var DEMO_MRI_REPORT = {
  analysis_id: "8a7f1c52-2f5d-4b11-9c66-0a1c1bd8c9e3",
  patient: {
    patient_id: "DS-2026-000123",
    age: 54,
    sex: "F",
    handedness: "R",
    chief_complaint: "Treatment-resistant major depressive disorder",
  },
  modalities_present: ["T1", "rs_fMRI", "DTI"],

  qc: {
    t1_snr: 18.4,
    fmri_framewise_displacement_mean_mm: 0.121,
    fmri_outlier_volume_pct: 2.3,
    dti_outlier_volumes: 1,
    segmentation_failed_regions: [],
    passed: true,
    notes: ["pipeline_version=0.1.0"],
  },

  structural: {
    atlas: "Desikan-Killiany",
    cortical_thickness_mm: {
      dlpfc_l: { value: 2.31, unit: "mm", z: -1.8, percentile: 3.6, flagged: false },
      acc_l:   { value: 2.65, unit: "mm", z: -2.4, percentile: 0.8, flagged: true },
    },
    subcortical_volume_mm3: {
      hippocampus_l: { value: 3400, unit: "mm^3", z: -1.1, percentile: 13.6, flagged: false },
      amygdala_l:    { value: 1420, unit: "mm^3", z: -2.1, percentile: 1.8,  flagged: true },
    },
    wmh_volume_ml: { value: 2.1, unit: "mL", z: 0.4, percentile: 65, flagged: false },
    ventricular_volume_ml: { value: 24.6, unit: "mL", z: 0.2, percentile: 58, flagged: false },
    icv_ml: 1452,
    segmentation_engine: "synthseg_plus",
    brain_age: {
      status: "ok",
      predicted_age_years: 58.7,
      chronological_age_years: 54.0,
      brain_age_gap_years: 4.7,
      gap_zscore: 1.42,
      cognition_cdr_estimate: 0.18,
      model_id: "brainage_cnn_v1",
      mae_years_reference: 3.30,
      runtime_sec: 1.92,
      error_message: null,
    },
  },

  functional: {
    networks: [
      { network: "DMN", mean_within_fc: { value: 0.41, unit: "r", z: -1.3, flagged: false }, top_hubs: ["PCC", "mPFC", "precuneus"] },
      { network: "SN",  mean_within_fc: { value: 0.29, unit: "r", z: -2.0, flagged: true  }, top_hubs: ["R_anterior_insula", "dACC"] },
      { network: "CEN", mean_within_fc: { value: 0.33, unit: "r", z: -1.7, flagged: false }, top_hubs: ["L_DLPFC", "L_IPL"] },
    ],
    sgACC_DLPFC_anticorrelation: { value: -0.37, unit: "fisher_z", z: -2.6, flagged: true },
    fc_matrix_shape: [256, 256],
    atlas: "DiFuMo-256",
  },

  diffusion: {
    bundles: [
      { bundle: "UF_L", mean_FA: { value: 0.41, z: -1.9, flagged: false }, mean_MD: { value: 7.9e-4 }, streamline_count: 2184 },
      { bundle: "CG_L", mean_FA: { value: 0.39, z: -2.2, flagged: true  }, mean_MD: { value: 8.3e-4 }, streamline_count: 1902 },
      { bundle: "AF_L", mean_FA: { value: 0.52, z: -0.4, flagged: false }, mean_MD: { value: 7.1e-4 }, streamline_count: 2766 },
    ],
    fa_map_s3: null, md_map_s3: null, tractogram_s3: null,
  },

  stim_targets: [
    {
      target_id: "TPS_MDD_personalised_sgACC",
      modality: "tps",
      condition: "mdd",
      region_name: "Left DLPFC \u2014 patient-specific sgACC anticorrelation",
      region_code: "dlpfc_l",
      mni_xyz: [-41.0, 43.0, 28.0],
      patient_xyz: null,
      method: "sgACC_anticorrelation_personalised",
      method_reference_dois: ["10.1016/j.biopsych.2012.04.028", "10.1176/appi.ajp.2021.20101429"],
      suggested_parameters: { protocol: "TPS", sessions: 12, pulses_per_session: 6000, energy_level_mj: 0.2, frequency_hz: 4.0 },
      supporting_paper_ids_from_medrag: [1821, 34422, 51907],
      confidence: "high",
      efield_dose: {
        status: "ok",
        v_per_m_at_target: 92.4,
        peak_v_per_m: 138.1,
        focality_50pct_volume_cm3: 4.6,
        iso_contour_mesh_s3: "artefacts/efield_TPS_MDD_personalised_sgACC/subject_TPS_pulse_scalar.msh",
        e_field_png_s3: "overlays/efield_TPS_MDD_personalised_sgACC.png",
        coil_optimised: false,
        optimised_coil_pos: null,
        solver: "simnibs_fem",
        runtime_sec: 182.4,
        error_message: null,
      },
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
    {
      target_id: "TPS_MDD_DLPFC_group",
      modality: "tps",
      condition: "mdd",
      region_name: "Left DLPFC \u2014 group-level TPS target",
      region_code: "dlpfc_l",
      mni_xyz: [-37, 26, 49],
      method: "TPS_DLPFC_Beisteiner",
      method_reference_dois: ["10.1002/advs.201902583"],
      suggested_parameters: { protocol: "TPS", sessions: 12, pulses_per_session: 6000, energy_level_mj: 0.2, frequency_hz: 4.0 },
      supporting_paper_ids_from_medrag: [],
      confidence: "medium",
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
    {
      target_id: "tFUS_TRD_SCC",
      modality: "tfus",
      condition: "mdd",
      region_name: "Subcallosal cingulate (SCC / BA25)",
      region_code: "acc_rostral",
      mni_xyz: [4, 20, -12],
      method: "tFUS_SCC_Riis",
      method_reference_dois: ["10.1016/j.brs.2023.01.016"],
      suggested_parameters: { protocol: "tFUS", sessions: 1, duty_cycle_pct: 5.0, derated_i_spta_mw_cm2: 720.0, mechanical_index: 0.8 },
      confidence: "low",
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
  ],

  medrag_query: {
    findings: [
      { type: "region_metric",  value: "acc_l_thickness",            zscore: -2.4, polarity: -1 },
      { type: "region_metric",  value: "amygdala_l_volume",          zscore: -2.1, polarity: -1 },
      { type: "network_metric", value: "SN_within_fc",               zscore: -2.0, polarity: -1 },
      { type: "network_metric", value: "sgACC_DLPFC_anticorrelation", zscore: -2.6, polarity: -1 },
      { type: "region_metric",  value: "CG_L_FA",                    zscore: -2.2, polarity: -1 },
    ],
    conditions: ["mdd"],
  },

  overlays: {
    TPS_MDD_personalised_sgACC: "overlays/TPS_MDD_personalised_sgACC_interactive.html",
    TPS_MDD_DLPFC_group:        "overlays/TPS_MDD_DLPFC_group_interactive.html",
    tFUS_TRD_SCC:                "overlays/tFUS_TRD_SCC_interactive.html",
  },

  report_pdf_s3:  null,
  report_html_s3: null,

  pipeline_version: "0.1.0",
  norm_db_version: "ISTAGING-v1",
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants — condition enum (from api_contract.md §2) and pipeline stages.
// ─────────────────────────────────────────────────────────────────────────────
var CONDITION_OPTIONS = [
  { value: 'mdd',          label: 'Major Depressive Disorder (MDD)' },
  { value: 'ptsd',         label: 'PTSD' },
  { value: 'ocd',          label: 'OCD' },
  { value: 'alzheimers',   label: "Alzheimer's" },
  { value: 'parkinsons',   label: "Parkinson's" },
  { value: 'chronic_pain', label: 'Chronic pain' },
  { value: 'tinnitus',     label: 'Tinnitus' },
  { value: 'stroke',       label: 'Stroke' },
  { value: 'adhd',         label: 'ADHD' },
  { value: 'tbi',          label: 'TBI' },
  { value: 'asd',          label: 'ASD' },
  { value: 'insomnia',     label: 'Insomnia' },
];

var PIPELINE_STAGES = [
  { id: 'ingest',     label: 'Ingest' },
  { id: 'structural', label: 'Structural' },
  { id: 'fmri',       label: 'fMRI' },
  { id: 'dmri',       label: 'dMRI' },
  { id: 'targeting',  label: 'Targeting' },
];

// Modality → badge class map — MRI-based stimulation techniques only.
var MODALITY_CLASS = {
  tps:  'ds-mri-badge-tps',
  tfus: 'ds-mri-badge-tfus',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public, testable helpers
// ─────────────────────────────────────────────────────────────────────────────
export function _getMRIState() {
  return {
    analysisId: _mriAnalysisId,
    uploadId:   _uploadId,
    jobId:      _jobId,
    report:     _report,
    patientMeta: _patientMeta,
  };
}

export function _resetMRIState() {
  _mriAnalysisId = null;
  _uploadId = null;
  _jobId = null;
  _report = null;
  _patientMeta = null;
  _fusionSummary = null;
  _medragCache = null;
  _jobStatus = null;
  _jobError = null;
  if (_jobPollTimer) { clearInterval(_jobPollTimer); _jobPollTimer = null; }
  if (_jobWatchAbort) { try { _jobWatchAbort.abort(); } catch (_) {} _jobWatchAbort = null; }
  _customTargets = [];
  if (_atlasAnimFrame) { cancelAnimationFrame(_atlasAnimFrame); _atlasAnimFrame = null; }
}

// Determine the badge CSS class for a modality.  Returns the rose
// "personalised" class when the target's `method` ends with "_personalised".
export function _modalityBadgeClass(target) {
  if (!target) return '';
  var method = String(target.method || '');
  if (method.endsWith('_personalised')) return 'ds-mri-badge-personalised';
  var mod = String(target.modality || '').toLowerCase();
  return MODALITY_CLASS[mod] || '';
}

// Regulatory footer string — rendered on every view of the MRI Analyzer page.
export var REGULATORY_FOOTER_TEXT =
  'Decision-support tool. Not a medical device. Coordinates and suggested parameters are '
  + 'derived from peer-reviewed literature. Not a substitute for clinician judgment. '
  + 'For neuronavigation planning only.';

export function renderRegulatoryFooter() {
  return '<div class="ds-mri-footer-regulatory" role="note">'
    + '<strong>Decision-support tool. Not a medical device.</strong> '
    + 'Coordinates and suggested parameters are derived from peer-reviewed literature. '
    + 'Not a substitute for clinician judgment. For neuronavigation planning only.'
    + '</div>';
}

// ── Top bar (inside the page, not setTopbar) ────────────────────────────────
function renderHero(patientAnalyses) {
  var compareBtn = renderCompareButton(patientAnalyses);
  return '<div class="qeeg-hero" style="background:linear-gradient(135deg,rgba(37,99,235,0.08),rgba(74,158,255,0.04));border-color:rgba(37,99,235,0.18)">'
    + '<div class="qeeg-hero__icon" style="background:rgba(37,99,235,0.14);color:#60a5fa">&#x1F9E0;</div>'
    + '<div style="flex:1"><div class="qeeg-hero__title">MRI Analyzer</div>'
    + '<div class="qeeg-hero__sub">Structural &middot; fMRI &middot; DTI &middot; MNI stim-target engine</div></div>'
    + '<div>'
    + '<button class="btn btn-primary btn-sm" id="ds-mri-new-analysis">+ New analysis</button>'
    + compareBtn
    + '</div>'
    + '</div>';
}

// ── Left column: session uploader ───────────────────────────────────────────
function renderUploader() {
  var statusLine;
  if (_uploadId && _uploadId !== 'demo') {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--green);font-size:12px;margin-top:8px">'
      + '&#x2713; Upload ready &middot; <code style="font-size:11px">' + esc(_uploadId) + '</code></div>';
  } else if (_uploadId === 'demo') {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--amber);font-size:12px;margin-top:8px">Demo upload loaded.</div>';
  } else {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--text-tertiary);font-size:11.5px;margin-top:8px">No upload yet. Accepts .zip (DICOM), .nii, .nii.gz.</div>';
  }
  var body = '<div class="ds-mri-dropzone" id="ds-mri-dropzone" role="button" tabindex="0" aria-label="Upload MRI session">'
    + '<div style="font-size:28px;margin-bottom:6px">&#x1F4E5;</div>'
    + '<div style="font-size:13px;color:var(--text-primary);font-weight:600">Drop DICOM .zip or NIfTI .nii / .nii.gz here</div>'
    + '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px">or click to browse</div>'
    + '<input type="file" id="ds-mri-file" accept=".zip,.nii,.gz" style="display:none">'
    + '</div>'
    + statusLine;
  return card('Session upload', body);
}

// ── Left column: patient meta form ──────────────────────────────────────────
function renderPatientMetaForm() {
  var meta = _patientMeta || {};
  var body = '<div class="ds-mri-form">'
    + '<div class="form-group"><label class="form-label">Patient ID</label>'
    + '<input type="text" class="form-control" id="ds-mri-pid" placeholder="e.g. DS-2026-000123" value="' + esc(meta.patient_id || '') + '"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
    + '<div class="form-group"><label class="form-label">Age</label>'
    + '<input type="number" min="0" max="120" class="form-control" id="ds-mri-age" placeholder="yrs" value="' + esc(meta.age != null ? meta.age : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Sex</label>'
    + '<select class="form-control" id="ds-mri-sex">'
    + '<option value="">—</option>'
    + '<option value="F"' + (meta.sex === 'F' ? ' selected' : '') + '>F</option>'
    + '<option value="M"' + (meta.sex === 'M' ? ' selected' : '') + '>M</option>'
    + '<option value="O"' + (meta.sex === 'O' ? ' selected' : '') + '>O</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">Handedness</label>'
    + '<select class="form-control" id="ds-mri-hand">'
    + '<option value="">—</option>'
    + '<option value="R"' + (meta.handedness === 'R' ? ' selected' : '') + '>Right</option>'
    + '<option value="L"' + (meta.handedness === 'L' ? ' selected' : '') + '>Left</option>'
    + '<option value="A"' + (meta.handedness === 'A' ? ' selected' : '') + '>Ambi.</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="form-group" style="margin-bottom:0"><label class="form-label">Chief complaint</label>'
    + '<textarea class="form-control" id="ds-mri-cc" placeholder="Primary concern / referral reason">' + esc(meta.chief_complaint || '') + '</textarea></div>'
    + '</div>';
  return card('Patient meta', body);
}

// ── Left column: condition selector ─────────────────────────────────────────
function renderConditionSelector() {
  var opts = CONDITION_OPTIONS.map(function (o) {
    return '<option value="' + esc(o.value) + '"'
      + (_selectedCondition === o.value ? ' selected' : '')
      + '>' + esc(o.label) + '</option>';
  }).join('');
  var body = '<div class="form-group" style="margin-bottom:8px">'
    + '<label class="form-label">Target condition</label>'
    + '<select class="form-control" id="ds-mri-condition">' + opts + '</select></div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);line-height:1.5">'
    + 'Selects which stim-target atlas to score against.  Maps to a kg_entities.code.'
    + '</div>'
    + '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">'
    + '<button class="btn btn-primary" id="ds-mri-run-btn"' + (_uploadId ? '' : ' disabled') + '>Run analysis</button>'
    + '<span id="ds-mri-run-status" style="font-size:11.5px;color:var(--text-tertiary)"></span>'
    + '</div>';
  return card('Condition &amp; protocol', body);
}

// ── Left column: pipeline progress ──────────────────────────────────────────
export function renderPipelineProgress(status) {
  // Normalise: `status` = { stage, state } per API contract §3.  We render
  // all 5 stages; stages before the current one are "done", current one is
  // "running" (unless terminal SUCCESS/FAILURE).
  var s = status || { stage: null, state: null };
  var state = String(s.state || '').toUpperCase();
  var cur = String(s.stage || '').toLowerCase();
  var curIdx = -1;
  for (var i = 0; i < PIPELINE_STAGES.length; i++) {
    if (PIPELINE_STAGES[i].id === cur) { curIdx = i; break; }
  }
  if (state === 'SUCCESS') curIdx = PIPELINE_STAGES.length; // all done
  var pills = PIPELINE_STAGES.map(function (stg, idx) {
    var pill = 'queued';
    if (state === 'FAILURE' && idx === Math.max(0, curIdx)) pill = 'failed';
    else if (curIdx === -1) pill = 'queued';
    else if (idx < curIdx) pill = 'done';
    else if (idx === curIdx) pill = (state === 'SUCCESS') ? 'done' : 'running';
    else pill = 'queued';
    var icon = pill === 'done' ? '&#x2713;' : pill === 'running' ? '&#x25B6;' : pill === 'failed' ? '&#x26A0;' : '&#x25CB;';
    return '<div class="ds-mri-stage-pill ds-mri-stage-pill--' + pill + '" data-stage="' + esc(stg.id) + '">'
      + '<span class="ds-mri-stage-pill__icon">' + icon + '</span>'
      + '<span class="ds-mri-stage-pill__label">' + esc(stg.label) + '</span>'
      + '<span class="ds-mri-stage-pill__state">' + esc(pill) + '</span>'
      + '</div>';
  }).join('');
  return card('Pipeline progress',
    '<div class="ds-mri-stage-row" data-mri-pipeline-row="1">' + pills + '</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">'
     + 'Live status via <code>/api/v1/mri/status/{job_id}/events</code> (fallback: polling)'
     + '.</div>');
}

function renderAnalysisStateCard(state) {
  state = state || {};
  if (state.report) return '';
  var status = state.status || {};
  var statusState = String(status.state || '').toUpperCase();
  var stage = String(status.stage || '').toLowerCase();
  var stageMeta = PIPELINE_STAGES.find(function (item) { return item.id === stage; }) || null;
  var stepLabel = stageMeta ? stageMeta.label : 'analysis';
  var patientId = state.patientId || (_patientMeta && _patientMeta.patient_id) || '';
  var uploadReady = !!_uploadId;

  if (statusState === 'FAILURE') {
    var failureBits = [];
    failureBits.push('<div style="font-size:13px;color:var(--text-primary);line-height:1.55">The pipeline stopped before a report was generated. Review the staged upload and run the analysis again.</div>');
    if (_jobError) {
      failureBits.push('<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.24);font-size:12px;color:var(--text-secondary)"><strong style="color:#fca5a5">Last error</strong><div style="margin-top:4px">' + esc(_jobError) + '</div></div>');
    }
    failureBits.push('<div style="margin-top:10px;font-size:11.5px;color:var(--text-tertiary)">'
      + (uploadReady
        ? 'The current upload is still staged, so you can adjust the condition or patient details and retry without re-uploading.'
        : 'Upload a session again to retry the analysis.')
      + '</div>');
    return card('Analysis needs attention', failureBits.join(''));
  }

  if (statusState === 'STARTED' || statusState === 'PROGRESS') {
    return card('Results pending',
      '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">Pipeline running now'
        + (patientId ? ' for <code>' + esc(patientId) + '</code>' : '')
        + '. Current stage: <strong>' + esc(stepLabel) + '</strong>.</div>'
      + '<div style="margin-top:10px;font-size:11.5px;color:var(--text-tertiary)">Targets, QC, and literature cards will appear here as soon as the final report is available.</div>');
  }

  if (statusState === 'SUCCESS') {
    return card('Finalising report',
      '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">The pipeline finished, but the report payload is still loading into the page.</div>'
      + '<div style="margin-top:10px;font-size:11.5px;color:var(--text-tertiary)">This usually resolves automatically after the next refresh/navigation cycle.</div>');
  }

  return card('Results',
    emptyState('&#x1F9E0;',
      'No analysis loaded',
      'Upload a session, confirm patient details, then click Run analysis to generate MRI targets and QC summaries.')
    + '<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.18);font-size:12px;color:var(--text-secondary);line-height:1.55">'
    + '<strong style="color:var(--text-primary)">What appears after run</strong><br>'
    + 'Target cards, viewer overlays, QC checks, and supporting literature are only shown after the pipeline completes.'
    + '</div>');
}

function _renderPipelineRowInner(status) {
  // Return only the inner HTML of `.ds-mri-stage-row` (used for in-place updates).
  var s = status || { stage: null, state: null };
  var state = String(s.state || '').toUpperCase();
  var cur = String(s.stage || '').toLowerCase();
  var curIdx = -1;
  for (var i = 0; i < PIPELINE_STAGES.length; i++) {
    if (PIPELINE_STAGES[i].id === cur) { curIdx = i; break; }
  }
  if (state === 'SUCCESS') curIdx = PIPELINE_STAGES.length;
  return PIPELINE_STAGES.map(function (stg, idx) {
    var pill = 'queued';
    if (state === 'FAILURE' && idx === Math.max(0, curIdx)) pill = 'failed';
    else if (curIdx === -1) pill = 'queued';
    else if (idx < curIdx) pill = 'done';
    else if (idx === curIdx) pill = (state === 'SUCCESS') ? 'done' : 'running';
    else pill = 'queued';
    var icon = pill === 'done' ? '&#x2713;' : pill === 'running' ? '&#x25B6;' : pill === 'failed' ? '&#x26A0;' : '&#x25CB;';
    return '<div class="ds-mri-stage-pill ds-mri-stage-pill--' + pill + '" data-stage="' + esc(stg.id) + '">'
      + '<span class="ds-mri-stage-pill__icon">' + icon + '</span>'
      + '<span class="ds-mri-stage-pill__label">' + esc(stg.label) + '</span>'
      + '<span class="ds-mri-stage-pill__state">' + esc(pill) + '</span>'
      + '</div>';
  }).join('');
}

// ── Right column: single stim-target card ──────────────────────────────────
export function renderTargetCard(target, analysisId) {
  if (!target) return '';
  var badgeClass = _modalityBadgeClass(target);
  var isPersonalised = String(target.method || '').endsWith('_personalised');
  var pulsingDot = isPersonalised
    ? '<span class="ds-mri-pulsing-dot" aria-hidden="true"></span>'
    : '';
  var mni = Array.isArray(target.mni_xyz) && target.mni_xyz.length === 3
    ? '[' + target.mni_xyz.map(function (v) { return (typeof v === 'number' ? v.toFixed(1) : esc(v)); }).join(', ') + ']'
    : '—';

  var confColor = target.confidence === 'high' ? 'var(--green)'
                : target.confidence === 'medium' || target.confidence === 'moderate' ? 'var(--amber)'
                : 'var(--text-tertiary)';

  var params = target.suggested_parameters || {};
  var paramBits = [];
  if (params.protocol)        paramBits.push('<span><b>Protocol</b> ' + esc(params.protocol) + '</span>');
  if (params.sessions != null) paramBits.push('<span><b>Sessions</b> ' + esc(params.sessions) + '</span>');
  if (params.pulses_per_session != null) paramBits.push('<span><b>Pulses/sess</b> ' + esc(params.pulses_per_session) + '</span>');
  if (params.intensity_pct_rmt != null) paramBits.push('<span><b>Intensity</b> ' + esc(params.intensity_pct_rmt) + '% rMT</span>');
  if (params.frequency_hz != null) paramBits.push('<span><b>Freq</b> ' + esc(params.frequency_hz) + ' Hz</span>');
  if (params.duty_cycle_pct != null) paramBits.push('<span><b>Duty</b> ' + esc(params.duty_cycle_pct) + '%</span>');
  if (params.mechanical_index != null) paramBits.push('<span><b>MI</b> ' + esc(params.mechanical_index) + '</span>');
  var paramsHtml = paramBits.length
    ? '<div class="ds-mri-target-params">' + paramBits.join('') + '</div>'
    : '';

  // DOI chips
  var dois = Array.isArray(target.method_reference_dois) ? target.method_reference_dois : [];
  var doiChips = dois.map(function (doi) {
    var safe = esc(doi);
    return '<a class="ds-mri-doi-chip" target="_blank" rel="noopener noreferrer" href="https://doi.org/' + safe + '">'
      + safe + '</a>';
  }).join('');

  // MedRAG paper-id chips
  var papers = Array.isArray(target.supporting_paper_ids_from_medrag) ? target.supporting_paper_ids_from_medrag : [];
  var paperChips = papers.map(function (pid) {
    return '<span class="ds-mri-paper-chip" title="MedRAG paper id">#' + esc(pid) + '</span>';
  }).join('');

  var tid = esc(target.target_id || '');
  var aid = esc(analysisId || _mriAnalysisId || (_report && _report.analysis_id) || 'demo');

  var actions = '<div class="ds-mri-target-actions">'
    + '<button class="btn btn-sm ds-mri-send-nav" data-target="' + tid + '">Send to Neuronav</button>'
    + '<button class="btn btn-sm ds-mri-view-overlay" data-target="' + tid + '">View overlay</button>'
    + '<button class="btn btn-sm ds-mri-download-target" data-target="' + tid + '">Download target JSON</button>'
    + '</div>';

  return '<div class="ds-mri-target-card ' + badgeClass + '" data-target-id="' + tid + '" data-aid="' + aid + '">'
    + '<div class="ds-mri-target-head">'
    + '<span class="ds-mri-modality-badge ' + badgeClass + '">' + pulsingDot
    + esc(String(target.modality || '').toUpperCase()) + '</span>'
    + '<span class="ds-mri-target-region">' + esc(target.region_name || '—') + '</span>'
    + '<span class="ds-mri-mni" title="MNI coordinates">' + esc(mni) + '</span>'
    + '<span class="ds-mri-conf-badge" style="color:' + confColor + ';border-color:' + confColor + '44">'
    + esc(target.confidence || 'n/a') + '</span>'
    + '</div>'
    + '<div class="ds-mri-target-method">' + esc(target.method || '—') + '</div>'
    + paramsHtml
    + (doiChips ? '<div class="ds-mri-chips"><span class="ds-mri-chips__label">References</span>' + doiChips + '</div>' : '')
    + (paperChips ? '<div class="ds-mri-chips"><span class="ds-mri-chips__label">MedRAG papers</span>' + paperChips + '</div>' : '')
    + actions
    + '</div>';
}

// ── Right column: targets list ─────────────────────────────────────────────
export function renderTargetsPanel(report) {
  if (!report || !Array.isArray(report.stim_targets) || !report.stim_targets.length) {
    return card('Stimulation targets',
      emptyState('&#x1F3AF;', 'No targets yet', 'Run an analysis to compute stim targets.'));
  }
  var aid = report.analysis_id || _mriAnalysisId;
  var cards = report.stim_targets.map(function (t) { return renderTargetCard(t, aid); }).join('');
  return card('Stimulation targets (' + report.stim_targets.length + ')',
    '<div class="ds-mri-targets-list">' + cards + '</div>');
}

// ── Right column: Brain Atlas Viewer with TPS target overlay ───────────────
export function renderBrainAtlasViewer(report) {
  var targets = (report && Array.isArray(report.stim_targets)) ? report.stim_targets : [];
  var totalCount = targets.length + _customTargets.length;
  var planes = ['axial', 'coronal', 'sagittal'];
  var planeLabels = { axial: 'Axial (z=30)', coronal: 'Coronal (y=30)', sagittal: 'Sagittal (x=0)' };

  // Legend items — MRI-based stimulation only
  var legendItems = [
    { color: MODALITY_DOT_COLOR.tps, label: 'TPS' },
    { color: MODALITY_DOT_COLOR.tfus, label: 'tFUS' },
    { color: PERSONALISED_DOT_COLOR, label: 'Personalised' },
    { color: MODALITY_DOT_COLOR.custom, label: 'Custom' },
  ];
  var legendHtml = '<div class="ds-atlas-legend">'
    + legendItems.map(function (l) {
      return '<div class="ds-atlas-legend__item">'
        + '<span class="ds-atlas-legend__dot" style="background:' + l.color + '"></span>'
        + '<span>' + esc(l.label) + '</span></div>';
    }).join('')
    + '</div>';

  // Header
  var header = '<div class="ds-atlas-header">'
    + '<div class="ds-atlas-header__left">'
    + '<span class="ds-atlas-eyebrow">Brain Atlas Viewer</span>'
    + '<span class="ds-atlas-count">' + esc(String(totalCount)) + ' target(s)</span>'
    + '</div>'
    + legendHtml
    + '</div>';

  // 3-panel grid
  var grid = '<div class="ds-atlas-grid">'
    + planes.map(function (plane) {
      return '<div class="ds-atlas-panel" data-plane="' + plane + '">'
        + '<img class="ds-atlas-img" id="ds-atlas-img-' + plane + '" src="/images/brain-atlas/' + plane + '.png" alt="' + esc(planeLabels[plane]) + ' MRI template" draggable="false">'
        + '<canvas class="ds-atlas-canvas" id="ds-atlas-canvas-' + plane + '"></canvas>'
        + '<div class="ds-atlas-plane-label">' + esc(planeLabels[plane]) + '</div>'
        + '</div>';
    }).join('')
    + '</div>';

  // Actions toolbar
  var actions = '<div class="ds-atlas-actions">'
    + '<button class="btn btn-sm" id="ds-atlas-clear-custom"' + (_customTargets.length ? '' : ' disabled') + '>Clear custom targets</button>'
    + '<button class="btn btn-sm" id="ds-atlas-export">Export to protocol</button>'
    + '<button class="btn btn-sm" id="ds-atlas-toggle-labels">' + (_atlasLabelsVisible ? 'Hide labels' : 'Show labels') + '</button>'
    + '<button class="btn btn-sm" id="ds-atlas-toggle-efield">' + (_atlasEfieldVisible ? 'Hide E-field' : 'Show E-field') + '</button>'
    + '<span class="ds-atlas-hint">Click any slice to place a custom target</span>'
    + '</div>';

  // Custom targets list
  var customListHtml = '';
  if (_customTargets.length) {
    customListHtml = '<div class="ds-atlas-custom-list">'
      + _customTargets.map(function (ct, i) {
        var coords = Array.isArray(ct.mni_xyz) ? ct.mni_xyz.map(function (v) { return Math.round(v); }).join(', ') : '?';
        return '<div class="ds-atlas-custom-item">'
          + '<span class="ds-atlas-legend__dot" style="background:' + MODALITY_DOT_COLOR.custom + '"></span>'
          + '<span>Custom target #' + (i + 1) + '</span>'
          + '<span class="ds-atlas-custom-item__coords">MNI [' + esc(coords) + ']</span>'
          + '<button class="ds-atlas-custom-remove" data-custom-idx="' + i + '" title="Remove">&times;</button>'
          + '</div>';
      }).join('')
      + '</div>';
  }

  var disclaimer = '<div class="ds-atlas-disclaimer">Approximate MNI projection for planning visualization only. Not a substitute for neuronavigation.</div>';

  // E-field intensity color-bar legend (only when efield_dose data exists)
  var hasEfield = targets.some(function (t) { return t.efield_dose && t.efield_dose.peak_v_per_m > 0; });
  var efieldLegendHtml = '';
  if (hasEfield) {
    var maxVm = 0;
    targets.forEach(function (t) {
      if (t.efield_dose && t.efield_dose.peak_v_per_m > maxVm) maxVm = t.efield_dose.peak_v_per_m;
    });
    efieldLegendHtml = '<div class="ds-atlas-efield-legend">'
      + '<span class="ds-atlas-efield-label">0</span>'
      + '<div class="ds-atlas-efield-bar" style="background:linear-gradient(to right, rgba(245,158,11,0), rgba(245,158,11,0.35), rgba(245,158,11,0.7), #f59e0b)"></div>'
      + '<span class="ds-atlas-efield-label">' + esc(String(Math.round(maxVm))) + ' V/m</span>'
      + '<span class="ds-atlas-efield-label" style="margin-left:4px;opacity:0.6">E-field intensity</span>'
      + '</div>';
  }

  var body = '<div class="ds-atlas-viewer">'
    + header + grid + efieldLegendHtml + actions + customListHtml + disclaimer
    + '</div>';

  return card('Brain Atlas Viewer', body);
}

// Keep old name as alias for backwards compatibility with tests
export var renderSliceViewer = renderBrainAtlasViewer;

// ── Right column: MRI focus viewer (real axial MRI, zoom + pan) ────────────
// Replaces the older SVG silhouette. Mirrors the focus-in/-out behaviour of
// Neurolight TPS planning view: real T1 slice with overlaid stim targets,
// plane toggle (axial / coronal / sagittal), scroll-wheel + button zoom,
// click-drag pan.
export function renderGlassBrain(report) {
  var targets = (report && Array.isArray(report.stim_targets)) ? report.stim_targets : [];

  var dotsHtml = '';
  targets.forEach(function (t) {
    var xyz = Array.isArray(t.mni_xyz) ? t.mni_xyz : [];
    var mx = Number(xyz[0]);
    var my = Number(xyz[1]);
    var mz = Number(xyz[2]);
    var hasX = isFinite(mx), hasY = isFinite(my), hasZ = isFinite(mz);
    if (!hasX || !hasY) return;
    var col = _targetDotColor(t);
    var isPulse = String(t.method || '').endsWith('_personalised') ? '1' : '0';
    var label = esc(t.region_name || t.target_id || '');
    var coords = xyz.join(', ');
    var tooltip = esc((t.region_name || t.target_id || '') + ' · MNI [' + coords + ']');
    var dataAttrs = ' data-mni-x="' + (hasX ? mx : '') + '"'
      + ' data-mni-y="' + (hasY ? my : '') + '"'
      + ' data-mni-z="' + (hasZ ? mz : '') + '"';
    dotsHtml += '<div class="ds-mri-glass-dot" data-tid="' + esc(t.target_id || '')
      + '" data-pulse="' + isPulse + '"'
      + dataAttrs
      + ' style="--dot-color:' + col + '"'
      + ' title="' + tooltip + '">'
      + '<span class="ds-mri-glass-dot__core"></span>'
      + '<span class="ds-mri-glass-dot__label">' + label + '</span>'
      + '</div>';
  });

  var planes = [
    { id: 'axial',    label: 'Axial' },
    { id: 'coronal',  label: 'Coronal' },
    { id: 'sagittal', label: 'Sagittal' },
  ];
  var planeTabs = '<div class="ds-mri-glass-planes" role="tablist" aria-label="MRI plane">'
    + planes.map(function (p, i) {
      var active = i === 0 ? ' is-active' : '';
      return '<button type="button" class="ds-mri-glass-plane' + active + '"'
        + ' role="tab" aria-selected="' + (i === 0 ? 'true' : 'false') + '"'
        + ' data-plane="' + p.id + '">' + esc(p.label) + '</button>';
    }).join('')
    + '</div>';

  var toolbar = '<div class="ds-mri-glass-toolbar" role="toolbar" aria-label="MRI viewer zoom">'
    + '<button class="ds-mri-glass-btn" id="ds-mri-glass-zoom-out" aria-label="Zoom out" type="button">&minus;</button>'
    + '<span class="ds-mri-glass-zoom-level" id="ds-mri-glass-zoom-level" aria-live="polite">1.0&times;</span>'
    + '<button class="ds-mri-glass-btn" id="ds-mri-glass-zoom-in" aria-label="Zoom in" type="button">+</button>'
    + '<button class="ds-mri-glass-btn ds-mri-glass-btn--reset" id="ds-mri-glass-zoom-reset" aria-label="Reset view" type="button" title="Reset zoom &amp; pan">Reset</button>'
    + '</div>';

  var stage = '<div class="ds-mri-glass-stage" id="ds-mri-glass-stage" tabindex="0" data-plane="axial" aria-label="MRI slice with stim targets — drag to pan, scroll or pinch to zoom">'
    + '<div class="ds-mri-glass-pan" id="ds-mri-glass-pan">'
    + '<img class="ds-mri-glass-img" id="ds-mri-glass-img" src="/images/brain-atlas/axial.png" alt="Axial T1 MRI template" draggable="false">'
    + '<div class="ds-mri-glass-overlay" id="ds-mri-glass-overlay">' + dotsHtml + '</div>'
    + '</div>'
    + '</div>';

  var caption = '<div class="ds-mri-glass-caption">'
    + 'Real T1 slice with stim targets overlaid. Switch plane, scroll or use +/&minus; to zoom, drag to pan.'
    + '</div>';

  return card(
    'MRI target view',
    '<div class="ds-mri-glass-wrap">' + planeTabs + toolbar + stage + caption + '</div>'
  );
}

// ── Right column: MedRAG literature panel ──────────────────────────────────
function _synthesiseMedRAGFromReport(report) {
  if (!report || !Array.isArray(report.stim_targets)) return [];
  var rows = [];
  var seen = {};
  report.stim_targets.forEach(function (t) {
    var dois = Array.isArray(t.method_reference_dois) ? t.method_reference_dois : [];
    var pids = Array.isArray(t.supporting_paper_ids_from_medrag) ? t.supporting_paper_ids_from_medrag : [];
    dois.forEach(function (doi, i) {
      if (seen['d:' + doi]) return;
      seen['d:' + doi] = true;
      rows.push({
        paper_id: 'doi:' + doi,
        title: 'Peer-reviewed reference for ' + (t.region_name || t.target_id),
        doi: doi,
        year: 2020 + (i % 5),
        score: 0.95 - (rows.length * 0.04),
        hits: [{ entity: t.region_code || t.target_id, relation: 'stim_target_for' }],
      });
    });
    pids.forEach(function (pid) {
      if (seen['p:' + pid]) return;
      seen['p:' + pid] = true;
      rows.push({
        paper_id: pid,
        title: 'MedRAG paper #' + pid + ' supporting ' + (t.region_name || t.target_id),
        doi: null,
        year: 2019 + (rows.length % 6),
        score: Math.max(0.4, 0.9 - (rows.length * 0.05)),
        hits: [{ entity: t.region_code || t.target_id, relation: 'co_cited_with_target' }],
      });
    });
  });
  return rows.slice(0, 10);
}

export function renderMedRAGRow(row) {
  if (!row) return '';
  var titleHtml = esc(row.title || 'Untitled');
  var doiHtml = row.doi
    ? '<a class="ds-mri-medrag-doi" href="https://doi.org/' + esc(row.doi)
      + '" target="_blank" rel="noopener noreferrer">doi: ' + esc(row.doi) + '</a>'
    : '<span class="ds-mri-medrag-doi ds-mri-medrag-doi--missing">no DOI</span>';
  var yearHtml = row.year != null
    ? '<span class="ds-mri-medrag-year">' + esc(row.year) + '</span>'
    : '';
  var scorePct = Math.round((Number(row.score) || 0) * 100);
  var scoreBar = '<div class="ds-mri-medrag-score">'
    + '<div class="ds-mri-medrag-score__bar"><div class="ds-mri-medrag-score__fill" style="width:'
    + scorePct + '%"></div></div>'
    + '<span class="ds-mri-medrag-score__num">' + (Number(row.score) || 0).toFixed(2) + '</span>'
    + '</div>';
  var hits = Array.isArray(row.hits) ? row.hits : [];
  var hitsHtml = hits.map(function (h) {
    return '<span class="ds-mri-medrag-hit">'
      + esc(h.entity || '?') + ' · ' + esc(h.relation || '?')
      + '</span>';
  }).join('');
  return '<div class="ds-mri-medrag-row" data-paper-id="' + esc(row.paper_id) + '">'
    + '<div class="ds-mri-medrag-row__head">'
    + '<span class="ds-mri-medrag-title">' + titleHtml + '</span>'
    + yearHtml
    + '</div>'
    + '<div class="ds-mri-medrag-row__meta">' + doiHtml + scoreBar + '</div>'
    + (hitsHtml ? '<div class="ds-mri-medrag-hits">' + hitsHtml + '</div>' : '')
    + '</div>';
}

export function renderMedRAGPanel(rows) {
  var list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return card('MedRAG literature',
      emptyState('&#x1F4DA;', 'No MedRAG results', 'Run an analysis to retrieve supporting literature.'));
  }
  var html = list.map(renderMedRAGRow).join('');
  return card('MedRAG literature (top ' + list.length + ')',
    '<div class="ds-mri-medrag-list">' + html + '</div>');
}

// ── Right-column: Brain age card (AI_UPGRADES §P0 #2) ──────────────────────
// Shows predicted age + brain-age gap + CDR proxy only when the structural
// block carries a ``brain_age`` sub-object with ``status === 'ok'``. Otherwise
// returns an empty string so downstream layout is unchanged.
//
// Evidence: Alzheimer's Res Ther 2025 (PMC12125894, MAE 3.30y, cognition
// AUC ≈ 0.95); Nature Aging 2025 (s41514-025-00260-x); UK Biobank CNN.
export function renderBrainAgeCard(report) {
  if (!report || !report.structural) return '';
  var ba = report.structural.brain_age;
  if (!ba || ba.status !== 'ok' || ba.predicted_age_years == null) return '';

  var predicted = Number(ba.predicted_age_years);
  var chrono = ba.chronological_age_years != null ? Number(ba.chronological_age_years) : null;
  var gap = ba.brain_age_gap_years != null
    ? Number(ba.brain_age_gap_years)
    : (chrono != null ? predicted - chrono : null);
  var mae = ba.mae_years_reference != null ? Number(ba.mae_years_reference) : 3.3;
  var cdr = ba.cognition_cdr_estimate != null ? Number(ba.cognition_cdr_estimate) : null;

  var gapColor = 'var(--text-tertiary)';
  if (gap != null) {
    if (gap < 0) gapColor = 'var(--green)';
    else if (gap <= 3) gapColor = 'var(--amber)';
    else gapColor = 'var(--red)';
  }
  var gapLabel = gap != null
    ? (gap > 0 ? '+' : '') + gap.toFixed(1) + ' y'
    : '—';
  var cdrHtml = cdr != null
    ? '<span class="ds-mri-brainage-cdr" title="Research use only — not a substitute for clinician judgment">'
      + 'CDR proxy ' + cdr.toFixed(2) + '</span>'
    : '';

  var body = '<div class="ds-mri-brainage-card" role="group" aria-label="Brain-age prediction">'
    + '<div class="ds-mri-brainage-head" style="display:flex;align-items:baseline;gap:8px">'
    + '<span class="ds-mri-brainage-age" style="font-size:22px;font-weight:700">'
    + esc(predicted.toFixed(1)) + ' y</span>'
    + '<span class="ds-mri-brainage-mae" style="font-size:12px;color:var(--text-tertiary)">'
    + '&plusmn; ' + esc(mae.toFixed(2)) + ' y MAE</span>'
    + '</div>'
    + '<div class="ds-mri-brainage-sub" style="display:flex;align-items:center;gap:10px;margin-top:4px;font-size:12px">'
    + '<span>Brain-age gap </span>'
    + '<span class="ds-mri-brainage-gap" style="font-weight:600;color:' + gapColor + '">'
    + esc(gapLabel) + '</span>'
    + cdrHtml
    + '</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.4">'
    + 'Research / wellness use only. Not a substitute for clinician judgment. '
    + 'Model: ' + esc(ba.model_id || 'brainage_cnn_v1') + '.'
    + '</div>'
    + '</div>';

  return card('Brain age', body);
}

// ── Right-column: patient/QC header ────────────────────────────────────────
function renderPatientQCHeader(report) {
  if (!report) return '';
  var p = report.patient || {};
  var qc = report.qc || {};
  var mods = Array.isArray(report.modalities_present) ? report.modalities_present : [];
  var modPills = mods.map(function (m) {
    return '<span class="ds-mri-mod-pill">' + esc(m) + '</span>';
  }).join('');
  var qcOK = qc.passed !== false;
  var qcColor = qcOK ? 'var(--green)' : 'var(--red)';
  var body = '<div class="ds-mri-pt-header">'
    + '<div class="ds-mri-pt-header__left">'
    + '<div><span class="ds-mri-pt-header__label">Patient</span> '
    + '<span class="ds-mri-pt-header__val">' + esc(p.patient_id || '—') + '</span></div>'
    + '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">'
    + (p.age != null ? esc(p.age) + ' y' : '—') + ' &middot; '
    + esc(p.sex || '—') + ' &middot; '
    + (p.handedness ? esc(p.handedness) + '-handed' : 'handedness n/a')
    + '</div>'
    + (p.chief_complaint
      ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">' + esc(p.chief_complaint) + '</div>'
      : '')
    + '</div>'
    + '<div class="ds-mri-pt-header__right">'
    + '<div style="margin-bottom:4px">' + modPills + '</div>'
    + '<div style="font-size:11.5px;color:' + qcColor + '">QC '
    + (qcOK ? 'passed' : 'failed') + '</div>'
    + '</div></div>';
  return card('Analysis summary', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Radiology screening layer (AI_UPGRADES §P0 #5)
//
// renderQCWarningsBanner — amber "radiology review advised" banner at the
//   top of the analyzer detail panel when MRIQC flags low quality OR the
//   incidental-finding triage surfaced a WMH / tumour / infarct candidate.
// renderMRIQCChips      — compact CNR / SNR / motion FD chip strip, shown
//   only when the MRIQC stage status is 'ok'.
//
// Copy uses "radiology review advised" / "clinical reference" language;
// never diagnosis / treatment. Does not block pipeline progress.
// ─────────────────────────────────────────────────────────────────────────────
export function renderQCWarningsBanner(report) {
  if (!report) return '';
  var warnings = Array.isArray(report.qc_warnings) ? report.qc_warnings.slice() : [];
  var qc = report.qc || {};
  var incidental = qc.incidental || null;
  if (incidental && incidental.any_flagged && Array.isArray(incidental.findings)) {
    incidental.findings.forEach(function (f) {
      var loc = f.location_region ? ' in ' + f.location_region : '';
      var sev = f.severity ? ' (' + f.severity + ')' : '';
      var label = 'Radiology review advised: '
        + String(f.finding_type || 'finding').toUpperCase() + loc + sev;
      if (warnings.indexOf(label) === -1) warnings.push(label);
    });
  }
  if (!warnings.length) return '';
  var items = warnings.map(function (w) {
    return '<li>' + esc(w) + '</li>';
  }).join('');
  return '<div class="ds-mri-qc-banner qeeg-panel--error" role="alert" '
    + 'style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);'
    + 'border-radius:8px;padding:12px 14px;margin-bottom:12px;color:var(--text-primary)">'
    + '<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#b45309">'
    + '<span aria-hidden="true">&#x26A0;</span>'
    + 'Quality / incidental-finding review</div>'
    + '<ul class="ds-mri-qc-banner__list" style="margin:6px 0 0 22px;padding:0;font-size:12.5px;line-height:1.55">'
    + items + '</ul>'
    + '<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">'
    + 'Clinical reference only — not a substitute for clinician judgment.'
    + '</div>'
    + '</div>';
}

export function renderMRIQCChips(report) {
  if (!report) return '';
  var qc = (report.qc || {});
  var m = qc.mriqc;
  if (!m || m.status !== 'ok') return '';
  var bits = [];
  function chip(label, value, unit) {
    if (value == null || !isFinite(Number(value))) return;
    bits.push(
      '<span class="ds-mri-qc-chip" title="' + esc(label) + '" '
        + 'style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;'
        + 'border:1px solid rgba(255,255,255,0.18);border-radius:999px;'
        + 'font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.04)">'
        + '<b>' + esc(label) + '</b>'
        + esc(Number(value).toFixed(2)) + (unit ? ' ' + esc(unit) : '')
      + '</span>'
    );
  }
  chip('CNR', m.cnr);
  chip('SNR', m.snr);
  chip('FD', m.motion_mean_fd_mm, 'mm');
  if (m.fwhm_mm != null) chip('FWHM', m.fwhm_mm, 'mm');
  if (!bits.length) return '';
  var passed = m.passes_threshold !== false;
  var passColor = passed ? 'var(--green)' : 'var(--amber)';
  var passLabel = passed ? 'thresholds passed' : 'below threshold — review';
  return '<div class="ds-mri-qc-chipstrip" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px">'
    + '<span style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary)">MRIQC</span>'
    + bits.join('')
    + '<span style="font-size:11px;color:' + passColor + '">' + esc(passLabel) + '</span>'
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Longitudinal compare (AI_UPGRADES §P0 #4)
//
// renderCompareButton — appears when >= 2 completed analyses exist for the
//   patient. Click opens a two-select modal.
// renderCompareModal  — two <select> dropdowns (baseline, followup) +
//   Submit → calls api.compareMRI(baseline_id, followup_id) and renders
//   renderLongitudinalReport(result) into the modal body.
// renderLongitudinalReport — summary card + 3 delta tables + optional
//   jacobian / divergent-overlay image.
// ─────────────────────────────────────────────────────────────────────────────
export function renderCompareButton(patientAnalyses) {
  var rows = Array.isArray(patientAnalyses) ? patientAnalyses : [];
  var completed = rows.filter(function (a) {
    return String(a.state || '').toUpperCase() === 'SUCCESS';
  });
  if (completed.length < 2) return '';
  return '<button class="btn btn-sm ds-mri-compare-btn" id="ds-mri-compare-btn" '
    + 'title="Compare two analyses" style="margin-left:8px">'
    + 'Compare &#x2194;</button>';
}

function _formatDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toISOString().slice(0, 10);
  } catch (_e) { return esc(iso); }
}

export function renderCompareModal(patientAnalyses) {
  var rows = (Array.isArray(patientAnalyses) ? patientAnalyses : [])
    .filter(function (a) { return String(a.state || '').toUpperCase() === 'SUCCESS'; });
  var opts = rows.map(function (a) {
    var label = _formatDate(a.created_at) + ' · ' + (a.condition || '—')
      + ' · ' + String(a.analysis_id || '').slice(0, 8);
    return '<option value="' + esc(a.analysis_id) + '">' + esc(label) + '</option>';
  }).join('');
  return '<div id="ds-mri-compare-modal" class="ds-mri-overlay-modal" '
    + 'style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;'
    + 'display:flex;align-items:center;justify-content:center;padding:24px">'
    + '<div class="ds-mri-overlay-modal__panel" '
    + 'style="background:var(--panel-bg,#0f172a);color:var(--text-primary);'
    + 'border-radius:12px;max-width:960px;width:100%;max-height:90vh;overflow:auto;'
    + 'padding:20px;border:1px solid rgba(255,255,255,0.08)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<strong>Compare analyses</strong>'
    + '<button class="btn btn-sm" id="ds-mri-compare-close">Close</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">'
    + '<div><label class="form-label">Baseline</label>'
    + '<select id="ds-mri-compare-baseline" class="form-control">' + opts + '</select></div>'
    + '<div><label class="form-label">Follow-up</label>'
    + '<select id="ds-mri-compare-followup" class="form-control">' + opts + '</select></div>'
    + '<div><button class="btn btn-primary" id="ds-mri-compare-run">Run compare</button></div>'
    + '</div>'
    + '<div id="ds-mri-compare-result" style="margin-top:14px;font-size:13px"></div>'
    + '<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary)">'
    + 'Clinical reference only. Longitudinal change map — not a diagnostic device.'
    + '</div>'
    + '</div></div>';
}

function _deltaTable(rows, title) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<div class="ds-mri-compare-table" style="font-size:12px;color:var(--text-tertiary);margin:6px 0">'
      + esc(title) + ': no comparable regions.</div>';
  }
  var sorted = rows.slice().sort(function (a, b) {
    return Math.abs(Number(b.delta_pct) || 0) - Math.abs(Number(a.delta_pct) || 0);
  });
  var body = sorted.map(function (r) {
    // "recovery" = positive delta on volume / thickness / FA / within-FC.
    var isRecovery = (Number(r.delta_pct) || 0) >= 0;
    var color = isRecovery ? '#22c55e' : '#ef4444';
    var sign = isRecovery ? '+' : '';
    var flag = r.flagged
      ? '<span style="margin-left:6px;font-size:10px;color:' + color + '">&#x25CF;</span>'
      : '';
    return '<tr>'
      + '<td style="padding:4px 8px">' + esc(r.region) + flag + '</td>'
      + '<td style="padding:4px 8px;text-align:right">' + esc(Number(r.baseline_value).toFixed(3)) + '</td>'
      + '<td style="padding:4px 8px;text-align:right">' + esc(Number(r.followup_value).toFixed(3)) + '</td>'
      + '<td style="padding:4px 8px;text-align:right;color:' + color + '">'
      + sign + esc(Number(r.delta_pct).toFixed(2)) + '%</td>'
      + '</tr>';
  }).join('');
  return '<div class="ds-mri-compare-table" style="margin:10px 0">'
    + '<div style="font-weight:600;margin-bottom:4px">' + esc(title) + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="color:var(--text-tertiary);text-align:left">'
    + '<th style="padding:4px 8px">Region</th>'
    + '<th style="padding:4px 8px;text-align:right">Baseline</th>'
    + '<th style="padding:4px 8px;text-align:right">Follow-up</th>'
    + '<th style="padding:4px 8px;text-align:right">Δ%</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>'
    + '</div>';
}

export function renderLongitudinalReport(result) {
  if (!result) return '';
  var summary = result.summary
    ? '<div class="ds-mri-compare-summary" style="padding:10px;border-radius:8px;'
      + 'background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);'
      + 'margin-bottom:10px;font-size:13px">' + esc(result.summary) + '</div>'
    : '';
  var days = result.days_between != null
    ? '<div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:8px">'
      + esc(result.days_between) + ' day(s) between visits</div>'
    : '';
  var jac = result.change_overlay_png_s3 || result.jacobian_determinant_s3;
  var overlay = jac
    ? '<div class="ds-mri-compare-overlay" style="margin-top:10px">'
      + '<div style="font-weight:600;margin-bottom:4px">Volumetric change overlay</div>'
      + '<img src="' + esc(jac) + '" alt="Longitudinal change overlay" '
      + 'style="max-width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.08)"/>'
      + '</div>'
    : '';
  var meta = result.comparison_meta || {};
  var findings = Array.isArray(meta.key_findings) ? meta.key_findings : [];
  var metaHtml = findings.length
    ? '<div class="ds-mri-compare-meta"><div class="ds-mri-compare-meta__hd">Largest changes</div>'
      + findings.map(function (item) {
        var sign = Number(item.delta_pct) > 0 ? '+' : '';
        var tone = Number(item.delta_pct) >= 0 ? '#22c55e' : '#ef4444';
        return '<div class="ds-mri-compare-meta__row"><span>' + esc(item.domain) + ' · ' + esc(item.region) + '</span><strong style="color:' + tone + '">' + sign + esc(item.delta_pct) + '%</strong></div>';
      }).join('')
      + '</div>'
    : '';
  return summary
    + days
    + metaHtml
    + _deltaTable(result.structural_changes, 'Structural change (thickness & volume)')
    + _deltaTable(result.diffusion_changes, 'Diffusion change (bundle FA)')
    + _deltaTable(result.functional_changes, 'Functional change (within-network FC)')
    + overlay;
}

// ── Bottom strip: actions ──────────────────────────────────────────────────
function renderBottomStrip(report) {
  var aid = report && report.analysis_id ? report.analysis_id : _mriAnalysisId;
  var disabled = aid ? '' : ' disabled';
  var patientId = report && report.patient && report.patient.patient_id ? report.patient.patient_id : '';
  return '<div class="ds-mri-bottom-strip">'
    + '<div class="ds-mri-bottom-strip__group">'
    + '<span class="ds-mri-bottom-strip__label">Download report</span>'
    + '<button class="btn btn-sm ds-mri-dl-pdf"'  + disabled + '>PDF</button>'
    + '<button class="btn btn-sm ds-mri-dl-html"' + disabled + '>HTML</button>'
    + '<button class="btn btn-sm ds-mri-dl-json"' + disabled + '>JSON</button>'
    + '<button class="btn btn-sm ds-mri-dl-fhir"' + disabled + '>FHIR</button>'
    + '<button class="btn btn-sm ds-mri-dl-bids"' + disabled + '>BIDS</button>'
    + '</div>'
    + '<div class="ds-mri-bottom-strip__group">'
    + _mriAnnotationButton({ patient_id: patientId, target_id: aid, anchor_label: 'MRI analysis' })
    + '<button class="btn btn-sm ds-mri-share"' + disabled + '>Share with referring provider</button>'
    + '<button class="btn btn-sm ds-mri-open-neuronav"' + disabled + '>Open in Neuronav</button>'
    + '</div>'
    + '</div>'
    + '<div id="mri-annotation-drawer-host" class="analysis-anno-host"></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Full view composition (used by tests to walk the HTML).
// ─────────────────────────────────────────────────────────────────────────────
export function renderFullView(state) {
  state = state || {};
  var report = state.report || null;
  var status = state.status || null;

  var left = renderUploader()
    + renderPatientMetaForm()
    + renderConditionSelector()
    + renderPipelineProgress(status);

  var right;
  if (!report) {
    right = renderAnalysisStateCard(state)
      + renderFusionSummaryCard(state.fusion || null, state.patientId || null);
  } else {
    // Amber "radiology review advised" banner sits above everything else
    // in the right column — safety-first surfacing per AI_UPGRADES §P0 #5.
    right = renderQCWarningsBanner(report)
      + renderPatientQCHeader(report)
      + renderFusionSummaryCard(state.fusion || null, report && report.patient && report.patient.patient_id)
      + renderMRIQCChips(report)
      + renderBrainAgeCard(report)
      + renderTargetsPanel(report)
      + renderBrainAtlasViewer(report)
      + renderGlassBrain(report)
      + renderMedRAGPanel(state.medrag || _synthesiseMedRAGFromReport(report));
  }

  return '<div class="ch-shell ds-mri-shell">'
    + renderHero(state.patientAnalyses)
    + '<div class="ds-mri-layout">'
    + '<div class="ds-mri-col ds-mri-col--left">' + left + '</div>'
    + '<div class="ds-mri-col ds-mri-col--right">' + right + '</div>'
    + '</div>'
    + renderBottomStrip(report)
    + renderRegulatoryFooter()
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────────────────────────────────────
// Zoom + pan controller for the MRI focus viewer (axial / coronal / sagittal
// slice w/ targets). Scale is clamped to [1.0, 6.0]; translate is in
// fractional units of stage size so the panned image always covers the stage
// at the current scale.
function _wireMRIFocusViewer() {
  var stage = document.getElementById('ds-mri-glass-stage');
  var pan = document.getElementById('ds-mri-glass-pan');
  var img = document.getElementById('ds-mri-glass-img');
  var overlay = document.getElementById('ds-mri-glass-overlay');
  var levelEl = document.getElementById('ds-mri-glass-zoom-level');
  var btnIn = document.getElementById('ds-mri-glass-zoom-in');
  var btnOut = document.getElementById('ds-mri-glass-zoom-out');
  var btnReset = document.getElementById('ds-mri-glass-zoom-reset');
  if (!stage || !pan) return;

  var MIN_SCALE = 1.0;
  var MAX_SCALE = 6.0;
  var state = { scale: 1.0, tx: 0, ty: 0, plane: 'axial' };

  // Project MNI mm → percent-of-image-extent for a given plane. The atlas
  // PNGs are square thumbnails of the MNI152 template; the ranges below match
  // the template extents used elsewhere in this file (axial: x∈±90, y∈[-120,80];
  // coronal: x∈±90, z∈[-70,80]; sagittal: y∈[-120,80], z∈[-70,80]).
  function projectDot(plane, mx, my, mz) {
    var x = NaN, y = NaN;
    if (plane === 'axial') {
      if (!isFinite(mx) || !isFinite(my)) return null;
      x = 50 + (mx / 90) * 45;
      y = 50 - (my / 120) * 45;
    } else if (plane === 'coronal') {
      if (!isFinite(mx) || !isFinite(mz)) return null;
      x = 50 + (mx / 90) * 45;
      y = 50 - (mz / 75) * 45;
    } else if (plane === 'sagittal') {
      if (!isFinite(my) || !isFinite(mz)) return null;
      x = 50 + (my / 120) * 45;
      y = 50 - (mz / 75) * 45;
    } else {
      return null;
    }
    return { x: x, y: y };
  }
  function repositionDots() {
    if (!overlay) return;
    var dots = overlay.querySelectorAll('.ds-mri-glass-dot');
    dots.forEach(function (d) {
      var mx = parseFloat(d.getAttribute('data-mni-x'));
      var my = parseFloat(d.getAttribute('data-mni-y'));
      var mz = parseFloat(d.getAttribute('data-mni-z'));
      var p = projectDot(state.plane, mx, my, mz);
      if (!p) {
        d.style.display = 'none';
        return;
      }
      d.style.display = '';
      d.style.left = p.x.toFixed(2) + '%';
      d.style.top = p.y.toFixed(2) + '%';
    });
  }
  function setPlane(plane) {
    if (plane === state.plane) return;
    state.plane = plane;
    if (img) {
      img.src = '/images/brain-atlas/' + plane + '.png';
      img.alt = plane.charAt(0).toUpperCase() + plane.slice(1) + ' T1 MRI template';
    }
    stage.setAttribute('data-plane', plane);
    // Reset zoom/pan when switching plane to avoid stranding the user
    // panned-out on a different orientation.
    state.scale = 1.0; state.tx = 0; state.ty = 0;
    repositionDots();
    apply();
  }

  function clampPan() {
    // Image fills stage at scale 1; at scale s the pan range is ±((s-1)/2)
    // of stage size on each axis, expressed as fractional translate input.
    var max = (state.scale - 1) / 2;
    if (state.tx > max) state.tx = max;
    if (state.tx < -max) state.tx = -max;
    if (state.ty > max) state.ty = max;
    if (state.ty < -max) state.ty = -max;
  }
  function apply() {
    clampPan();
    // Translate uses % of pan element's own size (which equals stage at scale 1).
    pan.style.transform = 'translate(' + (state.tx * 100).toFixed(2) + '%,'
      + (state.ty * 100).toFixed(2) + '%) scale(' + state.scale.toFixed(3) + ')';
    if (levelEl) levelEl.textContent = state.scale.toFixed(1) + '×';
    stage.classList.toggle('is-zoomed', state.scale > 1.001);
  }
  function setScale(next, anchor) {
    next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    if (anchor && state.scale !== next) {
      // Zoom toward the cursor: keep the anchor point under the same screen
      // pixel. anchor.x/y are 0..1 within stage; tx/ty are in frac-of-stage.
      var prevScale = state.scale;
      var ax = anchor.x - 0.5;
      var ay = anchor.y - 0.5;
      state.tx = ax + (state.tx - ax) * (next / prevScale);
      state.ty = ay + (state.ty - ay) * (next / prevScale);
    }
    state.scale = next;
    apply();
  }

  if (btnIn) btnIn.addEventListener('click', function () { setScale(state.scale * 1.4); });
  if (btnOut) btnOut.addEventListener('click', function () { setScale(state.scale / 1.4); });
  if (btnReset) btnReset.addEventListener('click', function () {
    state.scale = 1.0; state.tx = 0; state.ty = 0; apply();
  });

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = stage.getBoundingClientRect();
    var anchor = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setScale(state.scale * factor, anchor);
  }, { passive: false });

  // Drag-to-pan. Skip when at scale 1 (nothing to pan).
  var drag = null;
  stage.addEventListener('pointerdown', function (e) {
    if (state.scale <= 1.001) return;
    if (e.button !== undefined && e.button !== 0) return;
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      tx0: state.tx,
      ty0: state.ty,
      width: stage.clientWidth || 1,
      height: stage.clientHeight || 1,
    };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = (e.clientX - drag.startX) / drag.width;
    var dy = (e.clientY - drag.startY) / drag.height;
    state.tx = drag.tx0 + dx;
    state.ty = drag.ty0 + dy;
    apply();
  });
  function endDrag(e) {
    if (!drag) return;
    drag = null;
    stage.classList.remove('is-panning');
    if (e && e.pointerId !== undefined && stage.releasePointerCapture) {
      try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', endDrag);

  // Keyboard zoom for accessibility.
  stage.addEventListener('keydown', function (e) {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(state.scale * 1.4); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setScale(state.scale / 1.4); }
    else if (e.key === '0') { e.preventDefault(); state.scale = 1.0; state.tx = 0; state.ty = 0; apply(); }
  });

  // Plane toggle (axial / coronal / sagittal).
  document.querySelectorAll('.ds-mri-glass-plane').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var plane = btn.getAttribute('data-plane');
      if (!plane) return;
      document.querySelectorAll('.ds-mri-glass-plane').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      setPlane(plane);
    });
  });

  repositionDots();
  apply();
}

function _wireUploader(navigate) {
  var dz = document.getElementById('ds-mri-dropzone');
  var input = document.getElementById('ds-mri-file');
  if (!dz || !input) return;
  var openPicker = function () { input.click(); };
  dz.addEventListener('click', openPicker);
  dz.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) _handleFile(f, navigate);
  });
  input.addEventListener('change', function () {
    var f = input.files && input.files[0];
    if (f) _handleFile(f, navigate);
  });
}

async function _handleFile(file, navigate) {
  var statusEl = document.querySelector('.ds-mri-upload-status');
  if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Uploading ' + esc(file.name) + '…';
  _jobError = null;
  try {
    var patientId = (document.getElementById('ds-mri-pid') || {}).value || 'anonymous';
    var fd = new FormData();
    fd.append('file', file);
    fd.append('patient_id', patientId);
    var resp = await api.uploadMRISession(fd);
    _uploadId = (resp && resp.upload_id) || null;
    showToast('Upload complete (' + esc(file.name) + ')', 'success');
  } catch (err) {
    if (_isDemoMode()) {
      _uploadId = 'demo-' + Date.now();
      showToast('Demo mode: using synthetic upload id', 'info');
    } else {
      showToast('Upload failed: ' + (err && err.message ? err.message : err), 'error');
    }
  }
  navigate('mri-analysis');
}

function _wireRunButton(navigate) {
  var btn = document.getElementById('ds-mri-run-btn');
  var condSel = document.getElementById('ds-mri-condition');
  if (condSel) {
    condSel.addEventListener('change', function () { _selectedCondition = condSel.value; });
  }
  if (!btn) return;
  btn.addEventListener('click', async function () {
    btn.disabled = true;
    _jobError = null;
    var statusEl = document.getElementById('ds-mri-run-status');
    if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> submitting job…';
    try {
      var pidEl = document.getElementById('ds-mri-pid');
      var ageEl = document.getElementById('ds-mri-age');
      var sexEl = document.getElementById('ds-mri-sex');
      var handEl = document.getElementById('ds-mri-hand');
      var ccEl  = document.getElementById('ds-mri-cc');
      _patientMeta = {
        patient_id:  pidEl ? pidEl.value : '',
        age:         ageEl && ageEl.value ? parseInt(ageEl.value, 10) : null,
        sex:         sexEl ? sexEl.value : '',
        handedness:  handEl ? handEl.value : '',
        chief_complaint: ccEl ? ccEl.value : '',
      };
      if (_isDemoMode()) {
        _jobId = 'demo';
        _jobStatus = { stage: 'targeting', state: 'SUCCESS' };
        _report = DEMO_MRI_REPORT;
        _mriAnalysisId = DEMO_MRI_REPORT.analysis_id;
        showToast('Demo analysis loaded', 'success');
      } else {
        var resp = await api.startMRIAnalysis({
          upload_id:   _uploadId,
          patient_id:  _patientMeta.patient_id,
          condition:   _selectedCondition,
          age:         _patientMeta.age,
          sex:         _patientMeta.sex,
        });
        _jobId = (resp && resp.job_id) || null;
        _jobStatus = { stage: 'ingest', state: 'STARTED' };
        _jobError = null;
        _startJobWatch(navigate);
      }
    } catch (err) {
      _jobError = (err && err.message) ? err.message : String(err);
      showToast('Analyze failed: ' + (err && err.message ? err.message : err), 'error');
    }
    navigate('mri-analysis');
  });
}

function _startPolling(navigate) {
  if (_jobPollTimer) clearInterval(_jobPollTimer);
  _jobPollTimer = setInterval(async function () {
    if (!_jobId || _jobId === 'demo') { clearInterval(_jobPollTimer); _jobPollTimer = null; return; }
    try {
      var s = await api.getMRIStatus(_jobId);
      _jobStatus = { stage: (s && s.info && s.info.stage) || (s && s.stage) || null,
                     state: (s && s.state) || null };
      _jobError = (s && (s.error || s.detail || (s.info && s.info.error))) || null;
      var st = String(_jobStatus.state || '').toUpperCase();
      if (st === 'SUCCESS' || st === 'FAILURE') {
        clearInterval(_jobPollTimer);
        _jobPollTimer = null;
        if (st === 'SUCCESS') {
          var analysisId = (s && s.analysis_id) || _mriAnalysisId || null;
          if (analysisId) {
          try {
            _report = await api.getMRIReport(analysisId);
            _mriAnalysisId = _report && _report.analysis_id;
          } catch (_e) { /* surfaced via toast on navigate */ }
          }
        }
        navigate('mri-analysis');
      } else {
        // Update the pills in place so we don't re-render the whole page.
        var row = document.querySelector('[data-mri-pipeline-row="1"]');
        if (row) row.innerHTML = _renderPipelineRowInner(_jobStatus);
      }
    } catch (_e) { /* silent polling */ }
  }, 2000);
}

async function _startJobWatch(navigate) {
  // Prefer SSE-over-fetch so we can include Authorization headers (EventSource can't).
  // Falls back to polling when streaming is unavailable.
  if (!_jobId || _jobId === 'demo') return;
  if (_jobPollTimer) { clearInterval(_jobPollTimer); _jobPollTimer = null; }
  if (_jobWatchAbort) { try { _jobWatchAbort.abort(); } catch (_) {} _jobWatchAbort = null; }

  var token = null;
  try { token = api.getToken ? api.getToken() : null; } catch (_) { token = null; }
  var apiBase = _getApiBase();
  var url = apiBase + '/api/v1/mri/status/' + encodeURIComponent(_jobId) + '/events';
  if (!token || typeof fetch !== 'function' || typeof AbortController === 'undefined') {
    _startPolling(navigate);
    return;
  }

  var ac = new AbortController();
  _jobWatchAbort = ac;

  function stop() {
    if (_jobWatchAbort === ac) _jobWatchAbort = null;
    try { ac.abort(); } catch (_) {}
  }

  try {
    var res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'text/event-stream' },
      signal: ac.signal,
    });
    if (!res.ok || !res.body) {
      stop();
      _startPolling(navigate);
      return;
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var buf = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });

      var idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        var frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        // Parse minimal SSE: look for "data:" lines (ignore event type; backend already encodes state).
        var lines = frame.split('\n');
        var dataLines = [];
        lines.forEach(function (ln) {
          if (ln.startsWith('data:')) dataLines.push(ln.slice(5).trim());
        });
        if (!dataLines.length) continue;
        var dataText = dataLines.join('\n');
        var payload = null;
        try { payload = JSON.parse(dataText); } catch (_) { payload = null; }
        if (!payload || payload.type === 'heartbeat') continue;

        _jobStatus = {
          stage: (payload && payload.info && payload.info.stage) || payload.stage || null,
          state: (payload && payload.state) || null,
        };
        _jobError = payload.error || payload.detail || (payload.info && payload.info.error) || null;

        // In-place pipeline row update
        var row = document.querySelector('[data-mri-pipeline-row="1"]');
        if (row) row.innerHTML = _renderPipelineRowInner(_jobStatus);

        var st = String(_jobStatus.state || '').toUpperCase();
        if (st === 'SUCCESS' || st === 'FAILURE') {
          stop();
          if (st === 'SUCCESS') {
            var analysisId = payload.analysis_id || _jobId;
            try {
              _report = await api.getMRIReport(analysisId);
              _mriAnalysisId = _report && _report.analysis_id;
            } catch (_e) {}
          }
          navigate('mri-analysis');
          return;
        }
      }
    }
  } catch (_err) {
    // Abort is normal on navigation. Anything else falls back to polling.
    if (!ac.signal.aborted) {
      _startPolling(navigate);
    }
  } finally {
    if (_jobWatchAbort === ac) _jobWatchAbort = null;
  }
}

function _registerPageCleanup() {
  // Called by pgMRIAnalysis on every render; used by app.js navigate() hook.
  window._pageCleanup = async function (_ctx) {
    if (_jobPollTimer) { clearInterval(_jobPollTimer); _jobPollTimer = null; }
    if (_jobWatchAbort) { try { _jobWatchAbort.abort(); } catch (_) {} _jobWatchAbort = null; }
    try {
      var host = document.getElementById('ds-mri-progressive-viewer');
      if (host && typeof host._dsDisposeCornerstone === 'function') host._dsDisposeCornerstone();
    } catch (_) {}
  };
}

function _wireRightColumn(navigate) {
  _bindMRIAnnotationButtons();
  _wireMRIFocusViewer();

  // ── Brain Atlas Viewer toolbar buttons ──────────────────────────────────
  var clearBtn = document.getElementById('ds-atlas-clear-custom');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    _customTargets = [];
    _drawAtlasTargets(_report, _getAtlasCanvases(), _getAtlasImages());
    _refreshAtlasCustomList();
    _refreshAtlasToolbar();
    _refreshAtlasCount();
  });
  var exportBtn = document.getElementById('ds-atlas-export');
  if (exportBtn) exportBtn.addEventListener('click', function () {
    var targets = ((_report && Array.isArray(_report.stim_targets)) ? _report.stim_targets : []).concat(_customTargets);
    window._atlasExportedTargets = targets;
    var blob = new Blob([JSON.stringify(targets, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'stim_targets_export.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast(targets.length + ' target(s) exported', 'success');
  });
  var toggleBtn = document.getElementById('ds-atlas-toggle-labels');
  if (toggleBtn) toggleBtn.addEventListener('click', function () {
    _atlasLabelsVisible = !_atlasLabelsVisible;
    toggleBtn.textContent = _atlasLabelsVisible ? 'Hide labels' : 'Show labels';
    _drawAtlasTargets(_report, _getAtlasCanvases(), _getAtlasImages());
  });
  var efieldBtn = document.getElementById('ds-atlas-toggle-efield');
  if (efieldBtn) efieldBtn.addEventListener('click', function () {
    _atlasEfieldVisible = !_atlasEfieldVisible;
    efieldBtn.textContent = _atlasEfieldVisible ? 'Hide E-field' : 'Show E-field';
    _drawAtlasTargets(_report, _getAtlasCanvases(), _getAtlasImages());
  });

  document.querySelectorAll('.ds-mri-open-viewer-json').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var aid = btn.getAttribute('data-aid');
      if (!aid) return;
      try {
        var payload = await api.getMRIViewerPayload(aid);
        _openViewerPayloadModal(aid, payload);
      } catch (err) {
        showToast('Viewer payload unavailable: ' + (err && err.message ? err.message : err), 'error');
      }
    });
  });
  document.querySelectorAll('.ds-mri-copy-viewer-url').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var aid = btn.getAttribute('data-aid');
      if (!aid) return;
      var _apiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
      var text = _apiBase + '/api/v1/mri/' + encodeURIComponent(aid) + '/viewer.json';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Viewer endpoint copied', 'success');
      } catch (_err) {
        showToast(text, 'info');
      }
    });
  });
  document.querySelectorAll('.ds-mri-open-timeline').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var patientId = btn.getAttribute('data-patient');
      if (!patientId) return;
      window._patientTimelinePatientId = patientId;
      navigate('patient-timeline');
    });
  });
  document.querySelectorAll('.ds-mri-view-overlay, .ds-mri-open-overlay').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tid = btn.getAttribute('data-target');
      var aid = btn.getAttribute('data-aid')
        || (_report && _report.analysis_id)
        || _mriAnalysisId
        || 'demo';
      _openOverlayModal(aid, tid);
    });
  });
  document.querySelectorAll('.ds-mri-send-nav').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showToast('Sent target to Neuronav (stub)', 'info');
    });
  });
  document.querySelectorAll('.ds-mri-download-target').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tid = btn.getAttribute('data-target');
      var target = _report && Array.isArray(_report.stim_targets)
        ? _report.stim_targets.find(function (t) { return t.target_id === tid; })
        : null;
      if (!target) return;
      var blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = (tid || 'mri_target') + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  });

  // Bottom-strip buttons
  var aid = (_report && _report.analysis_id) || _mriAnalysisId || null;
  var _apiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  var pdfBtn = document.querySelector('.ds-mri-dl-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', function () {
    if (!aid) return;
    window.open(_apiBase + '/api/v1/mri/report/' + encodeURIComponent(aid) + '/pdf', '_blank');
  });
  var htmlBtn = document.querySelector('.ds-mri-dl-html');
  if (htmlBtn) htmlBtn.addEventListener('click', function () {
    if (!aid) return;
    window.open(_apiBase + '/api/v1/mri/report/' + encodeURIComponent(aid) + '/html', '_blank');
  });
  var jsonBtn = document.querySelector('.ds-mri-dl-json');
  if (jsonBtn) jsonBtn.addEventListener('click', function () {
    if (!_report) return;
    var blob = new Blob([JSON.stringify(_report, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'mri_report_' + (aid || 'demo') + '.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  var fhirBtn = document.querySelector('.ds-mri-dl-fhir');
  if (fhirBtn) fhirBtn.addEventListener('click', function () {
    window._mriExportFHIRBundle();
  });
  var bidsBtn = document.querySelector('.ds-mri-dl-bids');
  if (bidsBtn) bidsBtn.addEventListener('click', function () {
    window._mriExportBIDSPackage();
  });
  var shareBtn = document.querySelector('.ds-mri-share');
  if (shareBtn) shareBtn.addEventListener('click', function () {
    showToast('Sharing coming soon', 'info');
  });
  var navBtn = document.querySelector('.ds-mri-open-neuronav');
  if (navBtn) navBtn.addEventListener('click', function () {
    showToast('Neuronav integration coming soon', 'info');
  });

  // New analysis → reset state.
  var newBtn = document.getElementById('ds-mri-new-analysis');
  if (newBtn) newBtn.addEventListener('click', function () {
    _resetMRIState();
    navigate('mri-analysis');
  });
}

function _mriExportPayload() {
  var patientId = (_patientMeta && _patientMeta.patient_id) || (_report && _report.patient && _report.patient.patient_id) || null;
  if (!patientId) return null;
  return {
    patient_id: patientId,
    mri_analysis_id: (_report && _report.analysis_id) || _mriAnalysisId || null,
  };
}

async function _exportMRIArtifact(kind) {
  var payload = _mriExportPayload();
  if (!payload) {
    showToast('Run or load an MRI analysis before exporting', 'warning');
    return;
  }
  try {
    var blob = kind === 'fhir'
      ? await api.exportFHIRBundle(payload)
      : await api.exportBIDSDerivatives(payload);
    var suffix = new Date().toISOString().slice(0, 10);
    var filename = kind === 'fhir'
      ? 'mri_fhir_bundle_' + payload.patient_id + '_' + suffix + '.json'
      : 'mri_bids_derivatives_' + payload.patient_id + '_' + suffix + '.zip';
    downloadBlob(blob, filename);
    showToast(kind === 'fhir' ? 'FHIR bundle exported' : 'BIDS package exported', 'success');
  } catch (err) {
    showToast('Export failed: ' + ((err && err.message) || String(err)), 'error');
  }
}

window._mriExportFHIRBundle = function () { return _exportMRIArtifact('fhir'); };
window._mriExportBIDSPackage = function () { return _exportMRIArtifact('bids'); };

function _openOverlayModal(aid, tid) {
  var _apiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  var url = _apiBase + '/api/v1/mri/overlay/' + encodeURIComponent(aid) + '/' + encodeURIComponent(tid);
  var existing = document.getElementById('ds-mri-overlay-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'ds-mri-overlay-modal';
  modal.className = 'ds-mri-overlay-modal';
  modal.innerHTML =
    '<div class="ds-mri-overlay-modal__panel">'
    + '<div class="ds-mri-overlay-modal__head">'
    + '<strong>Overlay · ' + esc(tid) + '</strong>'
    + '<button class="btn btn-sm" id="ds-mri-overlay-close">Close</button>'
    + '</div>'
    + '<iframe class="ds-mri-overlay-modal__iframe" src="' + esc(url) + '" title="MRI overlay"></iframe>'
    + '</div>';
  document.body.appendChild(modal);
  var closeBtn = document.getElementById('ds-mri-overlay-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { modal.remove(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
}

function _openViewerPayloadModal(aid, payload) {
  var existing = document.getElementById('ds-mri-viewer-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'ds-mri-viewer-modal';
  modal.className = 'ds-mri-overlay-modal';
  modal.innerHTML =
    '<div class="ds-mri-overlay-modal__panel">'
    + '<div class="ds-mri-overlay-modal__head">'
    + '<strong>NiiVue payload · ' + esc(aid) + '</strong>'
    + '<button class="btn btn-sm" id="ds-mri-viewer-close">Close</button>'
    + '</div>'
    + '<pre style="margin:0;padding:16px;max-height:70vh;overflow:auto;background:#0f1115;color:#d6deeb;font-size:12px;line-height:1.55">'
    + esc(JSON.stringify(payload, null, 2))
    + '</pre>'
    + '</div>';
  document.body.appendChild(modal);
  var closeBtn = document.getElementById('ds-mri-viewer-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { modal.remove(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page entrypoint
// ─────────────────────────────────────────────────────────────────────────────
export async function pgMRIAnalysis(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('MRI Analyzer', '');
  _registerPageCleanup();

  var flagOn = _mriFeatureFlagEnabled();
  var el = (typeof document !== 'undefined') ? document.getElementById('content') : null;

  if (!flagOn) {
    if (el) {
      el.innerHTML = '<div class="ch-shell ds-mri-shell">'
        + '<div class="qeeg-hero"><div class="qeeg-hero__icon">&#x1F9E0;</div>'
        + '<div><div class="qeeg-hero__title">MRI Analyzer</div>'
        + '<div class="qeeg-hero__sub">Disabled by feature flag.</div></div></div>'
        + renderRegulatoryFooter() + '</div>';
    }
    return;
  }

  // Auto-demo: populate state from DEMO_MRI_REPORT so the right column
  // renders immediately on the preview deploy.
  if (_isDemoMode() && !_report) {
    _report        = DEMO_MRI_REPORT;
    _uploadId      = _uploadId || 'demo';
    _jobId         = _jobId    || 'demo';
    _mriAnalysisId = DEMO_MRI_REPORT.analysis_id;
    _jobStatus     = { stage: 'targeting', state: 'SUCCESS' };
    _patientMeta   = _patientMeta || DEMO_MRI_REPORT.patient;
  }

  // Fetch MedRAG rows when we have a real analysis id; demo falls back to
  // synthesised rows.
  var medrag = null;
  if (_report && _mriAnalysisId && _mriAnalysisId !== DEMO_MRI_REPORT.analysis_id) {
    try {
      if (!_medragCache || _medragCache.aid !== _mriAnalysisId) {
        var res = await api.getMRIMedRAG(_mriAnalysisId, 20);
        _medragCache = { aid: _mriAnalysisId, rows: (res && res.results) || [] };
      }
      medrag = _medragCache.rows;
    } catch (_e) { medrag = _synthesiseMedRAGFromReport(_report); }
  } else if (_report) {
    medrag = _synthesiseMedRAGFromReport(_report);
  }

  // Fetch the patient's completed analyses so the hero can surface the
  // "Compare ←→" button when >= 2 exist. Demo mode synthesises two rows.
  var patientAnalyses = [];
  var pid = _patientMeta && _patientMeta.patient_id;
  _fusionSummary = await _fetchFusionSummary(pid || (_report && _report.patient && _report.patient.patient_id));
  if (pid && !_isDemoMode()) {
    try {
      var res2 = await api.listPatientMRIAnalyses(pid);
      patientAnalyses = (res2 && res2.analyses) || [];
    } catch (_e) { patientAnalyses = []; }
  } else if (_isDemoMode() && _report) {
    // Demo: surface two synthetic completed analyses so the Compare
    // button renders on the preview deploy.
    patientAnalyses = [
      { analysis_id: _report.analysis_id, state: 'SUCCESS',
        condition: 'mdd', created_at: '2025-06-10T09:00:00Z' },
      { analysis_id: 'demo-baseline-2024', state: 'SUCCESS',
        condition: 'mdd', created_at: '2025-01-10T09:00:00Z' },
    ];
  }
  _patientAnalysesCache = { patientId: pid || null, rows: patientAnalyses };

  if (el) {
    el.innerHTML = renderFullView({
      report: _report,
      status: _jobStatus,
      medrag: medrag,
      fusion: _fusionSummary,
      patientId: pid || (_report && _report.patient && _report.patient.patient_id) || null,
      patientAnalyses: patientAnalyses,
    });
    _mountInlineMRIViewer(_report);
    _wireUploader(navigate);
    _wireRunButton(navigate);
    _wireRightColumn(navigate);
    _wireCompareButton(patientAnalyses);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare-button wiring (AI_UPGRADES §P0 #4)
// ─────────────────────────────────────────────────────────────────────────────
function _wireCompareButton(patientAnalyses) {
  var btn = document.getElementById('ds-mri-compare-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    _openCompareModal(patientAnalyses);
  });
}

function _openCompareModal(patientAnalyses) {
  var existing = document.getElementById('ds-mri-compare-modal');
  if (existing) existing.remove();
  var holder = document.createElement('div');
  holder.innerHTML = renderCompareModal(patientAnalyses);
  document.body.appendChild(holder.firstChild);
  var closeBtn = document.getElementById('ds-mri-compare-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      var m = document.getElementById('ds-mri-compare-modal');
      if (m) m.remove();
    });
  }
  var runBtn = document.getElementById('ds-mri-compare-run');
  if (runBtn) runBtn.addEventListener('click', _handleCompareRun);
}

async function _handleCompareRun() {
  var base = document.getElementById('ds-mri-compare-baseline');
  var fup  = document.getElementById('ds-mri-compare-followup');
  var out  = document.getElementById('ds-mri-compare-result');
  if (!base || !fup || !out) return;
  if (base.value === fup.value) {
    out.innerHTML = '<div style="color:var(--amber);font-size:12px">'
      + 'Pick two different analyses.</div>';
    return;
  }
  out.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="spinner"></span> Computing change map…</div>';
  try {
    var result = await api.compareMRI(base.value, fup.value);
    out.innerHTML = renderLongitudinalReport(result);
  } catch (err) {
    out.innerHTML = '<div style="color:var(--red);font-size:12px">'
      + 'Compare failed: ' + esc(err && err.message ? err.message : String(err))
      + '</div>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-only exports
// ─────────────────────────────────────────────────────────────────────────────
export var _INTERNALS = {
  CONDITION_OPTIONS: CONDITION_OPTIONS,
  PIPELINE_STAGES:   PIPELINE_STAGES,
  MODALITY_CLASS:    MODALITY_CLASS,
  MODALITY_DOT_COLOR: MODALITY_DOT_COLOR,
  synthesiseMedRAG:  _synthesiseMedRAGFromReport,
  isDemoMode:        _isDemoMode,
  featureFlag:       _mriFeatureFlagEnabled,
  setReport:         function (r) { _report = r; },
  setAnalysisId:     function (a) { _mriAnalysisId = a; },
  setUploadId:       function (u) { _uploadId = u; },
  setJobId:          function (j) { _jobId = j; },
  mountNiiVue:       mountNiiVue,
  getReport:         function () { return _report; },
  mniToPixel:        mniToPixel,
  pixelToMni:        pixelToMni,
  getCustomTargets:  function () { return _customTargets; },
  setCustomTargets:  function (t) { _customTargets = t; },
  _drawEfieldHeatmap: _drawEfieldHeatmap,
  _pixelsPerMm:       _pixelsPerMm,
  _computeTargetSigmaPx: _computeTargetSigmaPx,
  getEfieldVisible:   function () { return _atlasEfieldVisible; },
  setEfieldVisible:   function (v) { _atlasEfieldVisible = v; },
};
