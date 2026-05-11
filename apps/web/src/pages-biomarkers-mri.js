/**
 * MRI Neuromarkers Library Tab — redesigned two-panel interface.
 *
 * Left panel  : filterable sign list
 * Right panel : tabbed detail view — Overview | Imaging | Pathophysiology | Evidence | Report
 *
 * Evidence tab queries /api/v1/evidence/papers using the sign name + primary
 * conditions so every neuromarker is wired to the live literature corpus.
 *
 * Imaging tab shows the three brain-atlas planes (sagittal / axial / coronal)
 * with an SVG overlay that highlights the affected anatomy region.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';

// ─────────────────────────────────────────────────────────────────────────────
// Anatomy → approximate overlay coordinates (% of container).
// Values are intentionally approximate – they mark the region of interest on
// the reference atlas images, not pixel-perfect annotations.
// ─────────────────────────────────────────────────────────────────────────────
const ANATOMY_COORDS = {
  midbrain:          { sagittal: [55,72,7,5],   axial: [50,68,12,9],   coronal: [50,70,10,7]  },
  brainstem:         { sagittal: [55,78,6,9],   axial: [50,75,10,10],  coronal: [50,76,8,10]  },
  pons:              { sagittal: [55,80,7,6],   axial: [50,80,13,10],  coronal: [50,78,10,8]  },
  cerebellum:        { sagittal: [65,83,11,8],  axial: [50,85,18,12],  coronal: [50,82,16,12] },
  'corpus callosum': { sagittal: [50,42,22,5],  axial: [50,44,20,9],   coronal: [50,35,15,7]  },
  periventricular:   { sagittal: [52,47,13,13], axial: [50,50,22,18],  coronal: [50,45,18,16] },
  'frontal lobe':    { sagittal: [33,38,18,20], axial: [50,28,26,18],  coronal: [50,30,24,20] },
  'temporal lobe':   { sagittal: [42,60,18,15], axial: [35,58,18,12],  coronal: [32,56,14,12] },
  'parietal lobe':   { sagittal: [56,32,18,18], axial: [50,42,22,18],  coronal: [50,38,20,18] },
  'occipital lobe':  { sagittal: [70,48,14,16], axial: [50,70,20,14],  coronal: [50,60,18,16] },
  thalamus:          { sagittal: [53,55,8,6],   axial: [50,54,12,10],  coronal: [50,52,10,8]  },
  'basal ganglia':   { sagittal: [48,56,8,8],   axial: [48,52,14,12],  coronal: [48,50,12,10] },
  hippocampus:       { sagittal: [47,62,12,6],  axial: [38,62,12,6],   coronal: [35,62,8,6]   },
  putamen:           { sagittal: [46,53,7,7],   axial: [42,52,8,7],    coronal: [40,50,7,7]   },
  'white matter':    { sagittal: [50,46,21,22], axial: [50,48,22,20],  coronal: [50,46,20,20] },
  'spinal cord':     { sagittal: [57,90,4,8],   axial: [50,90,6,6],    coronal: [50,88,5,8]   },
  ventricles:        { sagittal: [51,48,10,10], axial: [50,50,10,8],   coronal: [50,46,10,10] },
};

const PLANES = ['sagittal', 'axial', 'coronal'];

// ─────────────────────────────────────────────────────────────────────────────
// HTML template
// ─────────────────────────────────────────────────────────────────────────────
export function renderMRINeuromarkersTab() {
  return `
<div class="mri-nm-root" id="mri-nm-root">

  <!-- ── Left sidebar ── -->
  <aside class="mri-nm-sidebar">
    <div class="mri-nm-sidebar-top">
      <h2 class="mri-nm-title">MRI Neuromarkers</h2>
      <p class="mri-nm-subtitle">Classic imaging signs wired to the evidence corpus.</p>
    </div>

    <div class="mri-nm-controls">
      <div class="mri-nm-search-wrap">
        <svg class="mri-nm-search-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14 14l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          type="text"
          id="mri-nm-search"
          class="mri-nm-search-input"
          placeholder="Search name, anatomy, condition…"
          autocomplete="off"
        />
        <button id="mri-nm-search-clear" class="mri-nm-search-clear" style="display:none" title="Clear">✕</button>
      </div>

      <div class="mri-nm-filters">
        <select id="mri-nm-cat" class="mri-nm-select">
          <option value="">All categories</option>
          <option value="neurodegenerative">Neurodegenerative</option>
          <option value="metabolic">Metabolic</option>
          <option value="demyelinating">Demyelinating</option>
          <option value="vascular">Vascular</option>
          <option value="tumoral">Tumoral</option>
          <option value="developmental">Developmental</option>
          <option value="cerebellar">Cerebellar</option>
          <option value="infectious">Infectious</option>
        </select>

        <select id="mri-nm-seq" class="mri-nm-select">
          <option value="">All sequences</option>
          <option value="T1">T1</option>
          <option value="T2">T2</option>
          <option value="FLAIR">FLAIR</option>
          <option value="DWI">DWI</option>
          <option value="SWI">SWI</option>
          <option value="contrast-enhanced">Contrast</option>
          <option value="MRS">MRS/Spectroscopy</option>
        </select>

        <select id="mri-nm-modality" class="mri-nm-select">
          <option value="">All modalities</option>
          <option value="MRI">MRI</option>
          <option value="CT">CT</option>
          <option value="angiography">Angiography</option>
        </select>
      </div>
    </div>

    <div class="mri-nm-list-header">
      <span id="mri-nm-count" class="mri-nm-count"></span>
    </div>

    <div id="mri-nm-list" class="mri-nm-list">
      <div class="mri-nm-loading">
        <span class="mri-nm-spinner"></span>
        Loading neuromarkers…
      </div>
    </div>
  </aside>

  <!-- ── Right detail panel ── -->
  <section class="mri-nm-detail" id="mri-nm-detail">
    <!-- Empty state -->
    <div id="mri-nm-empty" class="mri-nm-empty">
      <div class="mri-nm-empty-inner">
        <svg viewBox="0 0 80 80" fill="none" class="mri-nm-empty-icon">
          <circle cx="40" cy="40" r="36" stroke="rgba(100,200,255,0.15)" stroke-width="2"/>
          <circle cx="40" cy="40" r="22" stroke="rgba(100,200,255,0.25)" stroke-width="1.5"/>
          <path d="M28 40c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12-12-5.373-12-12z" stroke="rgba(100,200,255,0.4)" stroke-width="1.5" fill="none"/>
          <circle cx="40" cy="40" r="4" fill="rgba(100,200,255,0.5)"/>
          <path d="M50 30 L55 25M30 30 L25 25M50 50 L55 55M30 50 L25 55" stroke="rgba(100,200,255,0.3)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <h3>Select a neuromarker</h3>
        <p>Choose a sign from the library to view its imaging features, anatomy highlights, and linked evidence literature.</p>
      </div>
    </div>

    <!-- Sign detail (hidden until sign selected) -->
    <div id="mri-nm-sign-detail" class="mri-nm-sign-detail" style="display:none">
      <!-- Header -->
      <div class="mri-nm-detail-header" id="mri-nm-detail-header">
        <div class="mri-nm-detail-title-row">
          <h2 id="mri-nm-detail-name"></h2>
          <span id="mri-nm-detail-badge" class="badge"></span>
        </div>
        <div class="mri-nm-detail-meta" id="mri-nm-detail-meta"></div>
      </div>

      <!-- Tab nav -->
      <nav class="mri-nm-tabs" id="mri-nm-tabs">
        <button class="mri-nm-tab active" data-tab="overview">Overview</button>
        <button class="mri-nm-tab" data-tab="imaging">Imaging</button>
        <button class="mri-nm-tab" data-tab="pathophysiology">Pathophysiology</button>
        <button class="mri-nm-tab" data-tab="evidence">Evidence</button>
        <button class="mri-nm-tab" data-tab="report">Report</button>
      </nav>

      <!-- Tab panes -->
      <div class="mri-nm-tab-body" id="mri-nm-tab-body">
        <!-- Overview -->
        <div class="mri-nm-pane active" data-pane="overview" id="mri-nm-pane-overview"></div>
        <!-- Imaging -->
        <div class="mri-nm-pane" data-pane="imaging" id="mri-nm-pane-imaging"></div>
        <!-- Pathophysiology -->
        <div class="mri-nm-pane" data-pane="pathophysiology" id="mri-nm-pane-pathophysiology"></div>
        <!-- Evidence -->
        <div class="mri-nm-pane" data-pane="evidence" id="mri-nm-pane-evidence"></div>
        <!-- Report -->
        <div class="mri-nm-pane" data-pane="report" id="mri-nm-pane-report"></div>
      </div>
    </div>
  </section>
</div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo data — 8 classic MRI neuromarkers with full clinical content
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_SIGNS = [
  {
    id: 'demo_hummingbird',
    slug: 'hummingbird-sign',
    name: 'Hummingbird Sign',
    category: 'neurodegenerative',
    modality: 'MRI',
    sequences: ['T1', 'T2'],
    anatomy: ['midbrain', 'brainstem'],
    primary_conditions: ['Progressive Supranuclear Palsy (PSP)'],
    associated_conditions: ['Multiple System Atrophy', 'Corticobasal Syndrome'],
    visual_description: 'Selective atrophy of the midbrain tegmentum on mid-sagittal T1/T2. The slender midbrain with preserved pons creates a silhouette resembling a hummingbird in flight — narrow "beak" (midbrain) above a rounded "body" (pons).',
    pathophysiology_explanation: 'PSP causes selective tau deposition and neurodegeneration in the midbrain, subthalamic nucleus, and globus pallidus. Midbrain AP diameter < 17 mm and midbrain/pons area ratio < 0.12 are quantitative thresholds. Hummingbird sign sensitivity ~68–72%, specificity ~88–95% for PSP vs parkinsonism.',
    differential_diagnosis: 'MSA-P (Mickey Mouse sign on axial), CBD, DLB, Parkinson\'s disease (midbrain preserved). Age-related atrophy may be confounding in patients > 70 years.',
    clinical_caveat: 'Pattern-recognition aid only; clinical correlation including vertical gaze palsy, postural instability, and falls history is required. PSP-P variant may lack the sign early.',
    reporting_phrase: 'Mid-sagittal T1 demonstrates selective midbrain tegmentum atrophy with preserved pons, producing the "hummingbird sign." Findings are consistent with midbrain predominant neurodegeneration as seen in PSP. Clinical correlation advised.',
    evidence_notes: 'Höglinger GU et al. (2017) MDS criteria for PSP — midbrain imaging is a core supportive feature (Level A). Kato N et al. (2003) first described the sign; sensitivity 68.4% for PSP vs 0% controls (Brain 126:2777).',
    source_refs: [
      { title: 'Höglinger et al. MDS criteria for PSP', year: 2017, url: 'https://pubmed.ncbi.nlm.nih.gov/28467028/' },
      { title: 'Kato N et al. Hummingbird sign in PSP', year: 2003, url: 'https://pubmed.ncbi.nlm.nih.gov/14506075/' },
    ],
    evidence_query: 'progressive supranuclear palsy midbrain atrophy hummingbird sign MRI',
    best_plane: 'sagittal',
  },
  {
    id: 'demo_mickey',
    slug: 'mickey-mouse-sign',
    name: 'Mickey Mouse Sign',
    category: 'neurodegenerative',
    modality: 'MRI',
    sequences: ['T2', 'FLAIR'],
    anatomy: ['midbrain'],
    primary_conditions: ['Multiple System Atrophy (MSA-P)', 'Progressive Supranuclear Palsy'],
    associated_conditions: ['Parkinsonism-plus syndromes'],
    visual_description: 'On axial T2/T2* through the upper midbrain, normal lateral sulci remain patent while the tectum is atrophic, producing a rounded anterolateral appearance — the "ears" are the cerebral peduncles with preserved signal, giving the cross-section a Mickey Mouse silhouette.',
    pathophysiology_explanation: 'MSA-P (striatonigral degeneration subtype) causes selective loss of neurons in the putamen, substantia nigra, locus coeruleus, and inferior olives. The lateral tegmentum is relatively spared vs PSP, which predominantly affects the periaqueductal grey. T2 hypointensity of the putamen with a hyperintense rim ("putaminal slit sign") frequently co-occurs.',
    differential_diagnosis: 'PSP (hummingbird sign on sagittal, more superior midbrain atrophy), vascular parkinsonism, DLB. In isolation the sign has moderate specificity.',
    clinical_caveat: 'Axial plane through the same level (superior colliculi) is critical — slightly off-axis cuts can simulate or obscure the sign. Pattern-recognition aid only.',
    reporting_phrase: 'Axial T2 at the level of the superior midbrain demonstrates preserved lateral sulci with relative tegmental atrophy, consistent with the "Mickey Mouse" configuration. Combined with putaminal signal change, findings favour MSA-P. Clinical correlation required.',
    evidence_notes: 'Bhatt M et al. (2018) prospective cohort: Mickey Mouse sign sensitivity 71% for MSA-P (Mov Disord 33:291).',
    source_refs: [
      { title: 'Bhatt et al. MRI signs in MSA-P vs PSP', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29266488/' },
    ],
    evidence_query: 'multiple system atrophy midbrain MRI parkinsonian MSA-P',
    best_plane: 'axial',
  },
  {
    id: 'demo_hotcrossbun',
    slug: 'hot-cross-bun-sign',
    name: 'Hot Cross Bun Sign',
    category: 'neurodegenerative',
    modality: 'MRI',
    sequences: ['T2', 'FLAIR'],
    anatomy: ['pons'],
    primary_conditions: ['Multiple System Atrophy (MSA-C)'],
    associated_conditions: ['Spinocerebellar ataxia (SCA-3)', 'Prion disease (rare)'],
    visual_description: 'Cruciform T2 hyperintensity within the pons on axial imaging, reflecting selective degeneration of the transverse pontocerebellar fibres and pontine nuclei — sparing the corticospinal tracts (which remain isointense) — giving a cross-like "hot cross bun" appearance.',
    pathophysiology_explanation: 'MSA-C (olivopontocerebellar atrophy subtype) results in α-synuclein glial cytoplasmic inclusions preferentially affecting pontine tegmental nuclei, middle cerebellar peduncles, and inferior olives. The cross pattern maps onto the topography of pontine nuclei whose myelinated projections degenerate while pyramidal fibres are initially spared.',
    differential_diagnosis: 'SCA-3 (Machado-Joseph): clinically distinguished by CAG repeat expansion. Prion disease: rapid onset, CSF 14-3-3 positive. The sign is highly specific (>95%) but present in only ~60% of pathology-confirmed MSA-C.',
    clinical_caveat: 'Axial T2 slice must be centred at mid-pons level. High field (3T) improves sensitivity. Pattern-recognition aid only; prion disease is a rare mimic.',
    reporting_phrase: 'Axial T2 through the mid-pons demonstrates cruciform signal hyperintensity consistent with the "hot cross bun sign." Cerebellar and middle cerebellar peduncle atrophy are also present. Findings are highly consistent with MSA-C (olivopontocerebellar type).',
    evidence_notes: 'Bhatt M et al. (2018): hot cross bun sign specificity 99%, sensitivity 63% for MSA-C (Mov Disord). Massey LA et al. (2012): sign present in 60% of pathology-confirmed MSA at symptom onset.',
    source_refs: [
      { title: 'Massey et al. MRI in MSA: sensitivity and specificity', year: 2012, url: 'https://pubmed.ncbi.nlm.nih.gov/22806540/' },
      { title: 'Bhatt et al. Diagnostic MRI signs in MSA subtypes', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29266488/' },
    ],
    evidence_query: 'multiple system atrophy cerebellar pons hot cross bun MRI atrophy',
    best_plane: 'axial',
  },
  {
    id: 'demo_butterfly',
    slug: 'butterfly-glioma',
    name: 'Butterfly Glioma',
    category: 'tumoral',
    modality: 'MRI',
    sequences: ['T1', 'T2', 'FLAIR', 'contrast-enhanced'],
    anatomy: ['corpus callosum', 'white matter'],
    primary_conditions: ['Glioblastoma Multiforme (GBM)', 'Diffuse midline glioma'],
    associated_conditions: ['CNS lymphoma (mimic)', 'Tumefactive MS (rare mimic)'],
    visual_description: 'Infiltrating heterogeneous mass spanning the corpus callosum with bilateral symmetric extension into the white matter of both hemispheres, creating a butterfly silhouette on axial/coronal FLAIR. Central necrosis with peripheral ring enhancement on contrast T1 is characteristic of GBM.',
    pathophysiology_explanation: 'GBM spreads along compact white matter tracts (corpus callosum, internal capsule) and the perivascular spaces. Bilateral corpus callosal involvement indicates transcallosal spread — a marker of highly infiltrative behaviour. WHO grade IV designation reflects IDH-wildtype genotype in most adults. Necrosis is caused by rapid outgrowth of blood supply.',
    differential_diagnosis: 'CNS lymphoma (homogeneous restriction diffusion, responds dramatically to steroids, usually periventricular). Tumefactive MS (younger patient, less mass effect, incomplete ring enhancement). Bihemispheric cerebritis (septic, fever).',
    clinical_caveat: 'Despite dramatic appearance, tissue diagnosis is mandatory. DWI and MR spectroscopy (elevated Cho/Cr, reduced NAA) and perfusion (elevated rCBV) narrow differentials but do not replace biopsy.',
    reporting_phrase: 'Axial FLAIR demonstrates a bilateral infiltrating mass centred on the corpus callosum with "butterfly" bihemispheric extension and surrounding vasogenic oedema. Post-contrast T1 shows thick irregular ring enhancement with central necrosis. Imaging most consistent with GBM; tissue confirmation required.',
    evidence_notes: 'Wen PY et al. (2020) WHO 2016/2021 GBM classification — IDH status now mandatory (NEJM 383:2428). Stupp R et al. (2005) established standard of care (NEJM 352:987 — landmark temozolomide trial).',
    source_refs: [
      { title: 'Wen PY et al. Glioblastoma 2020 WHO Classification', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/32109013/' },
      { title: 'Stupp R et al. Temozolomide for GBM (landmark)', year: 2005, url: 'https://pubmed.ncbi.nlm.nih.gov/15758010/' },
    ],
    evidence_query: 'glioblastoma corpus callosum butterfly MRI IDH treatment',
    best_plane: 'axial',
  },
  {
    id: 'demo_dawsons',
    slug: 'dawsons-fingers',
    name: "Dawson's Fingers",
    category: 'demyelinating',
    modality: 'MRI',
    sequences: ['T2', 'FLAIR'],
    anatomy: ['periventricular', 'white matter'],
    primary_conditions: ['Multiple Sclerosis (MS)'],
    associated_conditions: ['NMOSD (mimic — less perpendicular)', 'ADEM'],
    visual_description: 'Linear T2/FLAIR hyperintensities radiating perpendicular to the lateral ventricles along periventricular medullary veins on sagittal FLAIR. On axial views these appear as ovoid "barleycorn" lesions > 3 mm abutting the ventricle. Sagittal plane gives the "finger" morphology as they extend into the centrum semiovale.',
    pathophysiology_explanation: 'MS demyelinating plaques develop around centrovenous vessels (medullary veins) running perpendicular to the lateral ventricles. Inflammation and demyelination follow the perivascular space. FLAIR suppresses CSF signal, making periventricular lesions visible. Juxtacortical, infratentorial, and spinal cord lesions are complementary McDonald criteria sites.',
    differential_diagnosis: 'NMOSD: longer cord lesions > 3 vertebral segments, area postrema involvement, AQP4-IgG positive. ADEM: monophasic post-infectious, diffuse, involves basal ganglia. Migraine: lesions smaller, non-specific, not strictly perpendicular.',
    clinical_caveat: '2017 McDonald criteria require dissemination in space (2+ locations) and time. Radiologically-isolated syndrome (no clinical symptoms) may show the sign. This is an educational pattern aid — formal MS diagnosis requires neurologist assessment.',
    reporting_phrase: 'Sagittal FLAIR demonstrates multiple periventricular ovoid T2 hyperintensities oriented perpendicular to the ventricular wall ("Dawson\'s fingers"), consistent with demyelinating plaques. Distribution satisfies McDonald criteria for dissemination in space (periventricular, juxtacortical). Contrast study recommended to assess active demyelination.',
    evidence_notes: 'Thompson AJ et al. (2018) revised McDonald criteria (Lancet Neurol 17:162). Dawson JW (1916) original pathological description (Trans R Soc Edinburgh). Filippi M et al. (2019) comprehensive MRI guidelines for MS (Nat Rev Neurol).',
    source_refs: [
      { title: 'Thompson AJ et al. 2017 McDonald Criteria revision', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29275977/' },
      { title: 'Filippi M et al. MRI guidelines for MS diagnosis and monitoring', year: 2019, url: 'https://pubmed.ncbi.nlm.nih.gov/30777910/' },
    ],
    evidence_query: 'multiple sclerosis periventricular lesions FLAIR MRI McDonald criteria',
    best_plane: 'sagittal',
  },
  {
    id: 'demo_dwi_stroke',
    slug: 'dwi-restricted-diffusion-stroke',
    name: 'DWI Restricted Diffusion (Acute Ischaemic Stroke)',
    category: 'vascular',
    modality: 'MRI',
    sequences: ['DWI', 'T2', 'FLAIR'],
    anatomy: ['basal ganglia', 'thalamus', 'white matter'],
    primary_conditions: ['Acute Ischaemic Stroke', 'Transient Ischaemic Attack (DWI+)'],
    associated_conditions: ['Hypoxic-ischaemic injury', 'Osmotic demyelination (rare mimic)'],
    visual_description: 'Focal bright signal on DWI with corresponding dark (low) ADC map within minutes to hours of ischaemic onset, mapping to the vascular territory. MCA territory stroke produces a wedge-shaped cortical and subcortical DWI lesion; posterior circulation (basilar perforators) produces brainstem/thalamic restricted diffusion.',
    pathophysiology_explanation: 'Cytotoxic oedema from failed Na/K-ATPase leads to intracellular water accumulation within minutes. Water molecules lose their freedom of diffusion (restricted) → high DWI signal, low ADC. DWI + ADC mismatch distinguishes true ischaemia from T2 shine-through (iso/high ADC). FLAIR may be negative in first 6 h (DWI-FLAIR mismatch → strong predictor of < 4.5 h window for thrombolysis).',
    differential_diagnosis: 'Hypoglycaemia (bilateral, global DWI restriction — check BGL immediately). CJD/prion disease (cortical ribboning bilateral, striatum). Wernicke encephalopathy (thalami, mammillary bodies, tectal plate). Osmotic demyelination (pontine/extrapontine, subacute, associated with rapid sodium correction).',
    clinical_caveat: 'DWI-negative TIA: normal DWI does not exclude stroke — up to 17% of DWI-negative patients with clinical stroke have MRI-confirmed infarct on repeat imaging. ABCD2 score should guide urgency. Pattern recognition tool only.',
    reporting_phrase: 'DWI sequence demonstrates focal cortical and subcortical restricted diffusion with corresponding ADC hypointensity in the [territory] distribution, consistent with acute ischaemia. FLAIR is [normal / shows hyperintensity], suggesting onset [within / beyond] ~4.5 hours. Urgent neurovascular assessment and perfusion imaging recommended.',
    evidence_notes: 'Powers WJ et al. (2019) AHA/ASA Acute Ischaemic Stroke Guidelines (Stroke 50:e344). Thomalla G et al. WAKE-UP trial (2018) — DWI-FLAIR mismatch guided IV-tPA in wake-up stroke (NEJM 379:611).',
    source_refs: [
      { title: 'Powers WJ et al. 2019 AHA/ASA Stroke Guidelines', year: 2019, url: 'https://pubmed.ncbi.nlm.nih.gov/30879355/' },
      { title: 'Thomalla G et al. WAKE-UP Trial (DWI-FLAIR mismatch)', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29766771/' },
    ],
    evidence_query: 'acute ischaemic stroke DWI diffusion weighted MRI thrombolysis',
    best_plane: 'axial',
  },
  {
    id: 'demo_eye_tiger',
    slug: 'eye-of-the-tiger',
    name: 'Eye of the Tiger Sign',
    category: 'metabolic',
    modality: 'MRI',
    sequences: ['T2', 'SWI'],
    anatomy: ['basal ganglia', 'putamen'],
    primary_conditions: ['NBIA (Neurodegeneration with Brain Iron Accumulation)', 'PKAN (Pantothenate Kinase-Associated Neurodegeneration)'],
    associated_conditions: ['Other NBIA subtypes (MPAN, BPAN)'],
    visual_description: 'Symmetric T2 hypointensity of the globus pallidus (iron accumulation) with a central zone of T2 hyperintensity (gliosis/tissue loss), forming an "eye" silhouette on axial imaging. SWI/GRE sequences amplify the blooming artefact from iron, increasing sensitivity.',
    pathophysiology_explanation: 'PKAN results from PANK2 gene mutations causing defective CoA synthesis → pantothenate accumulation → cysteine oxidation → iron chelation in the globus pallidus. Progressive neuronal loss creates the central hyperintense gliosis core surrounded by iron-loaded hypointense rim. Onset typically 3–4 years; dystonia is hallmark.',
    differential_diagnosis: 'Physiological pallidal iron (normal in adults > 30 years — no central hyperintensity). Methylmalonyl acidaemia (bilateral T2 pallidal hyperintensity without the iron ring). Wilson disease (putaminal + thalamic, also liver disease).',
    clinical_caveat: 'The sign is near-pathognomonic for PKAN when seen in the correct clinical context (childhood-onset dystonia, PANK2 mutation). Pattern-recognition aid — genetic confirmation is definitive.',
    reporting_phrase: 'Axial T2 demonstrates bilateral symmetric globus pallidus hypointensity with central hyperintensity consistent with the "eye of the tiger sign." SWI confirms marked iron deposition. In the context of early-onset dystonia, PKAN/NBIA is strongly favoured. Genetic panel including PANK2 recommended.',
    evidence_notes: 'Hayflick SJ et al. (2003) PANK2 mutations in PKAN with eye of the tiger sign (Ann Neurol 53:135). Gregory A et al. (2017) updated NBIA classification and imaging criteria.',
    source_refs: [
      { title: 'Hayflick SJ et al. PKAN genetics and MRI', year: 2003, url: 'https://pubmed.ncbi.nlm.nih.gov/12557282/' },
      { title: 'Gregory A et al. NBIA clinical features and imaging', year: 2017, url: 'https://pubmed.ncbi.nlm.nih.gov/28748625/' },
    ],
    evidence_query: 'PKAN NBIA globus pallidus iron MRI dystonia neurodegeneration',
    best_plane: 'axial',
  },
  {
    id: 'demo_lhermitte_duclos',
    slug: 'tigroid-pattern-mld',
    name: 'Tigroid / Leopard Skin Pattern (MLD)',
    category: 'metabolic',
    modality: 'MRI',
    sequences: ['T2', 'FLAIR'],
    anatomy: ['white matter', 'periventricular'],
    primary_conditions: ['Metachromatic Leukodystrophy (MLD)', 'Pelizaeus-Merzbacher disease'],
    associated_conditions: ['Krabbe disease (similar pericentral pattern)', 'Alexander disease'],
    visual_description: 'Symmetric confluent T2 hyperintensity throughout periventricular white matter with radially-oriented stripes of relatively preserved myelin producing a "tigroid" or "leopard skin" appearance on FLAIR. The preserved stripes correspond to perivascular fibres that are the last to be demyelinated.',
    pathophysiology_explanation: 'MLD is caused by ARSA gene mutations → arylsulphatase A deficiency → sulphatide accumulation → metachromatic granule deposition → progressive demyelination. The centrifugal spread from periventricular white matter follows the sequence of myelination in reverse (last-myelinated regions demyelinate first). Perivascular fibres are last to be affected, explaining the preserved stripes.',
    differential_diagnosis: 'Krabbe disease (GALC deficiency — similar butterfly periventricular changes but also involves corticospinal tracts, early CT calcifications). X-ALD: asymmetric, starts posteriorly, boys. Alexander disease (frontal-predominant, Rosenthal fibre deposits).',
    clinical_caveat: 'Pattern-recognition aid only. Enzyme assay (leucocyte ASA activity) and ARSA genotyping are required for definitive diagnosis. Age of onset (late-infantile, juvenile, adult) alters clinical presentation considerably.',
    reporting_phrase: 'FLAIR shows symmetric confluent periventricular T2 hyperintensity with preserved radial perivascular stripes ("tigroid pattern"), sparing the subcortical U-fibres. Distribution and morphology are consistent with metachromatic leukodystrophy. Enzyme studies and genetic analysis recommended.',
    evidence_notes: 'Groeschel S et al. (2012) MRI-based score for MLD progression — tigroid pattern correlated with late-infantile onset (Brain 135:3489). Biffi A et al. (2013) gene therapy trial landmark (Science 341:1233).',
    source_refs: [
      { title: 'Groeschel S et al. MRI score for MLD severity and progression', year: 2012, url: 'https://pubmed.ncbi.nlm.nih.gov/22940580/' },
      { title: 'Biffi A et al. Lentiviral haematopoietic stem cell gene therapy in MLD', year: 2013, url: 'https://pubmed.ncbi.nlm.nih.gov/23845944/' },
    ],
    evidence_query: 'metachromatic leukodystrophy MRI white matter tigroid periventricular demyelination',
    best_plane: 'axial',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Category colour tokens
// ─────────────────────────────────────────────────────────────────────────────
const CAT_COLOR = {
  neurodegenerative: '#f43f5e',
  metabolic:         '#fb923c',
  demyelinating:     '#3b82f6',
  vascular:          '#ef4444',
  tumoral:           '#a855f7',
  developmental:     '#22c55e',
  cerebellar:        '#0ea5e9',
  infectious:        '#eab308',
};

function categoryColor(cat) {
  return CAT_COLOR[cat] ?? '#94a3b8';
}

// ─────────────────────────────────────────────────────────────────────────────
// Build SVG overlay for a given sign + plane
// ─────────────────────────────────────────────────────────────────────────────
function buildAnatomyOverlay(sign, plane) {
  const regions = (sign.anatomy || []).map(a => a.toLowerCase());
  const ellipses = [];
  for (const region of regions) {
    const coords = ANATOMY_COORDS[region];
    if (!coords || !coords[plane]) continue;
    const [cx, cy, rx, ry] = coords[plane];
    ellipses.push({ cx, cy, rx, ry, label: region });
  }

  if (ellipses.length === 0) return '';

  const pulseId = `pulse-${plane}`;
  return `
<svg class="mri-nm-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow-${plane}">
      <feGaussianBlur stdDeviation="1.2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <style>
      @keyframes ${pulseId} {
        0%,100% { opacity: 0.7; }
        50%      { opacity: 1;   }
      }
    </style>
  </defs>
  ${ellipses.map(({ cx, cy, rx, ry }, i) => `
    <ellipse
      cx="${cx}" cy="${cy}" rx="${rx + 2}" ry="${ry + 2}"
      fill="rgba(100,200,255,0.08)"
      stroke="rgba(100,200,255,0.35)"
      stroke-width="0.4"
      filter="url(#glow-${plane})"
      style="animation:${pulseId} 2.5s ease-in-out ${i * 0.4}s infinite"
    />
    <ellipse
      cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"
      fill="rgba(100,200,255,0.18)"
      stroke="rgba(100,200,255,0.9)"
      stroke-width="0.6"
      filter="url(#glow-${plane})"
      style="animation:${pulseId} 2.5s ease-in-out ${i * 0.4}s infinite"
    />
  `).join('')}
</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────────────────────────────
function renderSignCard(sign, isSelected = false) {
  const color = categoryColor(sign.category);
  const seqTags = (sign.sequences || []).slice(0, 4).map(s =>
    `<span class="mri-nm-seq-tag">${s}</span>`).join('');
  const anatTags = (sign.anatomy || []).slice(0, 3).map(a =>
    `<span class="mri-nm-anat-tag">${a}</span>`).join('');
  const desc = (sign.visual_description || '').slice(0, 110);

  return `
<button
  class="mri-nm-card ${isSelected ? 'selected' : ''}"
  data-sign-id="${sign.id}"
  style="--cat-color:${color}"
  aria-pressed="${isSelected}"
>
  <div class="mri-nm-card-top">
    <span class="mri-nm-card-name">${sign.name}</span>
    <span class="mri-nm-cat-dot" style="background:${color}" title="${sign.category}"></span>
  </div>
  <div class="mri-nm-card-tags">${seqTags}${anatTags}</div>
  <p class="mri-nm-card-desc">${desc}${sign.visual_description?.length > 110 ? '…' : ''}</p>
  <div class="mri-nm-card-conditions">${(sign.primary_conditions || []).slice(0,2).join(' · ')}</div>
</button>`;
}

function renderOverviewPane(sign) {
  const color = categoryColor(sign.category);
  const seqBadges = (sign.sequences || []).map(s =>
    `<span class="mri-nm-pill mri-nm-pill-seq">${s}</span>`).join('');
  const anatBadges = (sign.anatomy || []).map(a =>
    `<span class="mri-nm-pill mri-nm-pill-anat">${a}</span>`).join('');
  const priConds = (sign.primary_conditions || []).map(c =>
    `<li class="mri-nm-cond-item mri-nm-cond-primary"><span class="mri-nm-cond-dot" style="background:${color}"></span>${c}</li>`).join('');
  const assocConds = (sign.associated_conditions || []).map(c =>
    `<li class="mri-nm-cond-item"><span class="mri-nm-cond-dot" style="background:#475569"></span>${c}</li>`).join('');

  return `
<div class="mri-nm-overview">
  <div class="mri-nm-overview-desc">
    <h4 class="mri-nm-section-label">Visual Description</h4>
    <p>${sign.visual_description || '—'}</p>
  </div>

  <div class="mri-nm-overview-grid">
    <div class="mri-nm-ov-block">
      <h4 class="mri-nm-section-label">Imaging sequences</h4>
      <div class="mri-nm-pills">${seqBadges || '<span class="mri-nm-muted">—</span>'}</div>
    </div>
    <div class="mri-nm-ov-block">
      <h4 class="mri-nm-section-label">Anatomy</h4>
      <div class="mri-nm-pills">${anatBadges || '<span class="mri-nm-muted">—</span>'}</div>
    </div>
    <div class="mri-nm-ov-block">
      <h4 class="mri-nm-section-label">Modality</h4>
      <div class="mri-nm-pills"><span class="mri-nm-pill mri-nm-pill-mod">${sign.modality || 'MRI'}</span></div>
    </div>
  </div>

  <div class="mri-nm-ov-conditions">
    <h4 class="mri-nm-section-label">Conditions</h4>
    <ul class="mri-nm-cond-list">
      ${priConds}
      ${assocConds}
    </ul>
  </div>

  ${sign.differential_diagnosis ? `
  <div class="mri-nm-ov-block" style="margin-top:1.25rem">
    <h4 class="mri-nm-section-label">Differential diagnosis</h4>
    <p class="mri-nm-muted-text">${sign.differential_diagnosis}</p>
  </div>` : ''}
</div>`;
}

function renderImagingPane(sign) {
  const bestPlane = sign.best_plane || 'axial';
  const planesHtml = PLANES.map(p => `
    <button
      class="mri-nm-plane-tab ${p === bestPlane ? 'active' : ''}"
      data-plane="${p}"
    >${p.charAt(0).toUpperCase() + p.slice(1)}</button>`).join('');

  const viewersHtml = PLANES.map(p => {
    const overlay = buildAnatomyOverlay(sign, p);
    const hasOverlay = overlay.trim().length > 0;
    return `
<div
  class="mri-nm-atlas-view ${p === bestPlane ? 'active' : ''}"
  data-plane-view="${p}"
>
  <div class="mri-nm-atlas-frame">
    <img
      src="/images/brain-atlas/${p}.png"
      alt="${p} brain atlas"
      class="mri-nm-atlas-img"
      loading="lazy"
    />
    ${hasOverlay ? overlay : ''}
    ${hasOverlay ? `<div class="mri-nm-overlay-legend">
      <span class="mri-nm-overlay-dot"></span>
      ${(sign.anatomy || []).join(', ')}
    </div>` : `<div class="mri-nm-overlay-no-map">No overlay for ${p} plane</div>`}
  </div>
</div>`;
  }).join('');

  return `
<div class="mri-nm-imaging">
  <div class="mri-nm-plane-tabs">${planesHtml}</div>

  <div class="mri-nm-atlas-container">
    ${viewersHtml}
  </div>

  <div class="mri-nm-imaging-notes">
    <svg viewBox="0 0 16 16" class="mri-nm-info-icon"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M8 7v5M8 5v0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    Anatomy overlays are schematic guides based on canonical atlas positions — not
    patient-specific annotations. Best viewed on the
    <strong>${bestPlane}</strong> plane for this sign.
  </div>
</div>`;
}

function renderPathophysiologyPane(sign) {
  return `
<div class="mri-nm-patho">
  ${sign.pathophysiology_explanation ? `
  <div class="mri-nm-patho-block">
    <h4 class="mri-nm-section-label">Pathophysiology</h4>
    <p>${sign.pathophysiology_explanation}</p>
  </div>` : ''}

  ${sign.evidence_notes ? `
  <div class="mri-nm-patho-block">
    <h4 class="mri-nm-section-label">Evidence notes</h4>
    <p class="mri-nm-muted-text">${sign.evidence_notes}</p>
  </div>` : ''}

  ${(sign.source_refs || []).length > 0 ? `
  <div class="mri-nm-patho-block">
    <h4 class="mri-nm-section-label">Key references</h4>
    <ul class="mri-nm-ref-list">
      ${(sign.source_refs || []).map(r => `
      <li class="mri-nm-ref-item">
        <span class="mri-nm-ref-year">${r.year || '—'}</span>
        <div>
          <span class="mri-nm-ref-title">${r.title}</span>
          ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="mri-nm-ref-link">PubMed ↗</a>` : ''}
        </div>
      </li>`).join('')}
    </ul>
  </div>` : ''}
</div>`;
}

function renderEvidenceLoading() {
  return `<div class="mri-nm-ev-loading">
    <span class="mri-nm-spinner"></span>
    Searching evidence corpus…
  </div>`;
}

function renderEvidencePapers(papers, query) {
  if (!papers || papers.length === 0) {
    return `<div class="mri-nm-ev-empty">
      <p>No papers found in the evidence corpus for this neuromarker.<br>
      <span class="mri-nm-muted">Query: <code>${query}</code></span></p>
    </div>`;
  }

  const cards = papers.map(p => {
    const authors = (p.authors || []).slice(0, 2);
    const authorStr = authors.length ? authors.join(', ') + (p.authors?.length > 2 ? ' et al.' : '') : '';
    const year = p.year || '—';
    const journal = p.journal || '';
    const hasAbstract = p.abstract && p.abstract.length > 50;
    const oaLink = p.oa_url
      ? `<a href="${p.oa_url}" target="_blank" rel="noopener" class="mri-nm-ev-oa">Full text ↗</a>`
      : '';
    const doiLink = p.doi
      ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noopener" class="mri-nm-ev-doi">DOI ↗</a>`
      : '';
    const pubTypes = (p.pub_types || []).slice(0, 2).map(t =>
      `<span class="mri-nm-ev-type">${t}</span>`).join('');
    const cited = p.cited_by_count != null
      ? `<span class="mri-nm-ev-cited" title="Cited by count">★ ${p.cited_by_count}</span>`
      : '';

    return `
<div class="mri-nm-ev-card">
  <div class="mri-nm-ev-card-top">
    <span class="mri-nm-ev-year">${year}</span>
    ${pubTypes}
    ${cited}
  </div>
  <p class="mri-nm-ev-title">${p.title || '(No title)'}</p>
  ${authorStr ? `<p class="mri-nm-ev-authors">${authorStr}${journal ? ' · ' + journal : ''}</p>` : ''}
  ${hasAbstract ? `<p class="mri-nm-ev-abstract">${p.abstract.slice(0, 220)}…</p>` : ''}
  <div class="mri-nm-ev-links">${oaLink}${doiLink}</div>
</div>`;
  }).join('');

  return `
<div class="mri-nm-evidence-pane">
  <div class="mri-nm-ev-header">
    <span class="mri-nm-ev-count">${papers.length} paper${papers.length !== 1 ? 's' : ''} from evidence corpus</span>
    <code class="mri-nm-ev-query">${query}</code>
  </div>
  <div class="mri-nm-ev-list">${cards}</div>
</div>`;
}

function renderDemoEvidence(sign) {
  // Synthetic evidence cards for demo mode — realistic but not real papers
  const demos = (sign.source_refs || []).map(r => ({
    title: r.title,
    year: r.year,
    authors: ['(see reference)'],
    journal: '',
    abstract: sign.evidence_notes || '',
    oa_url: r.url,
    doi: null,
    pub_types: ['Journal Article'],
    cited_by_count: null,
  }));

  return renderEvidencePapers(demos.length ? demos : [], sign.evidence_query || sign.name);
}

function renderReportPane(sign) {
  return `
<div class="mri-nm-report">
  <div class="mri-nm-report-phrase-block">
    <h4 class="mri-nm-section-label">Reporting phrase</h4>
    <p class="mri-nm-report-hint">Copy this structured phrase into your MRI report for consistent clinical communication.</p>
    <div class="mri-nm-report-box">
      <textarea
        id="mri-nm-report-textarea"
        class="mri-nm-report-textarea"
        readonly
        spellcheck="false"
      >${sign.reporting_phrase || ''}</textarea>
      <button class="mri-nm-copy-btn" data-copy-report>
        <svg viewBox="0 0 16 16" width="14" height="14"><rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M3 12V3h9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
        Copy
      </button>
    </div>
  </div>

  <div class="mri-nm-report-caveat">
    <svg viewBox="0 0 16 16" class="mri-nm-warn-icon"><path d="M8 2L15 14H1L8 2Z" stroke="#f43f5e" stroke-width="1.2" fill="rgba(244,63,94,0.1)" stroke-linejoin="round"/><path d="M8 6v4M8 11.5v0" stroke="#f43f5e" stroke-width="1.4" stroke-linecap="round"/></svg>
    <div>
      <strong>Clinical caveat</strong>
      <p>${sign.clinical_caveat || 'Pattern-recognition aid only. Clinical correlation and specialist assessment are required before any diagnostic conclusion.'}</p>
    </div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main init
// ─────────────────────────────────────────────────────────────────────────────
export async function initMRINeuromarkersTab() {
  const listEl    = document.getElementById('mri-nm-list');
  const emptyEl   = document.getElementById('mri-nm-empty');
  const detailEl  = document.getElementById('mri-nm-sign-detail');
  const countEl   = document.getElementById('mri-nm-count');
  const searchEl  = document.getElementById('mri-nm-search');
  const clearBtn  = document.getElementById('mri-nm-search-clear');
  const catSel    = document.getElementById('mri-nm-cat');
  const seqSel    = document.getElementById('mri-nm-seq');
  const modalSel  = document.getElementById('mri-nm-modality');

  let allSigns = [];        // loaded from API or demo
  let selectedSign = null;
  let activeTab = 'overview';
  let evidenceCache = {};   // sign id → papers[]

  // ── Load signs ──────────────────────────────────────────────────────────────
  async function loadSigns() {
    listEl.innerHTML = '<div class="mri-nm-loading"><span class="mri-nm-spinner"></span>Loading…</div>';

    if (isDemoSession()) {
      allSigns = DEMO_SIGNS;
      renderList(allSigns);
      return;
    }

    try {
      const params = new URLSearchParams({ limit: 100 });
      const q = searchEl?.value.trim();
      const cat = catSel?.value;
      const seq = seqSel?.value;
      const mod = modalSel?.value;
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      if (seq) params.set('sequence', seq);
      if (mod) params.set('modality', mod);

      const res = await api.get(`/api/neuro-signs/?${params}`);
      allSigns = res.data?.items || [];
      renderList(allSigns);
    } catch (err) {
      console.error('MRI neuromarkers load error:', err);
      // Fallback to demo data so the page is never blank
      allSigns = DEMO_SIGNS;
      renderList(allSigns);
    }
  }

  // ── Render list ─────────────────────────────────────────────────────────────
  function renderList(signs) {
    if (countEl) countEl.textContent = `${signs.length} sign${signs.length !== 1 ? 's' : ''}`;

    if (signs.length === 0) {
      listEl.innerHTML = '<p class="mri-nm-empty-list">No signs match the current filters.</p>';
      return;
    }

    listEl.innerHTML = signs.map(s =>
      renderSignCard(s, selectedSign?.id === s.id)
    ).join('');

    listEl.querySelectorAll('.mri-nm-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sign-id');
        const sign = signs.find(s => s.id === id);
        if (sign) selectSign(sign);
      });
    });
  }

  // ── Select sign ─────────────────────────────────────────────────────────────
  async function selectSign(sign) {
    selectedSign = sign;
    activeTab = 'overview';

    // Update card selection state
    listEl.querySelectorAll('.mri-nm-card').forEach(btn => {
      const isThis = btn.getAttribute('data-sign-id') === sign.id;
      btn.classList.toggle('selected', isThis);
      btn.setAttribute('aria-pressed', String(isThis));
    });

    // Show detail panel
    emptyEl.style.display = 'none';
    detailEl.style.display = 'flex';

    // Header
    const color = categoryColor(sign.category);
    document.getElementById('mri-nm-detail-name').textContent = sign.name;
    const badge = document.getElementById('mri-nm-detail-badge');
    badge.textContent = sign.category;
    badge.className = 'badge';
    badge.style.cssText = `background:${color}22;color:${color};border:1px solid ${color}55;`;

    const metaEl = document.getElementById('mri-nm-detail-meta');
    const seqStr = (sign.sequences || []).join(' · ');
    const anatStr = (sign.anatomy || []).join(' · ');
    metaEl.innerHTML = [
      sign.modality && `<span class="mri-nm-meta-chip">${sign.modality}</span>`,
      seqStr && `<span class="mri-nm-meta-chip">${seqStr}</span>`,
      anatStr && `<span class="mri-nm-meta-chip mri-nm-meta-anat">${anatStr}</span>`,
    ].filter(Boolean).join('');

    // Reset tabs
    document.querySelectorAll('.mri-nm-tab').forEach(t =>
      t.classList.toggle('active', t.getAttribute('data-tab') === 'overview'));
    document.querySelectorAll('.mri-nm-pane').forEach(p =>
      p.classList.toggle('active', p.getAttribute('data-pane') === 'overview'));

    // Render panes
    document.getElementById('mri-nm-pane-overview').innerHTML = renderOverviewPane(sign);
    document.getElementById('mri-nm-pane-imaging').innerHTML = renderImagingPane(sign);
    document.getElementById('mri-nm-pane-pathophysiology').innerHTML = renderPathophysiologyPane(sign);
    document.getElementById('mri-nm-pane-evidence').innerHTML = renderEvidenceLoading();
    document.getElementById('mri-nm-pane-report').innerHTML = renderReportPane(sign);

    bindImagingTabs();
    bindReportCopy();

    // Load evidence async (don't await — let it populate in background)
    loadEvidence(sign);

    // Scroll detail to top
    detailEl.scrollTop = 0;
  }

  // ── Evidence fetch ───────────────────────────────────────────────────────────
  async function loadEvidence(sign) {
    const pane = document.getElementById('mri-nm-pane-evidence');

    if (isDemoSession()) {
      pane.innerHTML = renderDemoEvidence(sign);
      return;
    }

    // Use cache
    if (evidenceCache[sign.id]) {
      pane.innerHTML = renderEvidencePapers(evidenceCache[sign.id], sign.evidence_query || sign.name);
      return;
    }

    const query = sign.evidence_query
      || [sign.name, ...(sign.primary_conditions || []).slice(0, 1)].join(' ');

    try {
      const params = new URLSearchParams({
        q: query,
        limit: 10,
        include_abstract: 'true',
        has_abstract: 'true',
      });
      const res = await api.get(`/api/v1/evidence/papers?${params}`);
      const papers = res.data || [];
      evidenceCache[sign.id] = papers;
      // Only update if this sign is still selected
      if (selectedSign?.id === sign.id) {
        pane.innerHTML = renderEvidencePapers(papers, query);
      }
    } catch (err) {
      console.warn('Evidence fetch error:', err);
      if (selectedSign?.id === sign.id) {
        pane.innerHTML = `<div class="mri-nm-ev-empty">
          <p>Evidence database unavailable — check API connection.</p>
          <p class="mri-nm-muted">Query used: <code>${query}</code></p>
        </div>`;
      }
    }
  }

  // ── Tab switching ────────────────────────────────────────────────────────────
  document.getElementById('mri-nm-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.mri-nm-tab');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.mri-nm-tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.mri-nm-pane').forEach(p =>
      p.classList.toggle('active', p.getAttribute('data-pane') === tab));
  });

  // ── Imaging plane tabs ───────────────────────────────────────────────────────
  function bindImagingTabs() {
    const container = document.getElementById('mri-nm-pane-imaging');
    container?.addEventListener('click', (e) => {
      const btn = e.target.closest('.mri-nm-plane-tab');
      if (!btn) return;
      const plane = btn.getAttribute('data-plane');
      container.querySelectorAll('.mri-nm-plane-tab').forEach(t =>
        t.classList.toggle('active', t === btn));
      container.querySelectorAll('.mri-nm-atlas-view').forEach(v =>
        v.classList.toggle('active', v.getAttribute('data-plane-view') === plane));
    });
  }

  // ── Report copy ──────────────────────────────────────────────────────────────
  function bindReportCopy() {
    document.querySelector('[data-copy-report]')?.addEventListener('click', () => {
      const ta = document.getElementById('mri-nm-report-textarea');
      if (!ta) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(() => flashCopied());
      } else {
        ta.select();
        document.execCommand('copy');
        flashCopied();
      }
    });
  }

  function flashCopied() {
    const btn = document.querySelector('[data-copy-report]');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
  }

  // ── Search / filter events ───────────────────────────────────────────────────
  let debounceTimer;
  function scheduleLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadSigns, 280);
  }

  searchEl?.addEventListener('input', () => {
    if (clearBtn) clearBtn.style.display = searchEl.value ? 'flex' : 'none';
    scheduleLoad();
  });
  searchEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSigns(); });
  clearBtn?.addEventListener('click', () => {
    searchEl.value = '';
    clearBtn.style.display = 'none';
    loadSigns();
  });
  catSel?.addEventListener('change', loadSigns);
  seqSel?.addEventListener('change', loadSigns);
  modalSel?.addEventListener('change', loadSigns);

  // ── Initial load ─────────────────────────────────────────────────────────────
  await loadSigns();
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
export const MRI_NEUROMARKERS_STYLES = `
/* ── Root layout ── */
.mri-nm-root {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: calc(100vh - 185px);
  min-height: 560px;
  max-height: 920px;
  background: #0b1120;
  color: var(--text-primary, #e2e8f0);
  overflow: hidden;
  border-radius: 0.5rem;
  border: 1px solid rgba(255,255,255,0.06);
}
@media (max-width: 768px) {
  .mri-nm-root { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
}

/* ── Sidebar ── */
.mri-nm-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
  background: rgba(255,255,255,0.015);
}
.mri-nm-sidebar-top {
  padding: 1.25rem 1.25rem 0;
  flex-shrink: 0;
}
.mri-nm-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary, #e2e8f0);
  margin: 0 0 0.2rem;
}
.mri-nm-subtitle {
  font-size: 0.78rem;
  color: rgba(148,163,184,0.7);
  margin: 0 0 1rem;
}

/* Controls */
.mri-nm-controls {
  padding: 0 1rem 0.75rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.mri-nm-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.mri-nm-search-icon {
  position: absolute;
  left: 0.7rem;
  width: 15px;
  height: 15px;
  color: rgba(148,163,184,0.5);
  pointer-events: none;
}
.mri-nm-search-input {
  width: 100%;
  padding: 0.6rem 2.2rem 0.6rem 2.2rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.4rem;
  color: var(--text-primary, #e2e8f0);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.mri-nm-search-input:focus { border-color: rgba(100,200,255,0.4); }
.mri-nm-search-clear {
  position: absolute;
  right: 0.6rem;
  background: none;
  border: none;
  color: rgba(148,163,184,0.6);
  cursor: pointer;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  padding: 0.2rem;
}
.mri-nm-filters {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.mri-nm-select {
  width: 100%;
  padding: 0.5rem 0.7rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem;
  color: var(--text-primary, #e2e8f0);
  font-size: 0.82rem;
  outline: none;
  cursor: pointer;
}
.mri-nm-select option { background: #1e293b; }

/* List header */
.mri-nm-list-header {
  padding: 0 1.25rem 0.4rem;
  flex-shrink: 0;
}
.mri-nm-count {
  font-size: 0.75rem;
  color: rgba(148,163,184,0.5);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Sign list */
.mri-nm-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.mri-nm-list::-webkit-scrollbar { width: 4px; }
.mri-nm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
.mri-nm-empty-list {
  text-align: center;
  color: rgba(148,163,184,0.4);
  font-size: 0.85rem;
  padding: 2rem 0;
}

/* Sign card */
.mri-nm-card {
  width: 100%;
  text-align: left;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-left: 3px solid transparent;
  border-radius: 0.45rem;
  padding: 0.75rem 0.875rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.12s;
  color: inherit;
}
.mri-nm-card:hover {
  background: rgba(100,200,255,0.05);
  border-color: rgba(100,200,255,0.18);
  transform: translateX(2px);
}
.mri-nm-card.selected {
  background: rgba(100,200,255,0.07);
  border-left-color: var(--cat-color, #64c8ff);
  border-top-color: rgba(100,200,255,0.2);
  border-right-color: rgba(100,200,255,0.1);
  border-bottom-color: rgba(100,200,255,0.1);
}
.mri-nm-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.mri-nm-card-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #f1f5f9;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mri-nm-cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mri-nm-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.4rem;
}
.mri-nm-seq-tag, .mri-nm-anat-tag {
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  font-weight: 500;
}
.mri-nm-seq-tag {
  background: rgba(59,130,246,0.15);
  color: #93c5fd;
}
.mri-nm-anat-tag {
  background: rgba(100,200,255,0.1);
  color: rgba(100,200,255,0.85);
}
.mri-nm-card-desc {
  font-size: 0.78rem;
  color: rgba(148,163,184,0.75);
  line-height: 1.45;
  margin: 0 0 0.35rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mri-nm-card-conditions {
  font-size: 0.72rem;
  color: rgba(148,163,184,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Detail panel ── */
.mri-nm-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d1626;
}
.mri-nm-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.mri-nm-empty-inner {
  text-align: center;
  max-width: 340px;
}
.mri-nm-empty-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.25rem;
  display: block;
}
.mri-nm-empty-inner h3 {
  font-size: 1.1rem;
  color: rgba(148,163,184,0.7);
  margin: 0 0 0.5rem;
}
.mri-nm-empty-inner p {
  font-size: 0.85rem;
  color: rgba(148,163,184,0.45);
  line-height: 1.55;
}

/* Sign detail */
.mri-nm-sign-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Detail header */
.mri-nm-detail-header {
  padding: 1.1rem 1.5rem 0.9rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  background: rgba(255,255,255,0.01);
}
.mri-nm-detail-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}
.mri-nm-detail-title-row h2 {
  font-size: 1.3rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}
.mri-nm-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.mri-nm-meta-chip {
  font-size: 0.73rem;
  padding: 0.2rem 0.6rem;
  border-radius: 3px;
  background: rgba(255,255,255,0.06);
  color: rgba(148,163,184,0.85);
}
.mri-nm-meta-anat {
  background: rgba(100,200,255,0.08);
  color: rgba(100,200,255,0.8);
}

/* Tabs nav */
.mri-nm-tabs {
  display: flex;
  padding: 0 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  gap: 0;
  overflow-x: auto;
}
.mri-nm-tabs::-webkit-scrollbar { height: 2px; }
.mri-nm-tab {
  padding: 0.7rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(148,163,184,0.6);
  font-size: 0.83rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.mri-nm-tab:hover { color: rgba(148,163,184,0.9); }
.mri-nm-tab.active {
  color: #64c8ff;
  border-bottom-color: #64c8ff;
}

/* Tab body */
.mri-nm-tab-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
}
.mri-nm-tab-body::-webkit-scrollbar { width: 4px; }
.mri-nm-tab-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }
.mri-nm-pane {
  display: none;
  padding: 1.5rem;
  min-height: 100%;
}
.mri-nm-pane.active { display: block; }

/* ── Section labels ── */
.mri-nm-section-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(100,200,255,0.7);
  margin: 0 0 0.6rem;
}

/* Pills */
.mri-nm-pills { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.mri-nm-pill {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-weight: 500;
}
.mri-nm-pill-seq { background: rgba(59,130,246,0.15); color: #93c5fd; }
.mri-nm-pill-anat { background: rgba(100,200,255,0.1); color: rgba(100,200,255,0.9); }
.mri-nm-pill-mod { background: rgba(168,85,247,0.15); color: #c084fc; }

/* Muted */
.mri-nm-muted { color: rgba(148,163,184,0.45); font-size: 0.82rem; }
.mri-nm-muted-text { color: rgba(148,163,184,0.7); line-height: 1.6; font-size: 0.88rem; }

/* ── Overview pane ── */
.mri-nm-overview { display: flex; flex-direction: column; gap: 1.25rem; }
.mri-nm-overview-desc p { color: rgba(203,213,225,0.85); line-height: 1.7; font-size: 0.9rem; }
.mri-nm-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}
.mri-nm-ov-block {}
.mri-nm-ov-conditions { }
.mri-nm-cond-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.mri-nm-cond-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: rgba(203,213,225,0.8); }
.mri-nm-cond-primary { color: #e2e8f0; font-weight: 500; }
.mri-nm-cond-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* ── Imaging pane ── */
.mri-nm-imaging { display: flex; flex-direction: column; gap: 1rem; }
.mri-nm-plane-tabs { display: flex; gap: 0.5rem; }
.mri-nm-plane-tab {
  padding: 0.4rem 0.9rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem;
  color: rgba(148,163,184,0.7);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.mri-nm-plane-tab:hover { background: rgba(100,200,255,0.07); color: #94a3b8; }
.mri-nm-plane-tab.active {
  background: rgba(100,200,255,0.1);
  border-color: rgba(100,200,255,0.35);
  color: #64c8ff;
}
.mri-nm-atlas-container { position: relative; }
.mri-nm-atlas-view { display: none; }
.mri-nm-atlas-view.active { display: block; }
.mri-nm-atlas-frame {
  position: relative;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: #060c18;
  max-width: 480px;
}
.mri-nm-atlas-img {
  width: 100%;
  display: block;
  filter: brightness(0.85) contrast(1.05);
  border-radius: 0.5rem;
}
.mri-nm-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.mri-nm-overlay-legend {
  position: absolute;
  bottom: 0.6rem;
  left: 0.6rem;
  background: rgba(6,12,24,0.85);
  border: 1px solid rgba(100,200,255,0.3);
  border-radius: 0.3rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  color: rgba(100,200,255,0.9);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.mri-nm-overlay-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(100,200,255,0.8);
  animation: legendpulse 2s ease-in-out infinite;
}
@keyframes legendpulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
.mri-nm-overlay-no-map {
  position: absolute;
  bottom: 0.6rem;
  left: 0.6rem;
  font-size: 0.7rem;
  color: rgba(148,163,184,0.35);
}
.mri-nm-imaging-notes {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: rgba(148,163,184,0.5);
  line-height: 1.5;
  padding: 0.6rem 0.75rem;
  background: rgba(255,255,255,0.02);
  border-radius: 0.375rem;
  border: 1px solid rgba(255,255,255,0.05);
}
.mri-nm-info-icon { width: 14px; height: 14px; flex-shrink: 0; color: rgba(100,200,255,0.4); margin-top: 0.1rem; }

/* ── Pathophysiology pane ── */
.mri-nm-patho { display: flex; flex-direction: column; gap: 1.25rem; }
.mri-nm-patho-block {}
.mri-nm-patho-block p { color: rgba(203,213,225,0.8); line-height: 1.7; font-size: 0.88rem; }
.mri-nm-ref-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.mri-nm-ref-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 0.375rem;
  align-items: flex-start;
}
.mri-nm-ref-year {
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(100,200,255,0.7);
  white-space: nowrap;
  padding-top: 0.1rem;
}
.mri-nm-ref-title {
  font-size: 0.83rem;
  color: rgba(203,213,225,0.8);
  display: block;
  margin-bottom: 0.25rem;
}
.mri-nm-ref-link {
  font-size: 0.73rem;
  color: #64c8ff;
  text-decoration: none;
}
.mri-nm-ref-link:hover { text-decoration: underline; }

/* ── Evidence pane ── */
.mri-nm-ev-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: rgba(148,163,184,0.5);
  font-size: 0.85rem;
  padding: 1.5rem 0;
}
.mri-nm-ev-empty {
  padding: 1.5rem 0;
  color: rgba(148,163,184,0.5);
  font-size: 0.85rem;
  line-height: 1.6;
}
.mri-nm-ev-empty code { font-size: 0.75rem; background: rgba(255,255,255,0.05); padding: 0.15rem 0.4rem; border-radius: 3px; }
.mri-nm-evidence-pane { display: flex; flex-direction: column; gap: 0.75rem; }
.mri-nm-ev-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.mri-nm-ev-count {
  font-size: 0.75rem;
  color: rgba(100,200,255,0.6);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.mri-nm-ev-query {
  font-size: 0.68rem;
  color: rgba(148,163,184,0.35);
  background: rgba(255,255,255,0.03);
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mri-nm-ev-list { display: flex; flex-direction: column; gap: 0.6rem; }
.mri-nm-ev-card {
  padding: 0.875rem 1rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 0.45rem;
  transition: border-color 0.15s;
}
.mri-nm-ev-card:hover { border-color: rgba(100,200,255,0.2); }
.mri-nm-ev-card-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}
.mri-nm-ev-year { font-size: 0.75rem; font-weight: 700; color: rgba(100,200,255,0.7); }
.mri-nm-ev-type { font-size: 0.68rem; padding: 0.1rem 0.45rem; background: rgba(168,85,247,0.12); color: #c084fc; border-radius: 3px; }
.mri-nm-ev-cited { font-size: 0.72rem; color: rgba(251,191,36,0.7); margin-left: auto; }
.mri-nm-ev-title { font-size: 0.88rem; color: #e2e8f0; font-weight: 500; line-height: 1.45; margin: 0 0 0.3rem; }
.mri-nm-ev-authors { font-size: 0.75rem; color: rgba(148,163,184,0.55); margin: 0 0 0.4rem; }
.mri-nm-ev-abstract { font-size: 0.78rem; color: rgba(148,163,184,0.65); line-height: 1.55; margin: 0 0 0.5rem; }
.mri-nm-ev-links { display: flex; gap: 0.5rem; }
.mri-nm-ev-oa, .mri-nm-ev-doi { font-size: 0.73rem; color: #64c8ff; text-decoration: none; }
.mri-nm-ev-oa:hover, .mri-nm-ev-doi:hover { text-decoration: underline; }

/* ── Report pane ── */
.mri-nm-report { display: flex; flex-direction: column; gap: 1.25rem; }
.mri-nm-report-hint { font-size: 0.8rem; color: rgba(148,163,184,0.55); margin: 0 0 0.75rem; }
.mri-nm-report-box {
  position: relative;
  border-radius: 0.45rem;
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.mri-nm-report-textarea {
  width: 100%;
  min-height: 140px;
  padding: 0.875rem 1rem 2.5rem;
  background: rgba(0,0,0,0.3);
  border: none;
  color: #cbd5e1;
  font-family: 'Fira Code', 'Courier New', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
}
.mri-nm-copy-btn {
  position: absolute;
  bottom: 0.5rem;
  right: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  background: rgba(100,200,255,0.1);
  border: 1px solid rgba(100,200,255,0.25);
  border-radius: 0.3rem;
  color: #64c8ff;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.mri-nm-copy-btn:hover { background: rgba(100,200,255,0.18); }
.mri-nm-copy-btn.copied { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); color: #4ade80; }
.mri-nm-report-caveat {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.875rem 1rem;
  background: rgba(244,63,94,0.06);
  border: 1px solid rgba(244,63,94,0.2);
  border-radius: 0.45rem;
}
.mri-nm-warn-icon { width: 18px; height: 18px; flex-shrink: 0; margin-top: 0.1rem; }
.mri-nm-report-caveat strong { font-size: 0.82rem; color: #f87171; display: block; margin-bottom: 0.3rem; }
.mri-nm-report-caveat p { font-size: 0.8rem; color: rgba(248,113,113,0.75); line-height: 1.55; margin: 0; }

/* ── Loading spinner ── */
.mri-nm-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: rgba(148,163,184,0.45);
  font-size: 0.82rem;
  padding: 1.5rem 0;
  justify-content: center;
}
.mri-nm-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(100,200,255,0.15);
  border-top-color: rgba(100,200,255,0.7);
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Badge base (used in detail header) */
.badge {
  display: inline-block;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
  letter-spacing: 0.03em;
}
`;
