css = """

/* =============================================================================
   hp-* — Home Programs Page
   ============================================================================= */
.hp-loading { padding: 40px; text-align: center; color: var(--text-muted); }
.hp-page { display: flex; flex-direction: column; gap: 18px; padding: 20px; max-width: 1400px; }
.hp-empty { padding: 32px; text-align: center; color: var(--text-muted); font-size: .85rem; }

/* Summary strip */
.hp-summary-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.hp-chip { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.hp-chip-val { font-size: 1.5rem; font-weight: 700; color: var(--text); }
.hp-chip-lbl { font-size: .71rem; color: var(--text-muted); text-align: center; }
.hp-chip-amber  { border-color: #f59e0b; background: #fffbeb; }  .hp-chip-amber .hp-chip-val  { color: #d97706; }
.hp-chip-red    { border-color: #ef4444; background: #fef2f2; }  .hp-chip-red .hp-chip-val    { color: #dc2626; }
.hp-chip-green  { border-color: #22c55e; background: #f0fdf4; }  .hp-chip-green .hp-chip-val  { color: #16a34a; }
.hp-chip-purple { border-color: #a855f7; background: #faf5ff; }  .hp-chip-purple .hp-chip-val { color: #9333ea; }

/* Top actions */
.hp-top-actions { display: flex; gap: 8px; align-items: center; }

/* Cards */
.hp-card { background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.hp-card-title { font-size: .8rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 13px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.hp-queue-count { font-size: .75rem; font-weight: 600; background: var(--accent-soft,#eff6ff); color: var(--accent,#3b82f6); padding: 2px 8px; border-radius: 12px; }

/* Filter bar */
.hp-filter-bar { display: flex; gap: 8px; padding: 10px 18px; background: var(--bg-soft,#f9fafb); border-bottom: 1px solid var(--border); }
.hp-search { flex: 1; border: 1px solid var(--border); border-radius: 7px; padding: 7px 11px; font-size: .82rem; background: var(--bg-card,#fff); color: var(--text); }
.hp-filter-sel { border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px; font-size: .8rem; background: var(--bg-card,#fff); color: var(--text); cursor: pointer; }

/* Queue header */
.hp-queue-header { display: grid; grid-template-columns: 36px 1fr 110px 90px 110px 1fr; gap: 0 12px; padding: 8px 18px; background: var(--bg-soft,#f9fafb); font-size: .7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--border); }

/* Sections */
.hp-section { }
.hp-section-header { display: flex; align-items: center; gap: 8px; padding: 9px 18px; background: var(--bg-soft,#f9fafb); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.hp-section-title { font-size: .78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.hp-section-badge { font-size: .72rem; background: var(--accent-soft,#eff6ff); color: var(--accent,#3b82f6); padding: 2px 7px; border-radius: 10px; font-weight: 600; }
.hp-section-today .hp-section-header { background: #fffbeb; border-color: #fde68a; }
.hp-section-today .hp-section-title { color: #b45309; }
.hp-section-overdue .hp-section-header { background: #fef2f2; border-color: #fecaca; }
.hp-section-overdue .hp-section-title { color: #dc2626; }
.hp-section-done .hp-section-header { background: #f0fdf4; border-color: #bbf7d0; }
.hp-section-done .hp-section-title { color: #16a34a; }

/* Task rows */
.hp-task-row { display: grid; grid-template-columns: 36px 1fr 110px 90px 110px 1fr; gap: 0 12px; padding: 11px 18px; border-bottom: 1px solid var(--border); align-items: center; cursor: pointer; transition: background .12s; }
.hp-task-row:hover { background: var(--bg-hover,#f1f5f9); }
.hp-task-row:last-child { border-bottom: none; }
.hp-task-done { opacity: .65; }
.hp-task-type { font-size: 1.2rem; text-align: center; }
.hp-task-main { min-width: 0; }
.hp-task-title { font-weight: 600; font-size: .85rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hp-task-meta { display: flex; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
.hp-task-pt { font-size: .75rem; color: var(--accent,#3b82f6); cursor: pointer; font-weight: 500; }
.hp-task-pt:hover { text-decoration: underline; }
.hp-task-reason { font-size: .75rem; color: var(--text-muted); }
.hp-task-course { font-size: .75rem; color: var(--text-muted); }
.hp-task-freq { font-size: .78rem; color: var(--text-muted); }
.hp-task-due { font-size: .8rem; font-weight: 500; color: var(--text); }

/* Badges */
.hp-badge { display: inline-block; padding: 3px 9px; border-radius: 12px; font-size: .71rem; font-weight: 600; }
.hp-badge-green { background: #dcfce7; color: #16a34a; }
.hp-badge-amber { background: #fef3c7; color: #b45309; }
.hp-badge-red   { background: #fee2e2; color: #dc2626; }
.hp-badge-blue  { background: #dbeafe; color: #1d4ed8; }
.hp-badge-grey  { background: #e2e8f0; color: #475569; }

/* Action buttons */
.hp-task-actions { display: flex; align-items: center; gap: 5px; position: relative; }
.hp-act-btn { padding: 4px 10px; border-radius: 6px; font-size: .73rem; font-weight: 500; border: 1px solid var(--border); background: var(--bg-card,#fff); color: var(--text); cursor: pointer; white-space: nowrap; }
.hp-act-btn:hover { background: var(--bg-hover,#f1f5f9); }
.hp-act-primary { background: var(--accent,#3b82f6); color: #fff; border-color: var(--accent,#3b82f6); }
.hp-act-primary:hover { background: #2563eb; }
.hp-act-active { background: var(--bg-hover,#f1f5f9); border-color: var(--accent,#3b82f6); color: var(--accent,#3b82f6); }
.hp-act-more { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; color: var(--text-muted); background: var(--bg-card,#fff); }
.hp-act-more:hover { background: var(--bg-hover,#f1f5f9); }
.hp-act-dropdown { display: none; position: absolute; top: 32px; right: 0; background: var(--bg-card,#fff); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,.13); z-index: 200; min-width: 160px; overflow: hidden; }
.hp-drop-open { display: block !important; }
.hp-act-dropdown div { padding: 9px 14px; font-size: .8rem; color: var(--text); cursor: pointer; }
.hp-act-dropdown div:hover { background: var(--bg-hover,#f1f5f9); }

/* Adherence grid */
.hp-adh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; padding: 16px; }
.hp-adh-card { border: 1px solid var(--border); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.hp-adh-name { font-weight: 600; font-size: .85rem; color: var(--accent,#3b82f6); cursor: pointer; }
.hp-adh-name:hover { text-decoration: underline; }
.hp-adh-bar-wrap { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.hp-adh-bar { height: 8px; border-radius: 4px; transition: width .4s ease; }
.hp-adh-stats { display: flex; gap: 10px; font-size: .76rem; color: var(--text-muted); align-items: center; }
.hp-adh-overdue { color: #dc2626; font-weight: 600; }
.hp-adh-actions { display: flex; gap: 6px; }

/* Templates grid */
.hp-tpl-grid { display: flex; flex-direction: column; gap: 0; }
.hp-tpl-card { display: flex; align-items: flex-start; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.hp-tpl-card:last-child { border-bottom: none; }
.hp-tpl-icon { font-size: 1.4rem; min-width: 28px; text-align: center; padding-top: 2px; }
.hp-tpl-body { flex: 1; min-width: 0; }
.hp-tpl-title { font-weight: 600; font-size: .85rem; color: var(--text); }
.hp-tpl-meta { font-size: .75rem; color: var(--text-muted); margin: 2px 0 4px; }
.hp-tpl-desc { font-size: .78rem; color: var(--text-muted); line-height: 1.4; }

/* Modal */
.hp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.hp-modal { background: var(--bg-card,#fff); border-radius: 14px; width: 520px; max-width: 95vw; max-height: 88vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,.2); }
.hp-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); font-weight: 700; font-size: .95rem; }
.hp-modal-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--text-muted); padding: 2px 6px; border-radius: 4px; }
.hp-modal-close:hover { background: var(--bg-hover,#f1f5f9); }
.hp-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.hp-modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
.hp-modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hp-lbl { font-size: .76rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; display: block; }
.hp-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 7px; padding: 8px 11px; font-size: .85rem; background: var(--bg-card,#fff); color: var(--text); }
.hp-input:focus { outline: none; border-color: var(--accent,#3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.hp-textarea { min-height: 80px; resize: vertical; font-family: inherit; }

/* Responsive */
@media (max-width: 1100px) {
  .hp-queue-header, .hp-task-row { grid-template-columns: 36px 1fr 90px 90px 1fr; }
  .hp-task-freq { display: none; }
  .hp-queue-header span:nth-child(3) { display: none; }
}
@media (max-width: 800px) {
  .hp-summary-strip { grid-template-columns: repeat(3, 1fr); }
  .hp-queue-header, .hp-task-row { grid-template-columns: 36px 1fr 100px 1fr; }
  .hp-task-due { display: none; }
  .hp-queue-header span:nth-child(4) { display: none; }
}
@media (max-width: 560px) {
  .hp-summary-strip { grid-template-columns: repeat(2, 1fr); }
  .hp-filter-bar { flex-direction: column; }
}
"""

target = r'C:\Users\yildi\DeepSynaps-Protocol-Studio\apps\web\src\styles.css'
with open(target, 'a', encoding='utf-8') as f:
    f.write(css)
print('Done appending hp-* CSS')
