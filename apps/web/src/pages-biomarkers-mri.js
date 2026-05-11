/**
 * MRI Neuromarkers Library — redesigned two-panel interface.
 *
 * Left  : filterable sign list
 * Right : tabbed detail — Overview | Imaging | Pathophysiology | Evidence | Report
 *
 * Evidence tab auto-queries /api/v1/evidence/papers using the sign name +
 * primary conditions as FTS5 search terms, wiring every neuromarker to the
 * live literature corpus.
 *
 * Imaging tab shows sagittal / axial / coronal brain-atlas planes with a
 * pulsing SVG overlay highlighting the affected anatomy region.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';

// ─── Anatomy → approximate overlay coordinates (% of container) ──────────────
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
  ventricles:        { sagittal: [51,48,10,10], axial: [50,50,10,8],   coronal: [50,46,10,10] },
  'substantia nigra':{ sagittal: [53,70,6,4],   axial: [50,66,10,6],   coronal: [50,68,8,5]   },
  meninges:          { sagittal: [50,20,30,8],  axial: [50,18,34,8],   coronal: [50,16,30,8]  },
  liver:             { sagittal: [45,60,20,18], axial: [40,58,22,16],  coronal: [45,56,20,16] },
  'cortical vasculature': { sagittal: [50,28,30,26], axial: [50,26,34,28], coronal: [50,24,30,26] },
};

const PLANES = ['sagittal', 'axial', 'coronal'];

const CAT_COLOR = {
  neurodegenerative: '#f43f5e',
  metabolic:         '#fb923c',
  'metabolic/hepatic': '#fb923c',
  demyelinating:     '#3b82f6',
  vascular:          '#ef4444',
  tumoral:           '#a855f7',
  developmental:     '#22c55e',
  cerebellar:        '#0ea5e9',
  infectious:        '#eab308',
};
function categoryColor(cat) {
  return CAT_COLOR[(cat || '').toLowerCase()] ?? '#94a3b8';
}

// ─── Demo signs ───────────────────────────────────────────────────────────────
const DEMO_SIGNS = [
  {
    id: 'demo_hummingbird', slug: 'hummingbird-sign',
    name: 'Hummingbird Sign', category: 'neurodegenerative', modality: 'MRI',
    sequences: ['T1','T2'], anatomy: ['midbrain','brainstem'],
    primary_conditions: ['Progressive Supranuclear Palsy (PSP)'],
    associated_conditions: ['Multiple System Atrophy','Corticobasal Syndrome'],
    visual_description: 'Selective atrophy of the midbrain tegmentum on mid-sagittal T1/T2. The slender midbrain with preserved pons creates a silhouette resembling a hummingbird in flight — narrow "beak" (midbrain) above a rounded "body" (pons).',
    pathophysiology_explanation: 'PSP causes selective tau deposition in the midbrain, subthalamic nucleus, and globus pallidus. Midbrain AP diameter < 17 mm and midbrain/pons area ratio < 0.12 are quantitative thresholds. Sensitivity ~68–72%, specificity ~88–95% for PSP vs other parkinsonism.',
    differential_diagnosis: 'MSA-P (Mickey Mouse sign on axial), CBD, DLB, Parkinson\'s disease (midbrain preserved). Age-related atrophy may confound in patients > 70.',
    clinical_caveat: 'Pattern-recognition aid only. Clinical correlation including vertical gaze palsy, postural instability, and falls history is required. PSP-P variant may lack the sign early.',
    reporting_phrase: 'Mid-sagittal T1 demonstrates selective midbrain tegmentum atrophy with preserved pons, producing the "hummingbird sign." Findings are consistent with midbrain-predominant neurodegeneration as seen in PSP. Clinical correlation advised.',
    evidence_notes: 'Höglinger GU et al. (2017) MDS criteria for PSP — midbrain imaging is a core supportive feature (Level A). Kato N et al. (2003) first described the sign; sensitivity 68.4% for PSP vs 0% controls.',
    source_refs: [
      { title: 'Höglinger et al. MDS criteria for PSP', year: 2017, url: 'https://pubmed.ncbi.nlm.nih.gov/28467028/' },
      { title: 'Kato N et al. Hummingbird sign in PSP', year: 2003, url: 'https://pubmed.ncbi.nlm.nih.gov/14506075/' },
    ],
    evidence_query: 'progressive supranuclear palsy midbrain atrophy hummingbird MRI',
    best_plane: 'sagittal',
  },
  {
    id: 'demo_mickey', slug: 'mickey-mouse-sign',
    name: 'Mickey Mouse Sign', category: 'neurodegenerative', modality: 'MRI',
    sequences: ['T2','FLAIR'], anatomy: ['midbrain'],
    primary_conditions: ['Multiple System Atrophy (MSA-P)','Progressive Supranuclear Palsy'],
    associated_conditions: ['Parkinsonism-plus syndromes'],
    visual_description: 'On axial T2 through the upper midbrain, lateral sulci remain patent while the tectum is atrophic — the cerebral peduncles form "ears" giving a Mickey Mouse cross-section silhouette.',
    pathophysiology_explanation: 'MSA-P (striatonigral degeneration) causes selective loss in putamen, substantia nigra, and inferior olives. The lateral tegmentum is relatively spared vs PSP. T2 putaminal hypointensity with a hyperintense rim ("putaminal slit sign") frequently co-occurs.',
    differential_diagnosis: 'PSP (hummingbird on sagittal, more superior atrophy), vascular parkinsonism, DLB.',
    clinical_caveat: 'Axial plane through the superior colliculi is critical — slightly off-axis cuts can simulate or obscure the sign. Pattern-recognition aid only.',
    reporting_phrase: 'Axial T2 at the level of the superior midbrain demonstrates preserved lateral sulci with relative tegmental atrophy, consistent with the "Mickey Mouse" configuration. Combined with putaminal signal change, findings favour MSA-P. Clinical correlation required.',
    evidence_notes: 'Bhatt M et al. (2018): Mickey Mouse sign sensitivity 71% for MSA-P (Mov Disord 33:291).',
    source_refs: [
      { title: 'Bhatt et al. MRI signs in MSA-P vs PSP', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29266488/' },
    ],
    evidence_query: 'multiple system atrophy midbrain MRI parkinsonian MSA-P',
    best_plane: 'axial',
  },
  {
    id: 'demo_hotcrossbun', slug: 'hot-cross-bun-sign',
    name: 'Hot Cross Bun Sign', category: 'neurodegenerative', modality: 'MRI',
    sequences: ['T2','FLAIR'], anatomy: ['pons'],
    primary_conditions: ['Multiple System Atrophy (MSA-C)'],
    associated_conditions: ['Spinocerebellar ataxia (SCA-3)','Prion disease (rare)'],
    visual_description: 'Cruciform T2 hyperintensity within the pons on axial imaging, reflecting selective degeneration of transverse pontocerebellar fibres and pontine nuclei while corticospinal tracts remain isointense.',
    pathophysiology_explanation: 'MSA-C (olivopontocerebellar atrophy) causes α-synuclein glial cytoplasmic inclusions preferentially affecting pontine tegmental nuclei, middle cerebellar peduncles, and inferior olives. The cross pattern maps the topography of pontine nuclei whose myelinated projections degenerate while pyramidal fibres are initially spared.',
    differential_diagnosis: 'SCA-3 (Machado-Joseph): CAG repeat expansion. Prion disease: rapid onset, CSF 14-3-3 positive. Sign is highly specific (>95%) but present in only ~60% of pathology-confirmed MSA-C.',
    clinical_caveat: 'Axial T2 slice must be centred at mid-pons. High field (3T) improves sensitivity. Pattern-recognition aid only.',
    reporting_phrase: 'Axial T2 through the mid-pons demonstrates cruciform signal hyperintensity consistent with the "hot cross bun sign." Cerebellar and middle cerebellar peduncle atrophy also present. Findings highly consistent with MSA-C (olivopontocerebellar type).',
    evidence_notes: 'Massey LA et al. (2012): sign present in 60% of pathology-confirmed MSA at symptom onset. Bhatt (2018): specificity 99%, sensitivity 63% for MSA-C.',
    source_refs: [
      { title: 'Massey et al. MRI sensitivity and specificity in MSA', year: 2012, url: 'https://pubmed.ncbi.nlm.nih.gov/22806540/' },
      { title: 'Bhatt et al. Diagnostic MRI signs in MSA subtypes', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29266488/' },
    ],
    evidence_query: 'multiple system atrophy cerebellar pons hot cross bun MRI',
    best_plane: 'axial',
  },
  {
    id: 'demo_butterfly', slug: 'butterfly-glioma',
    name: 'Butterfly Glioma', category: 'tumoral', modality: 'MRI',
    sequences: ['T1','T2','FLAIR','contrast-enhanced'], anatomy: ['corpus callosum','white matter'],
    primary_conditions: ['Glioblastoma Multiforme (GBM)','Diffuse midline glioma'],
    associated_conditions: ['CNS lymphoma (mimic)','Tumefactive MS (rare mimic)'],
    visual_description: 'Infiltrating heterogeneous mass spanning the corpus callosum with bilateral symmetric white matter extension creating a butterfly silhouette on axial/coronal FLAIR. Central necrosis with peripheral ring enhancement on contrast T1 is characteristic.',
    pathophysiology_explanation: 'GBM spreads along compact white matter tracts (corpus callosum, internal capsule) and perivascular spaces. Bilateral corpus callosal involvement marks transcallosal spread — a marker of highly infiltrative behaviour. WHO grade IV designation reflects IDH-wildtype genotype in most adults.',
    differential_diagnosis: 'CNS lymphoma (homogeneous DWI restriction, responds to steroids). Tumefactive MS (younger, incomplete ring, less mass effect). Bihemispheric cerebritis (septic, fever).',
    clinical_caveat: 'Despite dramatic appearance, tissue diagnosis is mandatory. DWI, MR spectroscopy (elevated Cho/Cr, reduced NAA), and perfusion (elevated rCBV) narrow differentials but do not replace biopsy.',
    reporting_phrase: 'Axial FLAIR demonstrates bilateral infiltrating mass centred on the corpus callosum with "butterfly" bihemispheric extension and surrounding vasogenic oedema. Post-contrast T1 shows thick irregular ring enhancement with central necrosis. Imaging most consistent with GBM; tissue confirmation required.',
    evidence_notes: 'Stupp R et al. (2005) established standard of care — temozolomide trial (NEJM 352:987). Wen PY et al. (2020) WHO 2021 GBM classification.',
    source_refs: [
      { title: 'Stupp R et al. Temozolomide for GBM (landmark)', year: 2005, url: 'https://pubmed.ncbi.nlm.nih.gov/15758010/' },
      { title: 'Wen PY et al. Glioblastoma 2020 WHO Classification', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/32109013/' },
    ],
    evidence_query: 'glioblastoma corpus callosum butterfly MRI IDH treatment',
    best_plane: 'axial',
  },
  {
    id: 'demo_dawsons', slug: 'dawsons-fingers',
    name: "Dawson's Fingers", category: 'demyelinating', modality: 'MRI',
    sequences: ['T2','FLAIR'], anatomy: ['periventricular','white matter'],
    primary_conditions: ['Multiple Sclerosis (MS)'],
    associated_conditions: ['NMOSD (mimic)','ADEM'],
    visual_description: 'Linear T2/FLAIR hyperintensities radiating perpendicular to the lateral ventricles along periventricular medullary veins on sagittal FLAIR. On axial views appear as ovoid "barleycorn" lesions > 3 mm abutting the ventricle.',
    pathophysiology_explanation: 'MS demyelinating plaques develop around centrovenous vessels running perpendicular to the lateral ventricles. FLAIR suppresses CSF signal, making periventricular lesions visible. Juxtacortical, infratentorial, and spinal cord lesions are complementary McDonald criteria sites.',
    differential_diagnosis: 'NMOSD: longer cord lesions > 3 vertebral segments, area postrema involvement, AQP4-IgG positive. ADEM: monophasic post-infectious, diffuse, basal ganglia involved. Migraine: non-specific, not perpendicular.',
    clinical_caveat: '2017 McDonald criteria require dissemination in space (2+ locations) and time. Radiologically-isolated syndrome may show the sign without clinical symptoms. Formal MS diagnosis requires neurologist assessment.',
    reporting_phrase: 'Sagittal FLAIR demonstrates multiple periventricular ovoid T2 hyperintensities oriented perpendicular to the ventricular wall ("Dawson\'s fingers"), consistent with demyelinating plaques. Distribution satisfies McDonald criteria for dissemination in space. Contrast study recommended to assess active demyelination.',
    evidence_notes: 'Thompson AJ et al. (2018) revised 2017 McDonald criteria (Lancet Neurol 17:162). Filippi M et al. (2019) MRI guidelines for MS (Nat Rev Neurol).',
    source_refs: [
      { title: 'Thompson AJ et al. 2017 McDonald Criteria', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29275977/' },
      { title: 'Filippi M et al. MRI guidelines for MS', year: 2019, url: 'https://pubmed.ncbi.nlm.nih.gov/30777910/' },
    ],
    evidence_query: 'multiple sclerosis periventricular lesions FLAIR MRI McDonald criteria',
    best_plane: 'sagittal',
  },
  {
    id: 'demo_dwi_stroke', slug: 'dwi-restricted-diffusion',
    name: 'DWI Restricted Diffusion (Acute Stroke)', category: 'vascular', modality: 'MRI',
    sequences: ['DWI','T2','FLAIR'], anatomy: ['basal ganglia','thalamus','white matter'],
    primary_conditions: ['Acute Ischaemic Stroke'],
    associated_conditions: ['TIA (DWI+)','Hypoxic-ischaemic injury'],
    visual_description: 'Focal bright signal on DWI with corresponding dark (low) ADC map within minutes to hours of ischaemic onset, mapping to the vascular territory. MCA territory stroke produces a wedge-shaped cortical and subcortical lesion.',
    pathophysiology_explanation: 'Cytotoxic oedema from failed Na/K-ATPase leads to intracellular water accumulation within minutes. Water molecules lose diffusion freedom → high DWI signal, low ADC. DWI-FLAIR mismatch (DWI+ / FLAIR−) is a strong predictor of < 4.5 h window for thrombolysis.',
    differential_diagnosis: 'Hypoglycaemia (bilateral global DWI restriction — check BGL immediately). CJD (cortical ribboning, striatum). Wernicke (thalami, mammillary bodies). Osmotic demyelination (pontine/extrapontine, rapid sodium correction).',
    clinical_caveat: 'DWI-negative TIA: up to 17% have MRI-confirmed infarct on repeat imaging. ABCD2 score guides urgency. Pattern recognition tool only.',
    reporting_phrase: 'DWI demonstrates focal cortical/subcortical restricted diffusion with ADC hypointensity in the [territory] distribution, consistent with acute ischaemia. FLAIR is [normal/hyperintense], suggesting onset [within/beyond] ~4.5 hours. Urgent neurovascular assessment recommended.',
    evidence_notes: 'Thomalla G et al. WAKE-UP trial (2018) — DWI-FLAIR mismatch guided IV-tPA in wake-up stroke (NEJM 379:611). Powers WJ et al. (2019) AHA/ASA Stroke Guidelines.',
    source_refs: [
      { title: 'Thomalla G et al. WAKE-UP Trial', year: 2018, url: 'https://pubmed.ncbi.nlm.nih.gov/29766771/' },
      { title: 'Powers WJ et al. 2019 AHA/ASA Stroke Guidelines', year: 2019, url: 'https://pubmed.ncbi.nlm.nih.gov/30879355/' },
    ],
    evidence_query: 'acute ischaemic stroke DWI diffusion MRI thrombolysis treatment',
    best_plane: 'axial',
  },
  {
    id: 'demo_eye_tiger', slug: 'eye-of-tiger',
    name: 'Eye of the Tiger Sign', category: 'metabolic', modality: 'MRI',
    sequences: ['T2','SWI'], anatomy: ['basal ganglia','putamen','substantia nigra'],
    primary_conditions: ['PKAN (Pantothenate Kinase-Associated Neurodegeneration)','NBIA'],
    associated_conditions: ['Other NBIA subtypes (MPAN, BPAN)'],
    visual_description: 'Symmetric T2 hypointensity of the globus pallidus (iron accumulation) with a central zone of T2 hyperintensity (gliosis/tissue loss), forming an "eye" silhouette on axial imaging. SWI amplifies iron blooming artefact.',
    pathophysiology_explanation: 'PANK2 gene mutations → defective CoA synthesis → pantothenate accumulation → cysteine oxidation → iron chelation in globus pallidus. Progressive neuronal loss creates the central hyperintense gliosis core surrounded by iron-loaded hypointense rim. Onset typically age 3–4; dystonia is hallmark.',
    differential_diagnosis: 'Physiological pallidal iron (normal adults > 30 years — no central hyperintensity). Methylmalonyl acidaemia (bilateral T2 pallidal hyperintensity, no iron ring). Wilson disease (putaminal + thalamic, also liver disease).',
    clinical_caveat: 'Near-pathognomonic for PKAN when seen in childhood-onset dystonia context. Pattern-recognition aid — genetic confirmation (PANK2) is definitive.',
    reporting_phrase: 'Axial T2 demonstrates bilateral symmetric globus pallidus hypointensity with central hyperintensity consistent with the "eye of the tiger sign." SWI confirms marked iron deposition. In the context of early-onset dystonia, PKAN/NBIA is strongly favoured. PANK2 genetic panel recommended.',
    evidence_notes: 'Hayflick SJ et al. (2003) PANK2 mutations in PKAN with eye of the tiger sign (Ann Neurol 53:135). Gregory A et al. (2017) updated NBIA classification and imaging criteria.',
    source_refs: [
      { title: 'Hayflick SJ et al. PKAN genetics and MRI', year: 2003, url: 'https://pubmed.ncbi.nlm.nih.gov/12557282/' },
      { title: 'Gregory A et al. NBIA clinical features', year: 2017, url: 'https://pubmed.ncbi.nlm.nih.gov/28748625/' },
    ],
    evidence_query: 'PKAN NBIA globus pallidus iron MRI dystonia',
    best_plane: 'axial',
  },
  {
    id: 'demo_tigroid', slug: 'tigroid-mld',
    name: 'Tigroid Pattern (MLD)', category: 'metabolic', modality: 'MRI',
    sequences: ['T2','FLAIR'], anatomy: ['white matter','periventricular'],
    primary_conditions: ['Metachromatic Leukodystrophy (MLD)'],
    associated_conditions: ['Pelizaeus-Merzbacher disease','Krabbe disease'],
    visual_description: 'Symmetric confluent T2 hyperintensity throughout periventricular white matter with radially-oriented stripes of relatively preserved myelin producing a "tigroid" or "leopard skin" appearance on FLAIR.',
    pathophysiology_explanation: 'ARSA gene mutations → arylsulphatase A deficiency → sulphatide accumulation → metachromatic granule deposition → progressive demyelination. Centrifugal spread from periventricular white matter follows the reverse sequence of myelination. Perivascular fibres are last affected, explaining the preserved stripes.',
    differential_diagnosis: 'Krabbe disease (GALC deficiency — similar butterfly periventricular changes, also corticospinal tracts). X-ALD: asymmetric, starts posteriorly, boys. Alexander disease (frontal-predominant, Rosenthal fibres).',
    clinical_caveat: 'Pattern-recognition aid only. Enzyme assay (leucocyte ASA activity) and ARSA genotyping required for definitive diagnosis.',
    reporting_phrase: 'FLAIR shows symmetric confluent periventricular T2 hyperintensity with preserved radial perivascular stripes ("tigroid pattern"), sparing subcortical U-fibres. Distribution and morphology consistent with metachromatic leukodystrophy. Enzyme studies and genetic analysis recommended.',
    evidence_notes: 'Groeschel S et al. (2012) MRI-based score for MLD — tigroid pattern correlated with late-infantile onset (Brain 135:3489). Biffi A et al. (2013) gene therapy trial landmark (Science 341:1233).',
    source_refs: [
      { title: 'Groeschel S et al. MRI score for MLD severity', year: 2012, url: 'https://pubmed.ncbi.nlm.nih.gov/22940580/' },
      { title: 'Biffi A et al. Gene therapy in MLD', year: 2013, url: 'https://pubmed.ncbi.nlm.nih.gov/23845944/' },
    ],
    evidence_query: 'metachromatic leukodystrophy MRI white matter periventricular demyelination',
    best_plane: 'axial',
  },
];

// ─── SVG anatomy overlay ──────────────────────────────────────────────────────
function buildAnatomyOverlay(sign, plane) {
  const regions = (sign.anatomy || []).map(a => a.toLowerCase());
  const ellipses = [];
  for (const region of regions) {
    const coords = ANATOMY_COORDS[region];
    if (!coords?.[plane]) continue;
    const [cx, cy, rx, ry] = coords[plane];
    ellipses.push({ cx, cy, rx, ry });
  }
  if (!ellipses.length) return '';

  const uid = `p${plane[0]}${Math.random().toString(36).slice(2,6)}`;
  return `
<svg class="mri-nm-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="gl-${uid}"><feGaussianBlur stdDeviation="1.2" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
    <style>@keyframes nm-pulse-${uid}{0%,100%{opacity:.7}50%{opacity:1}}</style>
  </defs>
  ${ellipses.map(({cx,cy,rx,ry},i) => `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx+2}" ry="${ry+2}"
      fill="rgba(100,200,255,0.08)" stroke="rgba(100,200,255,0.3)" stroke-width="0.4"
      filter="url(#gl-${uid})" style="animation:nm-pulse-${uid} 2.5s ease-in-out ${i*.4}s infinite"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"
      fill="rgba(100,200,255,0.18)" stroke="rgba(100,200,255,0.9)" stroke-width="0.6"
      filter="url(#gl-${uid})" style="animation:nm-pulse-${uid} 2.5s ease-in-out ${i*.4}s infinite"/>
  `).join('')}
</svg>`;
}

// ─── Render helpers ────────────────────────────────────────────────────────────
function renderSignCard(sign, selected = false) {
  const color = categoryColor(sign.category);
  const seqTags = (sign.sequences || []).slice(0,4).map(s =>
    `<span class="mri-nm-seq-tag">${s}</span>`).join('');
  const anatTags = (sign.anatomy || []).slice(0,3).map(a =>
    `<span class="mri-nm-anat-tag">${a}</span>`).join('');
  const desc = (sign.visual_description || '').slice(0,110);
  return `
<button class="mri-nm-card${selected?' selected':''}" data-sign-id="${sign.id}"
  style="--cat-color:${color}" aria-pressed="${selected}">
  <div class="mri-nm-card-top">
    <span class="mri-nm-card-name">${sign.name}</span>
    <span class="mri-nm-cat-dot" style="background:${color}" title="${sign.category}"></span>
  </div>
  <div class="mri-nm-card-tags">${seqTags}${anatTags}</div>
  <p class="mri-nm-card-desc">${desc}${(sign.visual_description||'').length>110?'…':''}</p>
  <div class="mri-nm-card-conds">${(sign.primary_conditions||[]).slice(0,2).join(' · ')}</div>
</button>`;
}

function renderOverviewPane(sign) {
  const color = categoryColor(sign.category);
  const seqBadges = (sign.sequences||[]).map(s=>`<span class="mri-nm-pill pill-seq">${s}</span>`).join('');
  const anatBadges = (sign.anatomy||[]).map(a=>`<span class="mri-nm-pill pill-anat">${a}</span>`).join('');
  const pri = (sign.primary_conditions||[]).map(c=>`<li class="mri-nm-cond-item cond-primary">
    <span class="mri-nm-cond-dot" style="background:${color}"></span>${c}</li>`).join('');
  const assoc = (sign.associated_conditions||[]).map(c=>`<li class="mri-nm-cond-item">
    <span class="mri-nm-cond-dot" style="background:#475569"></span>${c}</li>`).join('');
  return `
<div class="mri-nm-overview">
  <div><h4 class="mri-nm-sec-label">Visual Description</h4>
    <p class="mri-nm-body-text">${sign.visual_description||'—'}</p></div>
  <div class="mri-nm-ov-grid">
    <div><h4 class="mri-nm-sec-label">Sequences</h4><div class="mri-nm-pills">${seqBadges||'<span class="mri-nm-muted">—</span>'}</div></div>
    <div><h4 class="mri-nm-sec-label">Anatomy</h4><div class="mri-nm-pills">${anatBadges||'<span class="mri-nm-muted">—</span>'}</div></div>
    <div><h4 class="mri-nm-sec-label">Modality</h4><div class="mri-nm-pills"><span class="mri-nm-pill pill-mod">${sign.modality||'MRI'}</span></div></div>
  </div>
  <div><h4 class="mri-nm-sec-label">Conditions</h4>
    <ul class="mri-nm-cond-list">${pri}${assoc}</ul></div>
  ${sign.differential_diagnosis?`<div><h4 class="mri-nm-sec-label">Differential Diagnosis</h4>
    <p class="mri-nm-body-text mri-nm-muted">${sign.differential_diagnosis}</p></div>`:''}
</div>`;
}

function renderImagingPane(sign) {
  const best = sign.best_plane || 'axial';
  const planeTabs = PLANES.map(p=>`<button class="mri-nm-plane-tab${p===best?' active':''}" data-plane="${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join('');
  const viewers = PLANES.map(p => {
    const overlay = buildAnatomyOverlay(sign, p);
    const hasOv = overlay.trim().length > 0;
    return `
<div class="mri-nm-atlas-view${p===best?' active':''}" data-plane-view="${p}">
  <div class="mri-nm-atlas-frame">
    <img src="/images/brain-atlas/${p}.png" alt="${p} brain atlas" class="mri-nm-atlas-img" loading="lazy"/>
    ${hasOv ? overlay : ''}
    ${hasOv
      ? `<div class="mri-nm-ov-legend"><span class="mri-nm-ov-dot"></span>${(sign.anatomy||[]).join(', ')}</div>`
      : `<div class="mri-nm-ov-none">No overlay for ${p} plane</div>`}
  </div>
</div>`;
  }).join('');
  return `
<div class="mri-nm-imaging">
  <div class="mri-nm-plane-tabs">${planeTabs}</div>
  <div class="mri-nm-atlas-container">${viewers}</div>
  <div class="mri-nm-img-note">
    <svg viewBox="0 0 16 16" class="mri-nm-info-ico"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2" fill="none"/>
    <path d="M8 7v5M8 5v0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    Anatomy overlays are schematic guides based on canonical atlas positions.
    Best viewed on the <strong>${best}</strong> plane for this sign.
  </div>
</div>`;
}

function renderPathophysiologyPane(sign) {
  const refs = (sign.source_refs||[]).map(r=>`
<li class="mri-nm-ref-item">
  <span class="mri-nm-ref-year">${r.year||'—'}</span>
  <div><span class="mri-nm-ref-title">${r.title}</span>
    ${r.url?`<a href="${r.url}" target="_blank" rel="noopener" class="mri-nm-ref-link">PubMed ↗</a>`:''}</div>
</li>`).join('');
  return `
<div class="mri-nm-patho">
  ${sign.pathophysiology_explanation?`<div><h4 class="mri-nm-sec-label">Pathophysiology</h4>
    <p class="mri-nm-body-text">${sign.pathophysiology_explanation}</p></div>`:''}
  ${sign.evidence_notes?`<div><h4 class="mri-nm-sec-label">Evidence Notes</h4>
    <p class="mri-nm-body-text mri-nm-muted">${sign.evidence_notes}</p></div>`:''}
  ${refs?`<div><h4 class="mri-nm-sec-label">Key References</h4>
    <ul class="mri-nm-ref-list">${refs}</ul></div>`:''}
</div>`;
}

function renderEvidenceLoading() {
  return `<div class="mri-nm-ev-loading"><span class="mri-nm-spinner"></span>Searching evidence corpus…</div>`;
}

function renderEvidencePapers(papers, query) {
  if (!papers?.length) return `<div class="mri-nm-ev-empty">
    <p>No papers found for this neuromarker.</p>
    <p class="mri-nm-muted">Query: <code>${query}</code></p></div>`;
  const cards = papers.map(p => {
    const authors = (p.authors||[]).slice(0,2);
    const authorStr = authors.length ? authors.join(', ')+(p.authors?.length>2?' et al.':'') : '';
    const pubTypes = (p.pub_types||[]).slice(0,2).map(t=>`<span class="mri-nm-ev-type">${t}</span>`).join('');
    const cited = p.cited_by_count!=null ? `<span class="mri-nm-ev-cited">★ ${p.cited_by_count}</span>` : '';
    const oaLink = p.oa_url ? `<a href="${p.oa_url}" target="_blank" rel="noopener" class="mri-nm-ev-link">Full text ↗</a>` : '';
    const doiLink = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noopener" class="mri-nm-ev-link">DOI ↗</a>` : '';
    const abs = p.abstract?.length > 50 ? `<p class="mri-nm-ev-abstract">${p.abstract.slice(0,220)}…</p>` : '';
    return `
<div class="mri-nm-ev-card">
  <div class="mri-nm-ev-top"><span class="mri-nm-ev-year">${p.year||'—'}</span>${pubTypes}${cited}</div>
  <p class="mri-nm-ev-title">${p.title||'(No title)'}</p>
  ${authorStr?`<p class="mri-nm-ev-authors">${authorStr}${p.journal?' · '+p.journal:''}</p>`:''}
  ${abs}
  <div class="mri-nm-ev-links">${oaLink}${doiLink}</div>
</div>`;
  }).join('');
  return `
<div class="mri-nm-ev-pane">
  <div class="mri-nm-ev-header">
    <span class="mri-nm-ev-count">${papers.length} paper${papers.length!==1?'s':''} from evidence corpus</span>
    <code class="mri-nm-ev-query">${query}</code>
  </div>
  <div class="mri-nm-ev-list">${cards}</div>
</div>`;
}

function renderDemoEvidence(sign) {
  const demos = (sign.source_refs||[]).map(r=>({
    title: r.title, year: r.year,
    authors: [], journal: '', abstract: sign.evidence_notes||'',
    oa_url: r.url, doi: null, pub_types: ['Journal Article'], cited_by_count: null,
  }));
  return renderEvidencePapers(demos, sign.evidence_query||sign.name);
}

function renderReportPane(sign) {
  return `
<div class="mri-nm-report">
  <h4 class="mri-nm-sec-label">Reporting Phrase</h4>
  <p class="mri-nm-report-hint">Copy this structured phrase into your MRI report.</p>
  <div class="mri-nm-report-box">
    <textarea id="mri-nm-report-ta" class="mri-nm-report-ta" readonly spellcheck="false">${sign.reporting_phrase||''}</textarea>
    <button class="mri-nm-copy-btn" data-copy-report>
      <svg viewBox="0 0 16 16" width="13" height="13"><rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
      <path d="M3 12V3h9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
      Copy
    </button>
  </div>
  <div class="mri-nm-caveat">
    <svg viewBox="0 0 16 16" class="mri-nm-warn-ico" width="18" height="18">
      <path d="M8 2L15 14H1L8 2Z" stroke="#f43f5e" stroke-width="1.2" fill="rgba(244,63,94,0.1)" stroke-linejoin="round"/>
      <path d="M8 6v4M8 11.5v0" stroke="#f43f5e" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    <div>
      <strong>Clinical caveat</strong>
      <p>${sign.clinical_caveat||'Pattern-recognition aid only. Clinical correlation and specialist assessment required before any diagnostic conclusion.'}</p>
    </div>
  </div>
</div>`;
}

// ─── HTML shell ───────────────────────────────────────────────────────────────
export function renderMRINeuromarkersTab() {
  return `
<div class="mri-nm-root" id="mri-nm-root">
  <!-- Left sidebar -->
  <aside class="mri-nm-sidebar">
    <div class="mri-nm-sidebar-top">
      <h2 class="mri-nm-title">MRI Neuromarkers</h2>
      <p class="mri-nm-subtitle">Classic imaging signs wired to the evidence corpus.</p>
    </div>
    <div class="mri-nm-controls">
      <div class="mri-nm-search-wrap">
        <svg class="mri-nm-search-ico" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14 14l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input type="text" id="mri-nm-search" class="mri-nm-search-input"
          placeholder="Search name, anatomy, condition…" autocomplete="off"/>
        <button id="mri-nm-search-clear" class="mri-nm-search-clear" style="display:none">✕</button>
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
          <option value="T1">T1</option><option value="T2">T2</option>
          <option value="FLAIR">FLAIR</option><option value="DWI">DWI</option>
          <option value="SWI">SWI</option><option value="contrast-enhanced">Contrast</option>
        </select>
        <select id="mri-nm-modality" class="mri-nm-select">
          <option value="">All modalities</option>
          <option value="MRI">MRI</option><option value="CT">CT</option>
          <option value="angiography">Angiography</option>
        </select>
      </div>
    </div>
    <div class="mri-nm-list-hdr"><span id="mri-nm-count" class="mri-nm-count"></span></div>
    <div id="mri-nm-list" class="mri-nm-list">
      <div class="mri-nm-loading"><span class="mri-nm-spinner"></span>Loading…</div>
    </div>
  </aside>

  <!-- Right detail panel -->
  <section class="mri-nm-detail" id="mri-nm-detail">
    <div id="mri-nm-empty" class="mri-nm-empty">
      <div class="mri-nm-empty-inner">
        <svg viewBox="0 0 80 80" fill="none" class="mri-nm-empty-ico">
          <circle cx="40" cy="40" r="36" stroke="rgba(100,200,255,0.15)" stroke-width="2"/>
          <circle cx="40" cy="40" r="22" stroke="rgba(100,200,255,0.25)" stroke-width="1.5"/>
          <circle cx="40" cy="40" r="4" fill="rgba(100,200,255,0.5)"/>
          <path d="M50 30L55 25M30 30L25 25M50 50L55 55M30 50L25 55" stroke="rgba(100,200,255,0.3)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <h3>Select a neuromarker</h3>
        <p>Choose a sign from the library to view imaging features, anatomy highlights, and linked evidence literature.</p>
      </div>
    </div>

    <div id="mri-nm-sign-detail" class="mri-nm-sign-detail" style="display:none">
      <div class="mri-nm-detail-hdr" id="mri-nm-detail-hdr">
        <div class="mri-nm-detail-title-row">
          <h2 id="mri-nm-detail-name"></h2>
          <span id="mri-nm-detail-badge" class="mri-nm-badge"></span>
        </div>
        <div id="mri-nm-detail-meta" class="mri-nm-detail-meta"></div>
      </div>
      <nav class="mri-nm-tabs" id="mri-nm-tabs">
        <button class="mri-nm-tab active" data-tab="overview">Overview</button>
        <button class="mri-nm-tab" data-tab="imaging">Imaging</button>
        <button class="mri-nm-tab" data-tab="pathophysiology">Pathophysiology</button>
        <button class="mri-nm-tab" data-tab="evidence">Evidence</button>
        <button class="mri-nm-tab" data-tab="report">Report</button>
      </nav>
      <div class="mri-nm-tab-body">
        <div class="mri-nm-pane active" data-pane="overview"  id="mri-nm-pane-overview"></div>
        <div class="mri-nm-pane"        data-pane="imaging"   id="mri-nm-pane-imaging"></div>
        <div class="mri-nm-pane"        data-pane="pathophysiology" id="mri-nm-pane-pathophysiology"></div>
        <div class="mri-nm-pane"        data-pane="evidence"  id="mri-nm-pane-evidence"></div>
        <div class="mri-nm-pane"        data-pane="report"    id="mri-nm-pane-report"></div>
      </div>
    </div>
  </section>
</div>`;
}

// ─── Init (called bindMRINeuromarkersTab for back-compat with pages-biomarkers.js) ──
export async function bindMRINeuromarkersTab() {
  const listEl   = document.getElementById('mri-nm-list');
  const emptyEl  = document.getElementById('mri-nm-empty');
  const detailEl = document.getElementById('mri-nm-sign-detail');
  const countEl  = document.getElementById('mri-nm-count');
  const searchEl = document.getElementById('mri-nm-search');
  const clearBtn = document.getElementById('mri-nm-search-clear');
  const catSel   = document.getElementById('mri-nm-cat');
  const seqSel   = document.getElementById('mri-nm-seq');
  const modSel   = document.getElementById('mri-nm-modality');

  let allSigns = [];
  let selectedSign = null;
  let evidenceCache = {};

  async function loadSigns() {
    listEl.innerHTML = '<div class="mri-nm-loading"><span class="mri-nm-spinner"></span>Loading…</div>';
    if (isDemoSession()) { allSigns = DEMO_SIGNS; renderList(allSigns); return; }
    try {
      const params = new URLSearchParams({ limit: 100 });
      const q = searchEl?.value.trim(); const cat = catSel?.value;
      const seq = seqSel?.value; const mod = modSel?.value;
      if (q) params.set('q', q); if (cat) params.set('category', cat);
      if (seq) params.set('sequence', seq); if (mod) params.set('modality', mod);
      const res = await api.get(`/api/neuro-signs/?${params}`);
      allSigns = res.data?.items || [];
      renderList(allSigns);
    } catch {
      allSigns = DEMO_SIGNS;
      renderList(allSigns);
    }
  }

  function renderList(signs) {
    if (countEl) countEl.textContent = `${signs.length} sign${signs.length!==1?'s':''}`;
    if (!signs.length) { listEl.innerHTML = '<p class="mri-nm-empty-list">No signs match the filters.</p>'; return; }
    listEl.innerHTML = signs.map(s => renderSignCard(s, selectedSign?.id === s.id)).join('');
    listEl.querySelectorAll('.mri-nm-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const sign = signs.find(s => s.id === btn.getAttribute('data-sign-id'));
        if (sign) selectSign(sign);
      });
    });
  }

  async function selectSign(sign) {
    selectedSign = sign;
    listEl.querySelectorAll('.mri-nm-card').forEach(btn => {
      const sel = btn.getAttribute('data-sign-id') === sign.id;
      btn.classList.toggle('selected', sel);
      btn.setAttribute('aria-pressed', String(sel));
    });

    emptyEl.style.display = 'none';
    detailEl.style.display = 'flex';

    const color = categoryColor(sign.category);
    document.getElementById('mri-nm-detail-name').textContent = sign.name;
    const badge = document.getElementById('mri-nm-detail-badge');
    badge.textContent = sign.category;
    badge.style.cssText = `background:${color}22;color:${color};border:1px solid ${color}55;`;

    const metaEl = document.getElementById('mri-nm-detail-meta');
    metaEl.innerHTML = [
      sign.modality && `<span class="mri-nm-meta-chip">${sign.modality}</span>`,
      (sign.sequences||[]).join(' · ') && `<span class="mri-nm-meta-chip">${(sign.sequences||[]).join(' · ')}</span>`,
      (sign.anatomy||[]).join(' · ') && `<span class="mri-nm-meta-chip mri-nm-meta-anat">${(sign.anatomy||[]).join(' · ')}</span>`,
    ].filter(Boolean).join('');

    // Reset tabs
    document.querySelectorAll('.mri-nm-tab').forEach(t =>
      t.classList.toggle('active', t.getAttribute('data-tab') === 'overview'));
    document.querySelectorAll('.mri-nm-pane').forEach(p =>
      p.classList.toggle('active', p.getAttribute('data-pane') === 'overview'));

    document.getElementById('mri-nm-pane-overview').innerHTML       = renderOverviewPane(sign);
    document.getElementById('mri-nm-pane-imaging').innerHTML        = renderImagingPane(sign);
    document.getElementById('mri-nm-pane-pathophysiology').innerHTML = renderPathophysiologyPane(sign);
    document.getElementById('mri-nm-pane-evidence').innerHTML       = renderEvidenceLoading();
    document.getElementById('mri-nm-pane-report').innerHTML         = renderReportPane(sign);

    bindImagingTabs();
    bindReportCopy();
    loadEvidence(sign);
    detailEl.scrollTop = 0;
  }

  async function loadEvidence(sign) {
    const pane = document.getElementById('mri-nm-pane-evidence');
    if (isDemoSession()) { pane.innerHTML = renderDemoEvidence(sign); return; }
    if (evidenceCache[sign.id]) {
      pane.innerHTML = renderEvidencePapers(evidenceCache[sign.id], sign.evidence_query||sign.name);
      return;
    }
    const query = sign.evidence_query || [sign.name, ...(sign.primary_conditions||[]).slice(0,1)].join(' ');
    try {
      const params = new URLSearchParams({ q: query, limit: 10, include_abstract: 'true', has_abstract: 'true' });
      const res = await api.get(`/api/v1/evidence/papers?${params}`);
      const papers = res.data || [];
      evidenceCache[sign.id] = papers;
      if (selectedSign?.id === sign.id) pane.innerHTML = renderEvidencePapers(papers, query);
    } catch {
      if (selectedSign?.id === sign.id)
        pane.innerHTML = `<div class="mri-nm-ev-empty"><p>Evidence database unavailable.</p><p class="mri-nm-muted">Query: <code>${query}</code></p></div>`;
    }
  }

  // Tab switching
  document.getElementById('mri-nm-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.mri-nm-tab');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.mri-nm-tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.mri-nm-pane').forEach(p => p.classList.toggle('active', p.getAttribute('data-pane') === tab));
  });

  function bindImagingTabs() {
    document.getElementById('mri-nm-pane-imaging')?.addEventListener('click', e => {
      const btn = e.target.closest('.mri-nm-plane-tab');
      if (!btn) return;
      const plane = btn.getAttribute('data-plane');
      btn.closest('.mri-nm-imaging').querySelectorAll('.mri-nm-plane-tab').forEach(t => t.classList.toggle('active', t === btn));
      btn.closest('.mri-nm-imaging').querySelectorAll('.mri-nm-atlas-view').forEach(v =>
        v.classList.toggle('active', v.getAttribute('data-plane-view') === plane));
    });
  }

  function bindReportCopy() {
    document.querySelector('[data-copy-report]')?.addEventListener('click', () => {
      const ta = document.getElementById('mri-nm-report-ta');
      if (!ta) return;
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.resolve(document.execCommand('copy') || ta.select()))
        .then(() => {
          const btn = document.querySelector('[data-copy-report]');
          if (!btn) return;
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ Copied'; btn.classList.add('copied');
          setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
        }).catch(() => {});
    });
  }

  let debounce;
  const reload = () => { clearTimeout(debounce); debounce = setTimeout(loadSigns, 280); };
  searchEl?.addEventListener('input', () => { clearBtn && (clearBtn.style.display = searchEl.value ? 'flex' : 'none'); reload(); });
  searchEl?.addEventListener('keydown', e => e.key === 'Enter' && loadSigns());
  clearBtn?.addEventListener('click', () => { searchEl.value = ''; clearBtn.style.display = 'none'; loadSigns(); });
  catSel?.addEventListener('change', loadSigns);
  seqSel?.addEventListener('change', loadSigns);
  modSel?.addEventListener('change', loadSigns);

  await loadSigns();
}

// ─── Styles ───────────────────────────────────────────────────────────────────
export const MRI_NEUROMARKERS_STYLES = `
.mri-nm-root {
  display: grid;
  grid-template-columns: 300px 1fr;
  height: calc(100vh - 190px);
  min-height: 560px;
  max-height: 920px;
  background: #0b1120;
  color: var(--text-primary, #e2e8f0);
  overflow: hidden;
  border-radius: .5rem;
  border: 1px solid rgba(255,255,255,0.06);
}
@media (max-width: 768px) {
  .mri-nm-root { grid-template-columns: 1fr; grid-template-rows: 260px 1fr; }
}
.mri-nm-sidebar {
  display: flex; flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
  background: rgba(255,255,255,0.015);
}
.mri-nm-sidebar-top { padding: 1.1rem 1.1rem 0; flex-shrink: 0; }
.mri-nm-title { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin: 0 0 .2rem; }
.mri-nm-subtitle { font-size: .75rem; color: rgba(148,163,184,.6); margin: 0 0 .75rem; }
.mri-nm-controls { padding: 0 .85rem .6rem; flex-shrink: 0; display: flex; flex-direction: column; gap: .45rem; }
.mri-nm-search-wrap { position: relative; display: flex; align-items: center; }
.mri-nm-search-ico { position: absolute; left: .65rem; width: 14px; height: 14px; color: rgba(148,163,184,.45); pointer-events: none; }
.mri-nm-search-input {
  width: 100%; padding: .55rem 2rem .55rem 2rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: .375rem; color: var(--text-primary, #e2e8f0); font-size: .82rem; outline: none;
}
.mri-nm-search-input:focus { border-color: rgba(100,200,255,0.4); }
.mri-nm-search-clear {
  position: absolute; right: .5rem; background: none; border: none;
  color: rgba(148,163,184,.5); cursor: pointer; font-size: .7rem;
  display: flex; align-items: center; padding: .15rem;
}
.mri-nm-filters { display: flex; flex-direction: column; gap: .35rem; }
.mri-nm-select {
  width: 100%; padding: .45rem .6rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: .375rem; color: var(--text-primary, #e2e8f0); font-size: .8rem; outline: none; cursor: pointer;
}
.mri-nm-select option { background: #1e293b; }
.mri-nm-list-hdr { padding: 0 1.1rem .3rem; flex-shrink: 0; }
.mri-nm-count { font-size: .7rem; color: rgba(148,163,184,.45); text-transform: uppercase; letter-spacing: .04em; }
.mri-nm-list {
  flex: 1; overflow-y: auto; padding: 0 .6rem .75rem;
  display: flex; flex-direction: column; gap: .35rem;
}
.mri-nm-list::-webkit-scrollbar { width: 3px; }
.mri-nm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
.mri-nm-empty-list { text-align: center; color: rgba(148,163,184,.4); font-size: .82rem; padding: 1.5rem 0; }
.mri-nm-card {
  width: 100%; text-align: left;
  background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
  border-left: 3px solid transparent; border-radius: .4rem; padding: .65rem .8rem;
  cursor: pointer; transition: background .15s, border-color .15s, transform .12s;
  color: inherit;
}
.mri-nm-card:hover { background: rgba(100,200,255,0.05); border-color: rgba(100,200,255,0.18); transform: translateX(2px); }
.mri-nm-card.selected {
  background: rgba(100,200,255,0.07);
  border-left-color: var(--cat-color, #64c8ff);
  border-top-color: rgba(100,200,255,.18); border-right-color: rgba(100,200,255,.08); border-bottom-color: rgba(100,200,255,.08);
}
.mri-nm-card-top { display: flex; justify-content: space-between; align-items: center; gap: .4rem; margin-bottom: .35rem; }
.mri-nm-card-name { font-size: .86rem; font-weight: 600; color: #f1f5f9; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mri-nm-cat-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mri-nm-card-tags { display: flex; flex-wrap: wrap; gap: .2rem; margin-bottom: .35rem; }
.mri-nm-seq-tag, .mri-nm-anat-tag { font-size: .65rem; padding: .12rem .4rem; border-radius: 3px; font-weight: 500; }
.mri-nm-seq-tag { background: rgba(59,130,246,.15); color: #93c5fd; }
.mri-nm-anat-tag { background: rgba(100,200,255,.1); color: rgba(100,200,255,.85); }
.mri-nm-card-desc { font-size: .75rem; color: rgba(148,163,184,.75); line-height: 1.4; margin: 0 0 .3rem;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mri-nm-card-conds { font-size: .68rem; color: rgba(148,163,184,.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Detail panel */
.mri-nm-detail { display: flex; flex-direction: column; overflow: hidden; background: #0d1626; }
.mri-nm-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.mri-nm-empty-inner { text-align: center; max-width: 320px; }
.mri-nm-empty-ico { width: 72px; height: 72px; margin: 0 auto 1.1rem; display: block; }
.mri-nm-empty-inner h3 { font-size: 1.05rem; color: rgba(148,163,184,.65); margin: 0 0 .4rem; }
.mri-nm-empty-inner p { font-size: .82rem; color: rgba(148,163,184,.4); line-height: 1.55; }
.mri-nm-sign-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.mri-nm-detail-hdr {
  padding: .95rem 1.4rem .8rem; border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0; background: rgba(255,255,255,0.01);
}
.mri-nm-detail-title-row { display: flex; align-items: center; gap: .65rem; margin-bottom: .4rem; flex-wrap: wrap; }
.mri-nm-detail-title-row h2 { font-size: 1.2rem; font-weight: 700; color: #f8fafc; margin: 0; }
.mri-nm-badge {
  display: inline-block; padding: .18rem .6rem; border-radius: 9999px;
  font-size: .68rem; font-weight: 600; text-transform: capitalize; letter-spacing: .03em;
}
.mri-nm-detail-meta { display: flex; flex-wrap: wrap; gap: .35rem; }
.mri-nm-meta-chip { font-size: .7rem; padding: .18rem .55rem; border-radius: 3px; background: rgba(255,255,255,0.06); color: rgba(148,163,184,.8); }
.mri-nm-meta-anat { background: rgba(100,200,255,.08); color: rgba(100,200,255,.8); }
.mri-nm-tabs {
  display: flex; padding: 0 1.4rem; border-bottom: 1px solid rgba(255,255,255,.07);
  flex-shrink: 0; overflow-x: auto;
}
.mri-nm-tabs::-webkit-scrollbar { height: 2px; }
.mri-nm-tab {
  padding: .65rem .95rem; background: none; border: none;
  border-bottom: 2px solid transparent; color: rgba(148,163,184,.55);
  font-size: .8rem; font-weight: 500; cursor: pointer; white-space: nowrap;
  transition: color .15s, border-color .15s; margin-bottom: -1px;
}
.mri-nm-tab:hover { color: rgba(148,163,184,.85); }
.mri-nm-tab.active { color: #64c8ff; border-bottom-color: #64c8ff; }
.mri-nm-tab-body { flex: 1; overflow-y: auto; }
.mri-nm-tab-body::-webkit-scrollbar { width: 3px; }
.mri-nm-tab-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.07); }
.mri-nm-pane { display: none; padding: 1.4rem; }
.mri-nm-pane.active { display: block; }

/* Shared */
.mri-nm-sec-label { font-size: .68rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: rgba(100,200,255,.65); margin: 0 0 .55rem; }
.mri-nm-pills { display: flex; flex-wrap: wrap; gap: .3rem; }
.mri-nm-pill { font-size: .72rem; padding: .18rem .55rem; border-radius: 4px; font-weight: 500; }
.pill-seq { background: rgba(59,130,246,.15); color: #93c5fd; }
.pill-anat { background: rgba(100,200,255,.1); color: rgba(100,200,255,.9); }
.pill-mod { background: rgba(168,85,247,.15); color: #c084fc; }
.mri-nm-muted { color: rgba(148,163,184,.45); font-size: .8rem; }
.mri-nm-body-text { color: rgba(203,213,225,.8); line-height: 1.65; font-size: .86rem; margin: 0 0 .25rem; }

/* Overview */
.mri-nm-overview { display: flex; flex-direction: column; gap: 1.1rem; }
.mri-nm-ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: .9rem; }
.mri-nm-cond-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
.mri-nm-cond-item { display: flex; align-items: center; gap: .45rem; font-size: .82rem; color: rgba(203,213,225,.75); }
.cond-primary { color: #e2e8f0; font-weight: 500; }
.mri-nm-cond-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* Imaging */
.mri-nm-imaging { display: flex; flex-direction: column; gap: .9rem; }
.mri-nm-plane-tabs { display: flex; gap: .45rem; }
.mri-nm-plane-tab {
  padding: .38rem .85rem; background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08); border-radius: .375rem;
  color: rgba(148,163,184,.65); font-size: .78rem; font-weight: 500; cursor: pointer; transition: all .15s;
}
.mri-nm-plane-tab:hover { background: rgba(100,200,255,.07); color: #94a3b8; }
.mri-nm-plane-tab.active { background: rgba(100,200,255,.1); border-color: rgba(100,200,255,.35); color: #64c8ff; }
.mri-nm-atlas-view { display: none; }
.mri-nm-atlas-view.active { display: block; }
.mri-nm-atlas-frame {
  position: relative; border-radius: .45rem; overflow: hidden;
  border: 1px solid rgba(255,255,255,.08); background: #060c18; max-width: 460px;
}
.mri-nm-atlas-img { width: 100%; display: block; filter: brightness(.85) contrast(1.05); }
.mri-nm-overlay-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mri-nm-ov-legend {
  position: absolute; bottom: .55rem; left: .55rem;
  background: rgba(6,12,24,.85); border: 1px solid rgba(100,200,255,.3);
  border-radius: .28rem; padding: .25rem .55rem;
  font-size: .68rem; color: rgba(100,200,255,.9);
  display: flex; align-items: center; gap: .3rem;
}
.mri-nm-ov-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(100,200,255,.8);
  animation: mrinm-ldot 2s ease-in-out infinite;
}
@keyframes mrinm-ldot { 0%,100%{opacity:.5} 50%{opacity:1} }
.mri-nm-ov-none { position: absolute; bottom: .5rem; left: .55rem; font-size: .67rem; color: rgba(148,163,184,.3); }
.mri-nm-img-note {
  display: flex; align-items: flex-start; gap: .45rem;
  font-size: .75rem; color: rgba(148,163,184,.45); line-height: 1.5;
  padding: .55rem .7rem; background: rgba(255,255,255,.02);
  border-radius: .375rem; border: 1px solid rgba(255,255,255,.05);
}
.mri-nm-info-ico { width: 13px; height: 13px; flex-shrink: 0; color: rgba(100,200,255,.4); margin-top: .1rem; }

/* Pathophysiology */
.mri-nm-patho { display: flex; flex-direction: column; gap: 1.1rem; }
.mri-nm-ref-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .55rem; }
.mri-nm-ref-item {
  display: flex; gap: .7rem; padding: .55rem .7rem;
  background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.06);
  border-radius: .375rem; align-items: flex-start;
}
.mri-nm-ref-year { font-size: .7rem; font-weight: 700; color: rgba(100,200,255,.7); white-space: nowrap; padding-top: .1rem; }
.mri-nm-ref-title { font-size: .8rem; color: rgba(203,213,225,.8); display: block; margin-bottom: .22rem; }
.mri-nm-ref-link { font-size: .7rem; color: #64c8ff; text-decoration: none; }
.mri-nm-ref-link:hover { text-decoration: underline; }

/* Evidence */
.mri-nm-ev-loading { display: flex; align-items: center; gap: .7rem; color: rgba(148,163,184,.45); font-size: .82rem; padding: 1.5rem 0; }
.mri-nm-ev-empty { padding: 1.5rem 0; color: rgba(148,163,184,.45); font-size: .82rem; line-height: 1.6; }
.mri-nm-ev-empty code { font-size: .72rem; background: rgba(255,255,255,.05); padding: .12rem .35rem; border-radius: 3px; }
.mri-nm-ev-pane { display: flex; flex-direction: column; gap: .65rem; }
.mri-nm-ev-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .45rem; margin-bottom: .2rem; }
.mri-nm-ev-count { font-size: .7rem; color: rgba(100,200,255,.6); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
.mri-nm-ev-query { font-size: .65rem; color: rgba(148,163,184,.3); background: rgba(255,255,255,.03); padding: .12rem .45rem; border-radius: 3px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mri-nm-ev-list { display: flex; flex-direction: column; gap: .55rem; }
.mri-nm-ev-card {
  padding: .8rem .95rem; background: rgba(255,255,255,.025);
  border: 1px solid rgba(255,255,255,.06); border-radius: .4rem; transition: border-color .15s;
}
.mri-nm-ev-card:hover { border-color: rgba(100,200,255,.2); }
.mri-nm-ev-top { display: flex; align-items: center; gap: .45rem; margin-bottom: .35rem; flex-wrap: wrap; }
.mri-nm-ev-year { font-size: .72rem; font-weight: 700; color: rgba(100,200,255,.7); }
.mri-nm-ev-type { font-size: .65rem; padding: .08rem .4rem; background: rgba(168,85,247,.12); color: #c084fc; border-radius: 3px; }
.mri-nm-ev-cited { font-size: .68rem; color: rgba(251,191,36,.65); margin-left: auto; }
.mri-nm-ev-title { font-size: .84rem; color: #e2e8f0; font-weight: 500; line-height: 1.4; margin: 0 0 .28rem; }
.mri-nm-ev-authors { font-size: .72rem; color: rgba(148,163,184,.5); margin: 0 0 .35rem; }
.mri-nm-ev-abstract { font-size: .75rem; color: rgba(148,163,184,.6); line-height: 1.5; margin: 0 0 .45rem; }
.mri-nm-ev-links { display: flex; gap: .45rem; }
.mri-nm-ev-link { font-size: .7rem; color: #64c8ff; text-decoration: none; }
.mri-nm-ev-link:hover { text-decoration: underline; }

/* Report */
.mri-nm-report { display: flex; flex-direction: column; gap: 1.1rem; }
.mri-nm-report-hint { font-size: .78rem; color: rgba(148,163,184,.5); margin: 0 0 .65rem; }
.mri-nm-report-box { position: relative; border-radius: .4rem; border: 1px solid rgba(255,255,255,.1); overflow: hidden; }
.mri-nm-report-ta {
  width: 100%; min-height: 130px; padding: .8rem .95rem 2.5rem;
  background: rgba(0,0,0,.3); border: none; color: #cbd5e1;
  font-family: 'Fira Code','Courier New',monospace; font-size: .8rem; line-height: 1.6;
  resize: vertical; box-sizing: border-box; outline: none;
}
.mri-nm-copy-btn {
  position: absolute; bottom: .45rem; right: .55rem;
  display: flex; align-items: center; gap: .3rem; padding: .3rem .65rem;
  background: rgba(100,200,255,.1); border: 1px solid rgba(100,200,255,.25);
  border-radius: .28rem; color: #64c8ff; font-size: .72rem; font-weight: 500; cursor: pointer; transition: background .15s;
}
.mri-nm-copy-btn:hover { background: rgba(100,200,255,.18); }
.mri-nm-copy-btn.copied { background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.3); color: #4ade80; }
.mri-nm-caveat {
  display: flex; gap: .7rem; align-items: flex-start;
  padding: .8rem .95rem; background: rgba(244,63,94,.06);
  border: 1px solid rgba(244,63,94,.2); border-radius: .4rem;
}
.mri-nm-warn-ico { flex-shrink: 0; margin-top: .1rem; }
.mri-nm-caveat strong { font-size: .8rem; color: #f87171; display: block; margin-bottom: .25rem; }
.mri-nm-caveat p { font-size: .78rem; color: rgba(248,113,113,.7); line-height: 1.5; margin: 0; }

/* Spinner */
.mri-nm-loading { display: flex; align-items: center; gap: .7rem; color: rgba(148,163,184,.4); font-size: .8rem; padding: 1.5rem 0; justify-content: center; }
.mri-nm-spinner {
  width: 15px; height: 15px; border-radius: 50%;
  border: 2px solid rgba(100,200,255,.15);
  border-top-color: rgba(100,200,255,.7);
  animation: mrinm-spin .7s linear infinite; flex-shrink: 0;
}
@keyframes mrinm-spin { to { transform: rotate(360deg); } }
`;
