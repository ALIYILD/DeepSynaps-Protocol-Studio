css = """

/* =============================================================================
   prot-* — Protocol Intelligence Pages
   ============================================================================= */
.prot-loading { padding: 40px; text-align: center; color: var(--text-muted); }
.prot-empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: .85rem; }

/* Summary strip */
.prot-summary-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; padding: 20px 20px 0; }
.prot-chip { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 10px; padding: 13px 16px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.prot-chip-val { font-size: 1.4rem; font-weight: 700; color: var(--text); }
.prot-chip-lbl { font-size: .7rem; color: var(--text-muted); text-align: center; }
.prot-chip-green  { border-color:#22c55e; background:#f0fdf4; } .prot-chip-green .prot-chip-val  { color:#16a34a; }
.prot-chip-blue   { border-color:#3b82f6; background:#eff6ff; } .prot-chip-blue .prot-chip-val   { color:#1d4ed8; }
.prot-chip-purple { border-color:#a855f7; background:#faf5ff; } .prot-chip-purple .prot-chip-val { color:#7c3aed; }

/* Page layout */
.prot-page { display: flex; flex-direction: column; gap: 16px; padding: 20px; }
.prot-body { display: grid; grid-template-columns: 200px 1fr; gap: 20px; align-items: start; }

/* Sidebar */
.prot-sidebar { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; padding: 14px; position: sticky; top: 20px; }
.prot-sidebar-title { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); padding: 8px 0 4px; }
.prot-cat-item { padding: 7px 10px; border-radius: 7px; font-size: .8rem; color: var(--text-muted); cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
.prot-cat-item:hover { background: var(--bg-hover,#f1f5f9); color: var(--text); }
.prot-cat-active { background: var(--accent-soft,#eff6ff); color: var(--accent,#3b82f6); font-weight: 600; }
.prot-cat-count { font-size: .7rem; background: var(--bg-soft,#f1f5f9); padding: 1px 6px; border-radius: 10px; }
.prot-sidebar-btn { display: block; width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-card,#fff); color: var(--text); font-size: .78rem; cursor: pointer; text-align: center; }
.prot-sidebar-btn:hover { background: var(--bg-hover,#f1f5f9); }

/* Filter bar */
.prot-results-header { padding: 0 0 8px; display: flex; align-items: center; justify-content: space-between; }
.prot-results-count { font-size: .82rem; color: var(--text-muted); font-weight: 500; }
.prot-filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.prot-search { flex: 1; min-width: 200px; border: 1px solid var(--border); border-radius: 7px; padding: 8px 12px; font-size: .82rem; background: var(--bg-card,#fff); color: var(--text); }
.prot-filter-sel { border: 1px solid var(--border); border-radius: 7px; padding: 7px 9px; font-size: .78rem; background: var(--bg-card,#fff); color: var(--text); cursor: pointer; max-width: 160px; }
.prot-view-toggle { display: flex; gap: 4px; }
.prot-view-btn { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card,#fff); color: var(--text-muted); cursor: pointer; font-size: .85rem; }
.prot-view-btn.active { background: var(--accent,#3b82f6); color: #fff; border-color: var(--accent,#3b82f6); }

/* Protocol cards */
.prot-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.prot-card-grid-full { padding-top: 4px; }
.prot-card { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; padding: 16px; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
.prot-card:hover { border-color: var(--accent,#3b82f6); box-shadow: 0 2px 16px rgba(59,130,246,.12); }
.prot-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.prot-device-icon { font-size: 1.3rem; }
.prot-card-cond { font-size: .75rem; font-weight: 600; color: var(--text-muted); flex: 1; }
.prot-card-name { font-weight: 600; font-size: .88rem; color: var(--text); line-height: 1.3; margin-bottom: 6px; }
.prot-card-target { font-size: .75rem; color: var(--text-muted); margin-bottom: 8px; }
.prot-card-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.prot-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.prot-card-params { font-size: .72rem; color: var(--text-muted); }

/* Protocol list */
.prot-list-header { display: grid; grid-template-columns: 36px 1fr 150px 100px 160px 80px 80px; gap: 0 10px; padding: 8px 16px; background: var(--bg-soft,#f9fafb); border: 1px solid var(--border); border-radius: 10px 10px 0 0; font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.prot-list { border: 1px solid var(--border); border-top: none; border-radius: 0 0 10px 10px; overflow: hidden; }
.prot-row { display: grid; grid-template-columns: 36px 1fr 150px 100px 160px 80px 80px; gap: 0 10px; padding: 11px 16px; border-bottom: 1px solid var(--border); align-items: center; cursor: pointer; transition: background .12s; }
.prot-row:hover { background: var(--bg-hover,#f1f5f9); }
.prot-row:last-child { border-bottom: none; }
.prot-row-icon { font-size: 1.2rem; }
.prot-row-name { font-weight: 600; font-size: .83rem; color: var(--text); }
.prot-row-cond { font-size: .73rem; color: var(--text-muted); }
.prot-row-actions { display: flex; gap: 4px; }

/* By-condition view */
.prot-cond-group { margin-bottom: 24px; }
.prot-cond-header { display: flex; align-items: center; gap: 12px; padding: 10px 0 10px; border-bottom: 2px solid var(--border); margin-bottom: 12px; }
.prot-cond-label { font-size: .9rem; font-weight: 700; color: var(--text); }
.prot-cond-meta { font-size: .75rem; color: var(--text-muted); }
.prot-cond-devices { display: flex; gap: 4px; margin-left: auto; font-size: 1rem; }

/* Badges */
.prot-gov-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: .68rem; font-weight: 600; }
.prot-evidence-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: .68rem; font-weight: 700; }
.prot-type-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: .68rem; font-weight: 600; border: 1px solid; }
.prot-use-btn { padding: 5px 12px; border-radius: 6px; font-size: .75rem; font-weight: 600; background: var(--accent,#3b82f6); color: #fff; border: none; cursor: pointer; white-space: nowrap; }
.prot-use-btn:hover { background: #2563eb; }

/* Detail page */
.prot-detail-page { padding: 20px; max-width: 1200px; }
.prot-detail-back { font-size: .8rem; color: var(--accent,#3b82f6); cursor: pointer; margin-bottom: 16px; display: inline-block; }
.prot-detail-back:hover { text-decoration: underline; }
.prot-detail-hero { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 14px; padding: 24px; display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; }
.prot-detail-hero-icon { font-size: 2.5rem; min-width: 48px; text-align: center; }
.prot-detail-hero-body { flex: 1; }
.prot-detail-name { font-size: 1.3rem; font-weight: 700; color: var(--text); margin: 0 0 8px; }
.prot-detail-hero-meta { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.prot-cond-pill { font-size: .78rem; font-weight: 600; background: var(--accent-soft,#eff6ff); color: var(--accent,#3b82f6); padding: 3px 10px; border-radius: 12px; }
.prot-device-pill { font-size: .78rem; color: var(--text-muted); }
.prot-detail-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.prot-detail-hero-actions { display: flex; flex-direction: column; gap: 8px; min-width: 160px; }
.prot-detail-use-btn { padding: 9px 16px; border-radius: 8px; font-size: .85rem; font-weight: 600; background: var(--accent,#3b82f6); color: #fff; border: none; cursor: pointer; }
.prot-detail-use-btn:hover { background: #2563eb; }
.prot-detail-edit-btn { padding: 9px 16px; border-radius: 8px; font-size: .85rem; font-weight: 500; background: var(--bg-card,#fff); color: var(--text); border: 1px solid var(--border); cursor: pointer; }
.prot-detail-edit-btn:hover { background: var(--bg-hover,#f1f5f9); }

.prot-detail-grid { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
.prot-detail-card { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.prot-detail-card-title { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin-bottom: 12px; }
.prot-detail-target { font-size: .9rem; font-weight: 600; color: var(--text); }
.prot-detail-notes { font-size: .85rem; color: var(--text); line-height: 1.5; }
.prot-detail-list { margin: 0; padding-left: 20px; font-size: .82rem; color: var(--text); line-height: 1.7; }
.prot-contra-card { border-color: #fecaca; background: #fef2f2; }
.prot-contra-list { color: #dc2626; }
.prot-ref-list { font-size: .78rem; font-style: italic; }
.prot-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.prot-tag { display: inline-block; padding: 3px 9px; border-radius: 10px; font-size: .72rem; background: var(--bg-soft,#f1f5f9); color: var(--text-muted); }

/* Parameter table */
.prot-param-table { width: 100%; border-collapse: collapse; font-size: .83rem; }
.prot-param-table tr { border-bottom: 1px solid var(--border); }
.prot-param-table tr:last-child { border-bottom: none; }
.prot-param-lbl { padding: 6px 0; color: var(--text-muted); width: 50%; }
.prot-param-val { padding: 6px 0; font-weight: 600; color: var(--text); }

/* AI / scan cards */
.prot-ai-card { border-color: #e9d5ff; background: #faf5ff; }
.prot-scan-card { border-color: #bae6fd; background: #f0f9ff; }
.prot-ai-row { font-size: .82rem; color: var(--text); margin-bottom: 8px; line-height: 1.5; }
.prot-ai-row ul { margin: 4px 0 0 16px; padding: 0; }
.prot-ai-row li { margin-bottom: 3px; }

/* Related protocols */
.prot-related-list { display: flex; flex-direction: column; gap: 6px; }
.prot-related-item { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 8px; cursor: pointer; }
.prot-related-item:hover { background: var(--bg-hover,#f1f5f9); }
.prot-related-icon { font-size: 1.1rem; }
.prot-related-name { font-size: .82rem; font-weight: 600; color: var(--text); }
.prot-related-meta { display: flex; gap: 4px; margin-top: 3px; }

/* ── Builder page ────────────────────────────────────────────────────────── */
.prot-builder-page { padding: 20px; max-width: 1300px; }
.prot-builder-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.prot-back-btn { padding: 6px 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-card,#fff); color: var(--text); font-size: .8rem; cursor: pointer; }
.prot-back-btn:hover { background: var(--bg-hover,#f1f5f9); }
.prot-builder-editing { font-size: .85rem; color: var(--text-muted); font-style: italic; }
.prot-builder-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
.prot-b-section { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.prot-b-section-title { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin-bottom: 14px; }
.prot-b-lbl { font-size: .73rem; font-weight: 600; color: var(--text-muted); display: block; margin: 10px 0 4px; }
.prot-b-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 7px; padding: 8px 11px; font-size: .83rem; background: var(--bg-card,#fff); color: var(--text); }
.prot-b-input:focus { outline: none; border-color: var(--accent,#3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.prot-b-input-lg { font-size: .9rem; padding: 10px 12px; font-weight: 500; }
.prot-b-textarea { width: 100%; min-height: 80px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 7px; padding: 8px 11px; font-size: .82rem; background: var(--bg-card,#fff); color: var(--text); resize: vertical; font-family: inherit; }
.prot-b-code { font-family: 'Courier New', monospace; font-size: .78rem; }
.prot-b-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0; }
.prot-b-params-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-top: 10px; }
.prot-param-field { display: flex; flex-direction: column; }
.prot-param-lbl-b { font-size: .7rem; font-weight: 600; color: var(--text-muted); margin-bottom: 3px; }

/* Grade buttons */
.prot-b-grade-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.prot-grade-btn { padding: 6px 12px; border-radius: 7px; font-size: .78rem; font-weight: 600; border: 1px solid var(--border); background: var(--bg-card,#fff); color: var(--text-muted); cursor: pointer; }
.prot-grade-btn:hover { border-color: var(--accent,#3b82f6); }
.prot-grade-active { }
.prot-grade-desc { font-size: .72rem; color: var(--text-muted); margin-top: 8px; font-style: italic; }

/* Governance checkboxes */
.prot-gov-checks { display: flex; flex-direction: column; gap: 6px; }
.prot-gov-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: .8rem; }
.prot-gov-check input { width: 15px; height: 15px; cursor: pointer; }

/* Preview card */
.prot-preview-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px; background: var(--bg-soft,#f9fafb); }
.prot-preview-name { font-weight: 700; font-size: .88rem; color: var(--text); margin-bottom: 4px; }
.prot-preview-cond { font-size: .75rem; color: var(--text-muted); margin-bottom: 8px; }
.prot-preview-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.prot-preview-params { display: flex; gap: 8px; font-size: .75rem; color: var(--text-muted); }
.prot-preview-params span { background: var(--bg-card,#fff); border: 1px solid var(--border); padding: 2px 8px; border-radius: 8px; }

/* Builder actions */
.prot-b-actions { display: flex; flex-direction: column; gap: 8px; }
.prot-b-save-btn { padding: 10px 16px; border-radius: 8px; font-size: .85rem; font-weight: 600; background: var(--bg-card,#fff); color: var(--text); border: 1px solid var(--border); cursor: pointer; }
.prot-b-save-btn:hover { background: var(--bg-hover,#f1f5f9); }
.prot-b-submit-btn { padding: 10px 16px; border-radius: 8px; font-size: .85rem; font-weight: 600; background: var(--accent,#3b82f6); color: #fff; border: none; cursor: pointer; }
.prot-b-submit-btn:hover { background: #2563eb; }
.prot-b-success { margin-top: 10px; padding: 8px 12px; border-radius: 7px; background: #dcfce7; color: #16a34a; font-size: .8rem; font-weight: 600; }

/* Responsive */
@media (max-width: 1200px) {
  .prot-body { grid-template-columns: 1fr; }
  .prot-sidebar { position: static; display: none; }
  .prot-detail-grid { grid-template-columns: 1fr; }
  .prot-builder-grid { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .prot-summary-strip { grid-template-columns: repeat(3, 1fr); }
  .prot-detail-hero { flex-direction: column; }
  .prot-list-header, .prot-row { grid-template-columns: 36px 1fr 100px 80px; }
  .prot-row-type, .prot-row-params { display: none; }
}
@media (max-width: 600px) {
  .prot-summary-strip { grid-template-columns: repeat(2, 1fr); }
  .prot-filter-bar { flex-direction: column; }
  .prot-b-row, .prot-b-params-grid { grid-template-columns: 1fr; }
}
"""

target = r'C:\Users\yildi\DeepSynaps-Protocol-Studio\apps\web\src\styles.css'
with open(target, 'a', encoding='utf-8') as f:
    f.write(css)
print('Done appending prot-* CSS')
