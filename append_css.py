css = r"""

/* ═══════════════════════════════════════════════════════════════════════════
   pm-* — Patient Monitoring & Remote Follow-Up Page
   ═══════════════════════════════════════════════════════════════════════════ */
.pm-loading { padding: 40px; color: var(--text-muted); text-align: center; }
.pm-page { display: flex; flex-direction: column; gap: 20px; padding: 20px; max-width: 1600px; }

/* Summary strip */
.pm-summary-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.pm-chip { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.pm-chip-val { font-size: 1.6rem; font-weight: 700; color: var(--text); }
.pm-chip-lbl { font-size: .72rem; color: var(--text-muted); text-align: center; }
.pm-chip-green { border-color: #22c55e; background: #f0fdf4; }
.pm-chip-green .pm-chip-val { color: #16a34a; }
.pm-chip-red { border-color: #ef4444; background: #fef2f2; }
.pm-chip-red .pm-chip-val { color: #dc2626; }
.pm-chip-amber { border-color: #f59e0b; background: #fffbeb; }
.pm-chip-amber .pm-chip-val { color: #d97706; }
.pm-chip-grey { border-color: #94a3b8; background: #f8fafc; }
.pm-chip-grey .pm-chip-val { color: #475569; }

/* Cards */
.pm-card { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.pm-card-title { font-size: .82rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }

/* Filter bar */
.pm-filter-bar { display: flex; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--bg-soft,#f9fafb); }
.pm-search { flex: 1; border: 1px solid var(--border); border-radius: 7px; padding: 7px 12px; font-size: .82rem; background: var(--bg-card,#fff); color: var(--text); }
.pm-filter-sel { border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px; font-size: .82rem; background: var(--bg-card,#fff); color: var(--text); cursor: pointer; }

/* Queue header */
.pm-queue-header { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1.5fr 2fr 100px 1fr; gap: 0 12px; padding: 8px 18px; background: var(--bg-soft,#f9fafb); font-size: .72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--border); }
.pm-queue-count { font-size: .75rem; font-weight: 600; background: var(--accent-soft,#eff6ff); color: var(--accent,#3b82f6); padding: 2px 8px; border-radius: 12px; }

/* Patient rows */
.pm-queue-rows { max-height: 480px; overflow-y: auto; }
.pm-pat-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1.5fr 2fr 100px 1fr; gap: 0 12px; padding: 11px 18px; border-bottom: 1px solid var(--border); align-items: center; cursor: pointer; transition: background .15s; }
.pm-pat-row:hover { background: var(--bg-hover,#f1f5f9); }
.pm-pat-name { font-weight: 600; font-size: .85rem; color: var(--text); }
.pm-pat-condition, .pm-pat-modality, .pm-pat-reason { font-size: .8rem; color: var(--text-muted); }
.pm-pat-signal { font-size: .78rem; color: var(--text); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-empty-queue { padding: 30px; text-align: center; color: var(--text-muted); font-size: .85rem; }

/* Status badges */
.pm-badge { display: inline-block; padding: 3px 9px; border-radius: 12px; font-size: .72rem; font-weight: 600; }
.pm-badge-green { background: #dcfce7; color: #16a34a; }
.pm-badge-amber { background: #fef3c7; color: #b45309; }
.pm-badge-red { background: #fee2e2; color: #dc2626; }
.pm-badge-grey { background: #e2e8f0; color: #475569; }

/* Tags */
.pm-tag { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: .7rem; font-weight: 500; margin-right: 4px; }
.pm-tag-red { background: #fee2e2; color: #dc2626; }
.pm-tag-amber { background: #fef3c7; color: #b45309; }
.pm-tag-grey { background: #e2e8f0; color: #475569; }

/* Action buttons */
.pm-pat-actions { display: flex; align-items: center; gap: 5px; position: relative; }
.pm-act-btn { padding: 4px 9px; border-radius: 6px; font-size: .73rem; font-weight: 500; border: 1px solid var(--border); background: var(--bg-card,#fff); color: var(--text); cursor: pointer; white-space: nowrap; }
.pm-act-btn:hover { background: var(--bg-hover,#f1f5f9); }
.pm-act-primary { background: var(--accent,#3b82f6); color: #fff; border-color: var(--accent,#3b82f6); }
.pm-act-primary:hover { background: #2563eb; }
.pm-act-more { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-card,#fff); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; color: var(--text-muted); }
.pm-act-more:hover { background: var(--bg-hover,#f1f5f9); }
.pm-act-dropdown { display: none; position: absolute; top: 32px; right: 0; background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12); z-index: 100; min-width: 170px; overflow: hidden; }
.pm-act-dropdown.pm-act-open { display: block; }
.pm-act-dropdown div { padding: 9px 14px; font-size: .8rem; color: var(--text); cursor: pointer; }
.pm-act-dropdown div:hover { background: var(--bg-hover,#f1f5f9); }

/* Lower grid */
.pm-lower-grid { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }

/* Domains */
.pm-domains-card { }
.pm-domain { border-bottom: 1px solid var(--border); }
.pm-domain:last-child { border-bottom: none; }
.pm-domain-header { padding: 12px 18px; font-size: .78rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; background: var(--bg-soft,#f9fafb); }
.pm-domain-icon { font-size: 1rem; }
.pm-domain-empty { padding: 12px 18px; font-size: .78rem; color: var(--text-muted); font-style: italic; }
.pm-domain-row { display: flex; align-items: center; gap: 12px; padding: 9px 18px; border-top: 1px solid var(--border); cursor: pointer; }
.pm-domain-row:hover { background: var(--bg-hover,#f1f5f9); }
.pm-domain-name { font-weight: 500; font-size: .82rem; color: var(--text); min-width: 140px; }
.pm-domain-signal { flex: 1; font-size: .78rem; color: var(--text-muted); }

/* Needs Review panel */
.pm-review-card { }
.pm-review-title { color: #dc2626; }
.pm-review-rows { max-height: 600px; overflow-y: auto; }
.pm-review-row { padding: 14px 18px; border-bottom: 1px solid var(--border); }
.pm-review-row:last-child { border-bottom: none; }
.pm-review-name { font-weight: 600; font-size: .85rem; color: var(--text); margin-bottom: 3px; }
.pm-review-reason { font-size: .78rem; color: var(--text-muted); margin-bottom: 6px; }
.pm-review-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pm-review-actions { display: flex; gap: 6px; }

/* Responsive */
@media (max-width: 1200px) {
  .pm-summary-strip { grid-template-columns: repeat(3, 1fr); }
  .pm-lower-grid { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .pm-queue-header, .pm-pat-row { grid-template-columns: 1fr 1fr 80px 1fr; }
  .pm-pat-modality, .pm-pat-reason, .pm-pat-signal { display: none; }
  .pm-queue-header span:nth-child(3), .pm-queue-header span:nth-child(4), .pm-queue-header span:nth-child(5) { display: none; }
}
@media (max-width: 600px) {
  .pm-summary-strip { grid-template-columns: repeat(2, 1fr); }
  .pm-filter-bar { flex-direction: column; }
}
"""

target = r'C:\Users\yildi\DeepSynaps-Protocol-Studio\apps\web\src\styles.css'
with open(target, 'a', encoding='utf-8') as f:
    f.write(css)

print('Done appending pm-* CSS')
