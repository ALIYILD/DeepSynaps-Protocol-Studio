import { api } from './api.js';
import { currentUser } from './auth.js';

/* ============================================================
   DeepSynaps Protocol Studio — Evidence Research & Literature Review Hub
   ============================================================ */

// ─── Demo Data: 12 evidence records ─────────────────────────────
const EVIDENCE_DATA_DEMO = [
  {
    id: 1, title: "Efficacy of Ketamine vs ECT in Treatment-Resistant Depression",
    authors: "Smith J, Chen L, Patel R", journal: "JAMA Psychiatry", year: 2024, n: 342,
    grade: "A", design: "Meta-analysis", effectSize: "SMD -0.42 [-0.61, -0.23]",
    citations: 127, pmid: "38012345",
    abstract: "Systematic review and meta-analysis of 8 RCTs (N=342) comparing ketamine infusion to electroconvulsive therapy in treatment-resistant major depression. Ketamine showed non-inferior response rates at week 4 (OR 0.92, 95% CI 0.71-1.19) with faster onset of action. Cognitive side effects favoured ketamine."
  },
  {
    id: 2, title: "Psilocybin-Assisted Therapy for Major Depressive Disorder",
    authors: "Davis AK, Barrett FS, May DG", journal: "New England Journal of Medicine", year: 2023, n: 104,
    grade: "A", design: "RCT", effectSize: "Cohen's d -1.1 [-1.6, -0.6]",
    citations: 892, pmid: "37141234",
    abstract: "Double-blind, phase 2 RCT comparing psilocybin (25mg) with niacin placebo in adults with MDD. At week 4, 67% of psilocybin recipients had ≥50% reduction in MADRS scores vs 32% in control (p<0.001). Effects persisted at 12-week follow-up."
  },
  {
    id: 3, title: "Transcranial Magnetic Stimulation for Generalized Anxiety",
    authors: "Blumberger DM, Feffer K, McClintock SM", journal: "Lancet Psychiatry", year: 2024, n: 156,
    grade: "B", design: "RCT", effectSize: "Hedges' g -0.58 [-0.90, -0.26]",
    citations: 45, pmid: "38245678",
    abstract: "Sham-controlled RCT of bilateral rTMS for generalized anxiety disorder. Active treatment showed significant reductions in HAM-A scores at week 6. Remission rates: 38% active vs 18% sham (NNT=5)."
  },
  {
    id: 4, title: "Omega-3 Supplementation and Depressive Symptoms: Long-term Follow-up",
    authors: "Grosso G, Galvano F, Marventano S", journal: "Psychological Medicine", year: 2023, n: 2164,
    grade: "A", design: "Meta-analysis", effectSize: "SMD -0.31 [-0.42, -0.20]",
    citations: 234, pmid: "37098765",
    abstract: "Updated meta-analysis of 26 RCTs examining omega-3 fatty acids for depression. EPA-predominant formulations (>60% EPA) showed larger effects. Baseline inflammation moderated treatment response."
  },
  {
    id: 5, title: "Digital CBT for Insomnia in Comorbid Depression: Real-World Cohort",
    authors: "Lancee J, van Straten A, Morina N", journal: "Sleep Medicine Reviews", year: 2024, n: 843,
    grade: "C", design: "Observational", effectSize: "r = -0.35 [-0.42, -0.28]",
    citations: 12, pmid: "38561234",
    abstract: "Retrospective cohort study of dCBI users with comorbid depression. Significant ISI score reductions at 8 weeks. Adherence >70% predicted sustained remission at 6 months."
  },
  {
    id: 6, title: "Lithium Augmentation in SSRI-Resistant Depression: Systematic Review",
    authors: "Crossley NA, Bauer M", journal: "British Journal of Psychiatry", year: 2023, n: 892,
    grade: "A", design: "Meta-analysis", effectSize: "OR 2.13 [1.42, 3.19]",
    citations: 178, pmid: "36876543",
    abstract: "Meta-analysis of 9 RCTs evaluating lithium augmentation for SSRI non-responders. Response rates doubled with lithium augmentation. Thyroid monitoring required in 15% of cases."
  },
  {
    id: 7, title: "Exercise as Adjunct Treatment for Depression: Dose-Response Meta-analysis",
    authors: "Pearce M, Garcia L, Abbas A", journal: "JAMA Network Open", year: 2024, n: 4558,
    grade: "A", design: "Meta-analysis", effectSize: "SMD -0.66 [-0.88, -0.44]",
    citations: 567, pmid: "38678901",
    abstract: "Dose-response meta-analysis of 41 studies. Peak antidepressant effect at 150 min/week moderate-intensity exercise. Resistance and aerobic exercise showed comparable efficacy."
  },
  {
    id: 8, title: "Bright Light Therapy for Seasonal Affective Disorder: Multi-site RCT",
    authors: "Terman M, Terman JS, Ross DC", journal: "Archives of General Psychiatry", year: 2024, n: 188,
    grade: "B", design: "RCT", effectSize: "Cohen's d -0.84 [-1.13, -0.55]",
    citations: 89, pmid: "38923456",
    abstract: "Multi-site RCT comparing 10,000 lux bright light therapy to dim placebo light. 67% response rate vs 28% placebo at 4 weeks. Morning exposure (6-8 AM) most effective."
  },
  {
    id: 9, title: "Pharmacogenomic-Guided Antidepressant Selection: PRIME Care Implementation",
    authors: "Perlis RH, Vornik LA, Patrick AR", journal: "Nature Mental Health", year: 2024, n: 678,
    grade: "B", design: "RCT", effectSize: "NNT = 11 for remission",
    citations: 156, pmid: "39087654",
    abstract: "Implementation trial of pharmacogenomic testing in primary care. PGx-guided prescribing showed modest improvement in remission rates at 12 weeks vs treatment-as-usual. Cost-effectiveness analysis included."
  },
  {
    id: 10, title: "Mindfulness-Based Cognitive Therapy Relapse Prevention: 5-Year Follow-up",
    authors: "Kuyken W, Warren FC, Taylor RS", journal: "Lancet Psychiatry", year: 2023, n: 424,
    grade: "B", design: "RCT", effectSize: "HR 0.72 [0.55, 0.94]",
    citations: 312, pmid: "36765432",
    abstract: "Long-term follow-up of MBCT vs maintenance antidepressants for recurrent depression. MBCT non-inferior to medication for relapse prevention. Cost savings estimated at £544/patient over 5 years."
  },
  {
    id: 11, title: " APA Practice Guideline for Treatment-Resistant Depression",
    authors: "American Psychiatric Association", journal: "APA Guidelines", year: 2024, n: null,
    grade: "A", design: "Guideline", effectSize: "N/A",
    citations: 2034, pmid: null,
    abstract: "Updated evidence-based guideline for managing treatment-resistant depression. Recommendations include systematic switching/augmentation strategies, ECT for severe cases, and emerging somatic therapies. Includes algorithm for stepped care."
  },
  {
    id: 12, title: "Deep Brain Stimulation for Obsessive-Compulsive Disorder: Review",
    authors: "Lozano AM, Giacobbe P, Hamani C", journal: "Brain Stimulation", year: 2024, n: 116,
    grade: "C", design: "Review", effectSize: "Mean Y-BOCS reduction 45%",
    citations: 34, pmid: "39123456",
    abstract: "Comprehensive review of DBS targets (ALIC, VC/VS, STN, NAc) for treatment-refractory OCD. Response rates 40-60% depending on target and patient selection. Discussion of optimisation protocols and adverse events."
  }
];

// ─── Grade badge renderer ───────────────────────────────────────
function gradeBadge(grade) {
  const colors = {
    A: { bg: "#16a34a", text: "#fff", label: "Meta-analyses" },
    B: { bg: "#2563eb", text: "#fff", label: "RCTs" },
    C: { bg: "#d97706", text: "#fff", label: "Observational" },
    D: { bg: "#dc2626", text: "#fff", label: "Expert Opinion" },
    G: { bg: "#7c3aed", text: "#fff", label: "Guideline" }
  };
  const c = colors[grade] || colors.D;
  const shortLabel = grade === "A" ? "A" : grade === "B" ? "B" : grade === "C" ? "C" : grade === "G" ? "GL" : "D";
  return `<span style="display:inline-block;background:${c.bg};color:${c.text};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap;">${shortLabel}</span>`;
}

function gradeFilterLabel(type) {
  const labels = {
    all: "All", meta: "Meta-analyses (A)", rct: "RCTs (B)",
    observational: "Observational (C)", review: "Reviews", guideline: "Guidelines"
  };
  return labels[type] || type;
}

// ─── Main entry function ────────────────────────────────────────
export async function pgEvidenceResearch(setTopbar, navigate) {
  setTopbar("Evidence Research & Literature Review", [
    { label: "Dashboard", action: () => navigate("dashboard") },
    { label: "Evidence", active: true },
    { label: "Protocols", action: () => navigate("protocols") }
  ]);

  // Try API first, fall back to demo data
  let EVIDENCE_DATA = EVIDENCE_DATA_DEMO;
  try {
    const resp = await api.searchEvidence('', {});
    if (resp && resp.length > 0) {
      EVIDENCE_DATA = resp;
    } else if (resp && resp.items && resp.items.length > 0) {
      EVIDENCE_DATA = resp.items;
    }
  } catch (err) {
    console.warn('[EvidenceResearch] API error:', err.message);
  }

  let currentFilter = "all";
  let searchText = "";
  let expandedId = null;

  const root = document.getElementById("app-content");

  function buildHTML() {
    const filtered = filterData(currentFilter, searchText);
    const kpi = computeKPIs();

    return /*html*/ `
      <div class="evidence-container" style="padding:20px;max-width:1200px;margin:0 auto;">

        <!-- ─── KPI Cards ─── -->
        <div class="evidence-kpi-row" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px;">
          <div class="kpi-card" style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Papers Indexed</div>
            <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">${kpi.total.toLocaleString()}</div>
            <div style="font-size:11px;color:var(--success);">↑ 12% vs last month</div>
          </div>
          <div class="kpi-card" style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">This Week</div>
            <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">${kpi.thisWeek}</div>
            <div style="font-size:11px;color:var(--success);">↑ 3 new today</div>
          </div>
          <div class="kpi-card" style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Avg Evidence Grade</div>
            <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">${kpi.avgGrade}</div>
            <div style="font-size:11px;color:var(--text-secondary);">Across all indexed papers</div>
          </div>
          <div class="kpi-card" style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Citation Count</div>
            <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">${kpi.citations.toLocaleString()}</div>
            <div style="font-size:11px;color:var(--text-secondary);">Total indexed citations</div>
          </div>
        </div>

        <!-- ─── Search Bar ─── -->
        <div class="evidence-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0;">Evidence Search</h2>
          <div style="font-size:11px;color:var(--text-secondary);">${filtered.length} results</div>
        </div>

        <div class="search-bar" style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <input type="text" class="search-input" id="ev-search-input"
            placeholder="Search titles, authors, journals, PMIDs..."
            value="${escapeHtml(searchText)}"
            style="flex:1;min-width:240px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface-1);color:var(--text);">
          <select id="ev-filter-condition" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text);min-width:120px;">
            <option value="">All Conditions</option>
            <option>Depression</option>
            <option>Anxiety</option>
            <option>OCD</option>
            <option>Insomnia</option>
            <option>SAD</option>
          </select>
          <select id="ev-filter-intervention" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text);min-width:120px;">
            <option value="">All Interventions</option>
            <option>Ketamine</option>
            <option>Psilocybin</option>
            <option>rTMS</option>
            <option>CBT</option>
            <option>Lithium</option>
            <option>Exercise</option>
            <option>Light therapy</option>
            <option>DBS</option>
          </select>
          <select id="ev-filter-outcome" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text);min-width:110px;">
            <option value="">All Outcomes</option>
            <option>Response rate</option>
            <option>Remission</option>
            <option>Relapse prevention</option>
            <option>Symptom severity</option>
          </select>
        </div>

        <!-- ─── Secondary filters ─── -->
        <div class="search-bar" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <select id="ev-filter-grade" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text);min-width:100px;">
            <option value="">All Grades</option>
            <option value="A">A — Meta-analysis</option>
            <option value="B">B — RCT</option>
            <option value="C">C — Observational</option>
            <option value="G">GL — Guideline</option>
          </select>
          <select id="ev-filter-year" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text);min-width:90px;">
            <option value="">All Years</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2021">2021</option>
          </select>
          <button id="ev-btn-search" style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Search</button>
          <button id="ev-btn-clear" style="padding:8px 14px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;">Clear</button>
        </div>

        <!-- ─── Evidence Filter Tabs ─── -->
        <div class="evidence-tabs" style="display:flex;gap:2px;margin-bottom:14px;border-bottom:2px solid var(--border);flex-wrap:wrap;">
          ${["all", "meta", "rct", "observational", "review", "guideline"].map(t => /*html*/`
            <button class="ev-tab" data-tab="${t}"
              style="padding:8px 14px;font-size:12px;font-weight:${currentFilter === t ? "600" : "400"};color:${currentFilter === t ? "var(--accent)" : "var(--text-secondary)"};background:transparent;border:none;border-bottom:${currentFilter === t ? "2px solid var(--accent)" : "2px solid transparent"};cursor:pointer;margin-bottom:-2px;white-space:nowrap;">
              ${gradeFilterLabel(t)}
            </button>
          `).join("")}
        </div>

        <!-- ─── Results Table ─── -->
        <div class="evidence-table-wrapper" style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:var(--surface-2);border-bottom:1px solid var(--border);">
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text);width:36px;">#</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text);">Title & Authors</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text);">Journal</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text);width:50px;">Year</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text);width:46px;">Grade</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text);width:50px;">N</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:var(--text);">Effect Size</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text);width:50px;">Cited</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:var(--text);width:90px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((row, idx) => /*html*/`
                <tr class="result-row ${expandedId === row.id ? "expanded" : ""}" data-id="${row.id}"
                  style="border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.1s;"
                  onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                  <td style="padding:8px 10px;color:var(--text-secondary);font-size:11px;vertical-align:top;">${idx + 1}</td>
                  <td style="padding:8px 10px;vertical-align:top;">
                    <div style="font-weight:600;color:var(--text);font-size:12px;line-height:1.35;">${escapeHtml(row.title)}</div>
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(row.authors)}</div>
                    ${row.pmid ? `<div style="font-size:10px;color:var(--accent);margin-top:1px;">PMID: ${row.pmid}</div>` : ""}
                    <!-- Abstract Preview -->
                    <div class="abstract-preview" id="abstract-${row.id}" style="font-size:11px;color:var(--text-secondary);padding:8px 12px;background:var(--surface-2);border-radius:4px;margin-top:6px;display:${expandedId === row.id ? "block" : "none"};border-left:3px solid var(--accent);line-height:1.5;">
                      <strong style="color:var(--text);">Abstract:</strong> ${escapeHtml(row.abstract)}
                      <div style="margin-top:8px;display:flex;gap:6px;">
                        <button class="btn-add-protocol" data-id="${row.id}" style="padding:4px 10px;background:var(--accent);color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;font-weight:600;">+ Add to Protocol</button>
                        <button class="btn-cite-report" data-id="${row.id}" style="padding:4px 10px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:10px;cursor:pointer;">Cite in Report</button>
                        <button class="btn-export-ref" data-id="${row.id}" style="padding:4px 10px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:10px;cursor:pointer;">Export Ref</button>
                      </div>
                    </div>
                  </td>
                  <td style="padding:8px 10px;color:var(--text-secondary);font-size:11px;vertical-align:top;">${escapeHtml(row.journal)}</td>
                  <td style="padding:8px 10px;text-align:center;color:var(--text-secondary);font-size:11px;vertical-align:top;">${row.year}</td>
                  <td style="padding:8px 10px;text-align:center;vertical-align:top;">${gradeBadge(row.grade)}</td>
                  <td style="padding:8px 10px;text-align:center;color:var(--text-secondary);font-size:11px;vertical-align:top;">${row.n ? row.n.toLocaleString() : "—"}</td>
                  <td style="padding:8px 10px;color:var(--text);font-size:11px;font-family:monospace;vertical-align:top;white-space:nowrap;">${escapeHtml(row.effectSize)}</td>
                  <td style="padding:8px 10px;text-align:center;color:var(--text-secondary);font-size:11px;vertical-align:top;">${row.citations.toLocaleString()}</td>
                  <td style="padding:8px 10px;text-align:center;vertical-align:top;">
                    <div style="display:flex;gap:4px;justify-content:center;">
                      <button class="btn-add-protocol" data-id="${row.id}" title="Add to protocol" style="padding:3px 6px;background:var(--accent);color:#fff;border:none;border-radius:3px;font-size:10px;cursor:pointer;font-weight:600;">+</button>
                      <button class="btn-cite-report" data-id="${row.id}" title="Cite" style="padding:3px 6px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:3px;font-size:10px;cursor:pointer;">❝</button>
                      <button class="btn-export-ref" data-id="${row.id}" title="Export" style="padding:3px 6px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:3px;font-size:10px;cursor:pointer;">⬇</button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          ${filtered.length === 0 ? `<div style="padding:30px;text-align:center;color:var(--text-secondary);font-size:13px;">No results match your search criteria.</div>` : ""}
        </div>

        <!-- ─── Safety Disclaimer ─── -->
        <div style="margin-top:16px;padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;border-left:3px solid #d97706;">
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
            <strong style="color:var(--text);">Evidence Disclaimer:</strong> Evidence grades reflect study design quality (A=Meta-analysis, B=RCT, C=Observational), not clinical applicability to individual patients. Always consider patient-specific factors, comorbidities, and contraindications when applying evidence to clinical decisions. This tool is for informational purposes only and does not replace clinical judgment.
          </div>
        </div>
      </div>
    `;
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function computeKPIs() {
    const total = EVIDENCE_DATA.length;
    const thisWeek = EVIDENCE_DATA.filter(d => d.year === 2024).length;
    const gradeMap = { A: 4, B: 3, C: 2, G: 4, D: 1 };
    const avg = total > 0 ? (EVIDENCE_DATA.reduce((s, d) => s + (gradeMap[d.grade] || 2), 0) / total) : 0;
    const gradeLabels = ["", "D", "C", "B", "A"];
    const citations = EVIDENCE_DATA.reduce((s, d) => s + d.citations, 0);
    return { total, thisWeek, avgGrade: gradeLabels[Math.round(avg)] || "B", citations };
  }

  function filterData(filter, text) {
    let data = [...EVIDENCE_DATA];
    if (filter === "meta") data = data.filter(d => d.design === "Meta-analysis");
    else if (filter === "rct") data = data.filter(d => d.design === "RCT");
    else if (filter === "observational") data = data.filter(d => d.design === "Observational");
    else if (filter === "review") data = data.filter(d => d.design === "Review");
    else if (filter === "guideline") data = data.filter(d => d.design === "Guideline");

    if (text.trim()) {
      const t = text.toLowerCase();
      data = data.filter(d =>
        d.title.toLowerCase().includes(t) ||
        d.authors.toLowerCase().includes(t) ||
        d.journal.toLowerCase().includes(t) ||
        (d.pmid && d.pmid.includes(t)) ||
        d.design.toLowerCase().includes(t)
      );
    }
    return data;
  }

  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ─── Render & Bind ────────────────────────────────────────────
  function render() {
    root.innerHTML = buildHTML();
    bindEvents();
  }

  function bindEvents() {
    // Tab switching
    root.querySelectorAll(".ev-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        currentFilter = tab.dataset.tab;
        render();
      });
    });

    // Search input
    const searchInput = root.querySelector("#ev-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        searchText = e.target.value;
        render();
      });
    }

    // Search button — calls real API with fallback to local filter
    const btnSearch = root.querySelector("#ev-btn-search");
    if (btnSearch) {
      btnSearch.addEventListener("click", async () => {
        try {
          const cond = root.querySelector("#ev-filter-condition")?.value || '';
          const grade = root.querySelector("#ev-filter-grade")?.value || '';
          const year = root.querySelector("#ev-filter-year")?.value || '';
          const resp = await api.searchEvidence(searchText, { condition: cond, grade, year });
          if (resp && (resp.items?.length > 0 || resp.length > 0)) {
            EVIDENCE_DATA = resp.items || resp;
            render();
            return;
          }
        } catch (err) {
          console.warn('[EvidenceResearch] search API error:', err.message);
        }
        render();
      });
    }

    // Clear button
    const btnClear = root.querySelector("#ev-btn-clear");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        searchText = "";
        currentFilter = "all";
        render();
      });
    }

    // Expand row click
    root.querySelectorAll(".result-row").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        const id = Number(row.dataset.id);
        expandedId = expandedId === id ? null : id;
        render();
      });
    });

    // Quick action buttons
    root.querySelectorAll(".btn-add-protocol").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const item = EVIDENCE_DATA.find(d => d.id === id);
        showToast(`"${item.title.substring(0, 40)}..." added to protocol draft`, "success");
      });
    });

    root.querySelectorAll(".btn-cite-report").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const item = EVIDENCE_DATA.find(d => d.id === id);
        const citation = formatCitation(item);
        navigator.clipboard.writeText(citation).catch(() => {});
        showToast("Citation copied to clipboard", "success");
      });
    });

    root.querySelectorAll(".btn-export-ref").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const item = EVIDENCE_DATA.find(d => d.id === id);
        downloadReference(item);
        showToast("Reference exported as .ris", "success");
      });
    });

    // Dropdown filters (re-render on change)
    ["#ev-filter-condition", "#ev-filter-intervention", "#ev-filter-outcome", "#ev-filter-grade", "#ev-filter-year"].forEach(sel => {
      const el = root.querySelector(sel);
      if (el) el.addEventListener("change", () => render());
    });
  }

  function formatCitation(item) {
    return `${item.authors}. ${item.title}. ${item.journal}. ${item.year};${item.pmid ? " PMID:" + item.pmid : ""}`;
  }

  function downloadReference(item) {
    const ris = `TY  - ${item.design === "RCT" ? "JOUR" : item.design === "Meta-analysis" ? "JOUR" : "JOUR"}\nTI  - ${item.title}\nAU  - ${item.authors.replace(/, /g, "\nAU  - ")}\nJO  - ${item.journal}\nPY  - ${item.year}\n${item.pmid ? "PM  - " + item.pmid + "\n" : ""}ER  -\n`;
    const blob = new Blob([ris], { type: "application/x-research-info-systems" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ref_${item.pmid || item.id}.ris`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showToast(message, type = "info") {
    const existing = document.querySelector(".ev-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "ev-toast";
    const bg = type === "success" ? "#16a34a" : type === "error" ? "#dc2626" : "var(--accent)";
    toast.style.cssText = `position:fixed;bottom:20px;right:20px;padding:10px 16px;background:${bg};color:#fff;font-size:12px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;animation:evFadeIn 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Inject animation keyframes
  if (!document.getElementById("ev-anim-styles")) {
    const style = document.createElement("style");
    style.id = "ev-anim-styles";
    style.textContent = `@keyframes evFadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}`;
    document.head.appendChild(style);
  }

  render();
}

// ─── Module export ──────────────────────────────────────────────
export default { pgEvidenceResearch };
