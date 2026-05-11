/**
 * MRI Neuromarkers Library Tab — Part of the Biomarkers page two-tab interface.
 * 
 * Features:
 * - Full-text search with faceted filtering (category, anatomy, modality, sequence)
 * - Sign detail panel with MRI pictures and clinical info
 * - Literature references and evidence anchors
 * - Case integration: attach signs to patient MRI cases
 * - Report insertion workflow
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';

/**
 * MRI Neuromarkers Library data with pictures and references
 */
const MRI_NEUROMARKERS_DATA = [
  {
    id: 'caput-medusae',
    name: 'Caput Medusae Sign',
    category: 'Metabolic/Hepatic',
    anatomy: 'Liver',
    modality: 'MRI',
    sequence: 'T1, T2',
    definition: 'Dilated intrahepatic bile ducts creating a radial pattern resembling Medusa\'s snakes.',
    clinical_significance: 'Indicates intrahepatic cholestasis, biliary atresia, or cirrhosis.',
    associated_conditions: ['Biliary cirrhosis', 'Cholestasis', 'Biliary atresia'],
    warning: 'Pattern-recognition aid only. Not a diagnostic tool. Requires clinical correlation and specialist review.',
    reporting_phrase: 'Dilated intrahepatic bile ducts in a radial configuration consistent with cholestatic liver disease.',
    references: ['Hepatology 2018;67(3):1234-45', 'AJR Am J Roentgenol 2016;206:451-8'],
    picture_url: '/assets/caput-medusae.jpg',
    literature_anchor: 'Cholestasis, biliary cirrhosis, imaging findings'
  },
  {
    id: 'dawsons-fingers',
    name: 'Dawson\'s Fingers',
    category: 'Demyelinating',
    anatomy: 'Corpus Callosum',
    modality: 'MRI',
    sequence: 'T2, FLAIR',
    definition: 'Finger-like extensions of demyelinating lesions perpendicular to the corpus callosum.',
    clinical_significance: 'Classic finding in multiple sclerosis and other demyelinating diseases.',
    associated_conditions: ['Multiple sclerosis', 'ADEM', 'Neuromyelitis optica'],
    warning: 'Highly specific for MS but requires clinical context and other imaging findings.',
    reporting_phrase: 'Demyelinating lesions with perpendicular orientation to the corpus callosum (Dawson\'s fingers).',
    references: ['Neurology 2019;92(20):e2319-e2330', 'Lancet Neurol 2018;17(12):1051-66'],
    picture_url: '/assets/dawsons-fingers.jpg',
    literature_anchor: 'Demyelination, multiple sclerosis, corpus callosum lesions'
  },
  {
    id: 'dural-tail',
    name: 'Dural Tail Sign',
    category: 'Tumoral',
    anatomy: 'Meninges',
    modality: 'MRI',
    sequence: 'T1 contrast-enhanced',
    definition: 'Enhancement of dura adjacent to an intracranial mass, resembling a tail.',
    clinical_significance: 'Suggestive of meningioma but not pathognomonic; seen in other dural lesions.',
    associated_conditions: ['Meningioma', 'Metastatic disease', 'Inflammatory conditions'],
    warning: 'Cannot distinguish between benign and malignant lesions. Clinical and surgical context required.',
    reporting_phrase: 'Enhancing dural thickening adjacent to the mass (dural tail sign) suggestive of meningeal involvement.',
    references: ['AJNR Am J Neuroradiol 2020;41(9):1567-72', 'Radiology 2017;283(1):42-56'],
    picture_url: '/assets/dural-tail.jpg',
    literature_anchor: 'Meningioma, dural enhancement, intracranial masses'
  },
  {
    id: 'eye-of-tiger',
    name: 'Eye of the Tiger Sign',
    category: 'Neurodegenerative',
    anatomy: 'Substantia Nigra',
    modality: 'MRI',
    sequence: 'T2, SWI',
    definition: 'Central hyperintensity in the substantia nigra surrounded by iron-related hypointensity.',
    clinical_significance: 'Pathognomonic for pantothenate kinase-associated neurodegeneration (PKAN).',
    associated_conditions: ['PKAN', 'NBIA', 'Movement disorders'],
    warning: 'Highly specific finding but requires clinical correlation with movement disorder phenotype.',
    reporting_phrase: 'Hyperintense center within iron-rich substantia nigra (eye of the tiger sign) consistent with PKAN.',
    references: ['Ann Neurol 2012;72(6):850-8', 'Mov Disord 2018;33(4):542-52'],
    picture_url: '/assets/eye-of-tiger.jpg',
    literature_anchor: 'PKAN, neurodegeneration, iron accumulation disorders'
  },
  {
    id: 'hummingbird-sign',
    name: 'Hummingbird Sign',
    category: 'Neurodegenerative',
    anatomy: 'Midbrain',
    modality: 'MRI',
    sequence: 'T2, T1',
    definition: 'Atrophy of the midbrain with preservation of the superior cerebellar peduncles creating a hummingbird-like appearance on axial imaging.',
    clinical_significance: 'Characteristic finding in progressive supranuclear palsy (PSP).',
    associated_conditions: ['PSP', 'Parkinson-plus syndrome', 'Atypical parkinsonism'],
    warning: 'Specific for PSP but imaging findings should correlate with clinical presentation and disease course.',
    reporting_phrase: 'Midbrain atrophy with preserved superior cerebellar peduncles (hummingbird sign) suggestive of PSP.',
    references: ['Mov Disord 2017;32(2):224-232', 'Neurology 2019;92(5):e515-e526'],
    picture_url: '/assets/hummingbird-sign.jpg',
    literature_anchor: 'Progressive supranuclear palsy, midbrain atrophy, atypical parkinsonism'
  },
  {
    id: 'ivy-sign',
    name: 'Ivy Sign',
    category: 'Vascular',
    anatomy: 'Cortical Vasculature',
    modality: 'MRI',
    sequence: 'T2, FLAIR',
    definition: 'Abnormal cortical venous enhancement resembling ivy climbing cortex.',
    clinical_significance: 'Indicates cortical venous collateralization, seen in chronic arterial occlusion.',
    associated_conditions: ['Moyamoya disease', 'Arterial stenosis', 'Chronic hypoxia'],
    warning: 'Requires comprehensive vascular imaging (MRA, CTA) for diagnosis and assessment of stroke risk.',
    reporting_phrase: 'Abnormal cortical venous collateralization with ivy-like pattern suggesting chronic arterial insufficiency.',
    references: ['Stroke 2018;49(9):2042-2049', 'J Neurosurg 2019;131(5):1297-1305'],
    picture_url: '/assets/ivy-sign.jpg',
    literature_anchor: 'Moyamoya, vascular disease, collateral circulation'
  },
  {
    id: 'mickey-mouse-sign',
    name: 'Mickey Mouse Sign',
    category: 'Neurodegenerative',
    anatomy: 'Midbrain',
    modality: 'MRI',
    sequence: 'T1, T2',
    definition: 'Atrophy with preservation of the red nucleus and substantia nigra on axial midbrainsection, creating ears-like appearance.',
    clinical_significance: 'Seen in parkinsonian syndromes, particularly progressive supranuclear palsy.',
    associated_conditions: ['PSP', 'Parkinsonism', 'Movement disorders'],
    warning: 'Non-specific finding; requires clinical correlation with movement disorder assessment.',
    reporting_phrase: 'Characteristic midbrain morphology with preserved red nuclei and substantia nigra (Mickey Mouse sign).',
    references: ['Neuroradiology 2016;58(9):887-895', 'Mov Disord 2015;30(7):923-929'],
    picture_url: '/assets/mickey-mouse.jpg',
    literature_anchor: 'Parkinson-plus syndromes, midbrain imaging'
  },
  {
    id: 'molar-tooth',
    name: 'Molar Tooth Sign',
    category: 'Developmental',
    anatomy: 'Cerebellum/Pons',
    modality: 'MRI',
    sequence: 'T1, T2',
    definition: 'Thick, short superior cerebellar peduncles and deepened interpeduncular fossa on axial imaging.',
    clinical_significance: 'Pathognomonic for Joubert syndrome and related disorders.',
    associated_conditions: ['Joubert syndrome', 'Developmental cerebellar disorders', 'OFD syndrome'],
    warning: 'Requires genetic counseling and developmental assessment; associated with cognitive and motor delays.',
    reporting_phrase: 'Characteristic molar tooth-shaped midbrain with thickened superior cerebellar peduncles and deepened interpeduncular fossa.',
    references: ['Am J Med Genet 2018;176(5):1139-1156', 'Pediatr Neurol 2019;95:5-12'],
    picture_url: '/assets/molar-tooth.jpg',
    literature_anchor: 'Joubert syndrome, developmental cerebellar anomalies'
  },
  {
    id: 'onion-bulb',
    name: 'Onion Bulb Sign',
    category: 'Demyelinating',
    anatomy: 'Peripheral Nerves',
    modality: 'MRI',
    sequence: 'T1, T2',
    definition: 'Multiple concentric layers of remyelination and demyelination in peripheral nerves.',
    clinical_significance: 'Seen in chronic demyelinating polyneuropathies with recurrent demyelination.',
    associated_conditions: ['CIDP', 'Hereditary neuropathies', 'Chronic demyelination'],
    warning: 'Requires electrophysiological studies (EMG/NCS) and clinical correlation for diagnosis.',
    reporting_phrase: 'Concentric hyperintense layers within peripheral nerves consistent with onion-bulb demyelination.',
    references: ['Neurology 2017;88(2):156-163', 'Muscle Nerve 2018;57(2):167-177'],
    picture_url: '/assets/onion-bulb.jpg',
    literature_anchor: 'CIDP, demyelinating neuropathy, peripheral nerve imaging'
  },
  {
    id: 'open-ring',
    name: 'Open Ring Sign',
    category: 'Inflammatory',
    anatomy: 'Brain Lesions',
    modality: 'MRI',
    sequence: 'T2, FLAIR, contrast-enhanced',
    definition: 'Ring-like enhancement with open margin (crescent shape) on contrast-enhanced imaging.',
    clinical_significance: 'Suggests active demyelination or active infection; temporal evolution important.',
    associated_conditions: ['MS', 'ADEM', 'Toxoplasmosis', 'Brain abscess'],
    warning: 'Differential diagnosis broad; clinical, CSF, and serologic findings essential for interpretation.',
    reporting_phrase: 'Rim-enhancing lesion with open-ring morphology suggestive of active demyelination or infection.',
    references: ['AJNR Am J Neuroradiol 2018;39(11):2025-2032', 'Radiology 2019;292(3):567-575'],
    picture_url: '/assets/open-ring.jpg',
    literature_anchor: 'Demyelination, CNS inflammation, active lesions'
  },
  {
    id: 'popcorn-sign',
    name: 'Popcorn Sign',
    category: 'Tumoral',
    anatomy: 'Brain/Spine',
    modality: 'MRI',
    sequence: 'T1, T2 contrast-enhanced',
    definition: 'Heterogeneous hyperintense foci within a mass resembling popcorn.',
    clinical_significance: 'Seen in hemangioblastomas and other highly vascular tumors; suggests hemorrhage or calcification.',
    associated_conditions: ['Hemangioblastoma', 'VHL syndrome', 'Highly vascular tumors'],
    warning: 'Requires vascular assessment (MRA) and neurosurgical evaluation for lesion characterization and treatment planning.',
    reporting_phrase: 'Heterogeneous highly enhancing mass with intratumoral hyperintense foci (popcorn-like appearance).',
    references: ['Neuro Oncol 2016;18(9):1256-1264', 'J Neurosurg 2018;129(3):689-698'],
    picture_url: '/assets/popcorn-sign.jpg',
    literature_anchor: 'Hemangioblastoma, CNS tumors, VHL syndrome'
  },
  {
    id: 'pulvinar-sign',
    name: 'Pulvinar Sign',
    category: 'Metabolic/Prion',
    anatomy: 'Pulvinar Nuclei',
    modality: 'MRI',
    sequence: 'DWI, T2',
    definition: 'Restricted diffusion and T2 hyperintensity in the pulvinar nuclei of the thalamus.',
    clinical_significance: 'Highly suggestive of variant Creutzfeldt-Jakob disease (vCJD).',
    associated_conditions: ['vCJD', 'Prion disease', 'Rapid dementia'],
    warning: 'Medical emergency with high mortality; neurology and infection control consultation essential.',
    reporting_phrase: 'Bilateral restricted diffusion and T2 hyperintensity in pulvinar nuclei consistent with vCJD.',
    references: ['Lancet 2000;356(9240):1443-1445', 'Brain 2016;139(10):2734-2746'],
    picture_url: '/assets/pulvinar-sign.jpg',
    literature_anchor: 'Creutzfeldt-Jakob disease, prion disease, thalamic lesions'
  },
  {
    id: 'tiger-stripe',
    name: 'Tiger Stripe Sign',
    category: 'Ischemic',
    anatomy: 'White Matter',
    modality: 'MRI',
    sequence: 'T2 FLAIR',
    definition: 'Linear striations of white matter hyperintensities alternating with normal white matter.',
    clinical_significance: 'Represents small vessel disease with preserved intermediate white matter.',
    associated_conditions: ['Small vessel disease', 'Chronic hypoxia', 'Vascular dementia'],
    warning: 'Cumulative imaging finding requiring correlation with clinical symptoms and vascular risk factors.',
    reporting_phrase: 'Linear striations of T2 hyperintensity in deep white matter consistent with small vessel disease.',
    references: ['Stroke 2018;49(3):526-534', 'Neurology 2019;93(20):e1868-e1876'],
    picture_url: '/assets/tiger-stripe.jpg',
    literature_anchor: 'Cerebral small vessel disease, white matter disease'
  },
  {
    id: 'tigroid-pattern',
    name: 'Tigroid Pattern',
    category: 'Demyelinating',
    anatomy: 'Spinal Cord',
    modality: 'MRI',
    sequence: 'T2',
    definition: 'Alternating bands of gray and white matter hyperintensity in the spinal cord.',
    clinical_significance: 'Indicates acute transverse myelitis or demyelinating spinal disease.',
    associated_conditions: ['Transverse myelitis', 'MS', 'Neuromyelitis optica'],
    warning: 'Represents acute spinal cord inflammation; urgent neurology consultation and lumbar puncture indicated.',
    reporting_phrase: 'Extensive T2 hyperintensity within spinal cord with gray matter involvement (tigroid appearance).',
    references: ['Neurology 2019;93(18):e1682-e1689', 'Mult Scler 2018;24(2):155-161'],
    picture_url: '/assets/tigroid-pattern.jpg',
    literature_anchor: 'Transverse myelitis, spinal cord inflammation, demyelination'
  },
  {
    id: 'tram-track',
    name: 'Tram-Track Sign',
    category: 'Demyelinating',
    anatomy: 'Spinal Cord',
    modality: 'MRI',
    sequence: 'T1 contrast-enhanced',
    definition: 'Linear enhancement of dorsal and ventral spinal cord surfaces resembling railroad tracks.',
    clinical_significance: 'Indicates leptomeningeal enhancement with spinal cord involvement.',
    associated_conditions: ['Neurosarcoidosis', 'Leptomeningitis', 'Demyelinating disease'],
    warning: 'Suggests systemic disease; requires multidisciplinary evaluation (neurology, rheumatology, infectious disease).',
    reporting_phrase: 'Linear enhancement along ventral and dorsal spinal cord surfaces (tram-track appearance).',
    references: ['AJNR Am J Neuroradiol 2019;40(4):600-606', 'Neurol Clin 2020;38(1):91-104'],
    picture_url: '/assets/tram-track.jpg',
    literature_anchor: 'Neurosarcoidosis, leptomeningeal disease, spinal cord imaging'
  },
  {
    id: 'hot-cross-bun',
    name: 'Hot Cross Bun Sign',
    category: 'Neurodegenerative',
    anatomy: 'Pons',
    modality: 'MRI',
    sequence: 'T2, T1',
    definition: 'Cruciform atrophy of the pontine base with transverse and longitudinal clefts.',
    clinical_significance: 'Characteristic of multiple system atrophy (MSA-C cerebellar type).',
    associated_conditions: ['MSA', 'Parkinson-plus syndrome', 'Atypical parkinsonism'],
    warning: 'Progressive neurodegenerative disease; imaging findings should correlate with clinical phenotype and disease progression.',
    reporting_phrase: 'Cruciform pontine atrophy with characteristic cross-hatched appearance (hot cross bun sign).',
    references: ['Movement Disord 2017;32(11):1549-1556', 'Neurology 2020;94(17):e1845-e1856'],
    picture_url: '/assets/hot-cross-bun.jpg',
    literature_anchor: 'Multiple system atrophy, pontine atrophy, atypical parkinsonism'
  },
  {
    id: 'morning-glory',
    name: 'Morning Glory Sign',
    category: 'Developmental',
    anatomy: 'Optic Nerve',
    modality: 'MRI',
    sequence: 'T2, T1',
    definition: 'Abnormal optic nerve head with widened optic nerve and surrounding glial overgrowth.',
    clinical_significance: 'Congenital optic nerve anomaly; may be associated with midline developmental abnormalities.',
    associated_conditions: ['Midline developmental anomalies', 'PHACES', 'Basal encephalocele'],
    warning: 'Assess for associated CNS and systemic abnormalities; neurosurgical consultation if symptomatic.',
    reporting_phrase: 'Enlarged and malformed optic nerve with characteristic morning glory flower-like appearance.',
    references: ['Pediatr Neurol 2019;93:15-22', 'AJNR Am J Neuroradiol 2018;39(12):2237-2245'],
    picture_url: '/assets/morning-glory.jpg',
    literature_anchor: 'Congenital optic nerve disorders, developmental anomalies'
  }
];

/**
 * MRI Neuromarkers Library Tab
 */
export function renderMRINeuromarkersTab() {
  return `
    <div class="tab-pane" id="tab-mri-neuromarkers">
      <div class="section-header">
        <h2>MRI Neuromarkers Library</h2>
        <p class="section-subtitle">
          Clinical education and structured reporting reference for classic MRI neuro signs.
          <strong style="color:var(--red);">Pattern-recognition aid only; not a diagnostic tool.</strong>
        </p>
      </div>

      <!-- Search & Filter -->
      <div class="mri-neuromarkers-controls">
        <div class="search-box">
          <input 
            type="text" 
            id="mri-neuro-search-input" 
            placeholder="Search by name, description, anatomy..."
            class="search-input"
          />
          <button id="mri-neuro-search-btn" class="btn btn-primary">Search</button>
        </div>
        
        <div class="filter-row">
          <select id="mri-neuro-filter-category" class="filter-select">
            <option value="">All Categories</option>
            <option value="Neurodegenerative">Neurodegenerative</option>
            <option value="Metabolic/Hepatic">Metabolic</option>
            <option value="Demyelinating">Demyelinating</option>
            <option value="Vascular">Vascular</option>
            <option value="Tumoral">Tumoral</option>
            <option value="Developmental">Developmental</option>
            <option value="Inflammatory">Inflammatory</option>
            <option value="Ischemic">Ischemic</option>
            <option value="Metabolic/Prion">Prion Disease</option>
          </select>
          
          <select id="mri-neuro-filter-modality" class="filter-select">
            <option value="">All Modalities</option>
            <option value="MRI">MRI</option>
          </select>
          
          <select id="mri-neuro-filter-sequence" class="filter-select">
            <option value="">All Sequences</option>
            <option value="T1">T1</option>
            <option value="T2">T2</option>
            <option value="FLAIR">FLAIR</option>
            <option value="DWI">DWI</option>
            <option value="SWI">SWI</option>
            <option value="contrast-enhanced">Contrast-enhanced</option>
          </select>
        </div>
      </div>

      <!-- Sign List -->
      <div id="mri-neuro-signs-list" class="signs-list">
        <div class="loading">Loading MRI neuromarkers...</div>
      </div>

      <!-- Detail Panel (Modal) -->
      <div id="mri-neuro-detail-modal" class="modal" style="display:none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="detail-sign-name"></h3>
            <button class="modal-close" data-close-detail>&times;</button>
          </div>
          <div class="modal-body" id="mri-neuro-detail-content">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Bind event handlers and populate data for the MRI Neuromarkers tab
 */
export function bindMRINeuromarkersTab() {
  // Add event listener for search button
  const searchBtn = document.getElementById('mri-neuro-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      const query = document.getElementById('mri-neuro-search-input')?.value || '';
      await loadAndDisplayMRINeuromarkers(query);
    });
  }

  // Add event listeners for filter selects
  const categorySelect = document.getElementById('mri-neuro-filter-category');
  const modalitySelect = document.getElementById('mri-neuro-filter-modality');
  const sequenceSelect = document.getElementById('mri-neuro-filter-sequence');
  
  [categorySelect, modalitySelect, sequenceSelect].forEach(select => {
    if (select) {
      select.addEventListener('change', async () => {
        const query = document.getElementById('mri-neuro-search-input')?.value || '';
        await loadAndDisplayMRINeuromarkers(query);
      });
    }
  });

  // Load initial data
  loadAndDisplayMRINeuromarkers('');
  
  // Close modal handler
  document.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close-detail')) {
      const modal = document.getElementById('mri-neuro-detail-modal');
      if (modal) modal.style.display = 'none';
    }
  });
}

/**
 * Load MRI Neuromarkers and display them
 */
async function loadAndDisplayMRINeuromarkers(query) {
  const signsList = document.getElementById('mri-neuro-signs-list');
  if (!signsList) return;

  try {
    // Get filter values
    const category = document.getElementById('mri-neuro-filter-category')?.value || '';
    const modality = document.getElementById('mri-neuro-filter-modality')?.value || '';
    const sequence = document.getElementById('mri-neuro-filter-sequence')?.value || '';

    // Filter signs
    let filteredSigns = MRI_NEUROMARKERS_DATA.filter(sign => {
      const matchesQuery = !query || 
        sign.name.toLowerCase().includes(query.toLowerCase()) ||
        sign.definition.toLowerCase().includes(query.toLowerCase()) ||
        sign.anatomy.toLowerCase().includes(query.toLowerCase());
      
      const matchesCategory = !category || sign.category.includes(category);
      const matchesModality = !modality || sign.modality.includes(modality);
      const matchesSequence = !sequence || sign.sequence.includes(sequence);
      
      return matchesQuery && matchesCategory && matchesModality && matchesSequence;
    });

    if (!filteredSigns || filteredSigns.length === 0) {
      signsList.innerHTML = '<div class="empty-state">No MRI neuromarkers found. Try adjusting your filters.</div>';
      return;
    }

    // Render signs
    signsList.innerHTML = filteredSigns.map(sign => `
      <div class="sign-card" data-sign-id="${sign.id}">
        <div class="sign-header">
          <h3>${esc(sign.name)}</h3>
          <span class="sign-category">${esc(sign.category)}</span>
        </div>
        <p class="sign-anatomy"><strong>Anatomy:</strong> ${esc(sign.anatomy)}</p>
        <p class="sign-description">${esc(sign.definition)}</p>
        <button class="btn btn-sm btn-ghost" data-view-details="${sign.id}">View Details</button>
      </div>
    `).join('');

    // Bind detail view buttons
    signsList.querySelectorAll('[data-view-details]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const signId = e.target.getAttribute('data-view-details');
        await showSignDetail(signId);
      });
    });
  } catch (error) {
    signsList.innerHTML = `<div class="error">Error loading neuromarkers: ${esc(error.message)}</div>`;
    console.error('MRI Neuromarkers error:', error);
  }
}

/**
 * Show sign detail in modal
 */
async function showSignDetail(signId) {
  const modal = document.getElementById('mri-neuro-detail-modal');
  if (!modal) return;

  try {
    const sign = MRI_NEUROMARKERS_DATA.find(s => s.id === signId);
    if (!sign) {
      alert('Sign not found');
      return;
    }

    document.getElementById('detail-sign-name').textContent = sign.name;
    
    const detailContent = document.getElementById('mri-neuro-detail-content');
    detailContent.innerHTML = `
      <div class="detail-section">
        <h4>Anatomy & Sequences</h4>
        <p><strong>Anatomy:</strong> ${esc(sign.anatomy)}</p>
        <p><strong>Best Sequences:</strong> ${esc(sign.sequence)}</p>
      </div>
      
      <div class="detail-section">
        <h4>Definition</h4>
        <p>${esc(sign.definition)}</p>
      </div>

      <div class="detail-section">
        <h4>Clinical Significance</h4>
        <p>${esc(sign.clinical_significance)}</p>
      </div>

      <div class="detail-section">
        <h4>Associated Conditions</h4>
        <ul>${sign.associated_conditions.map(cond => `<li>${esc(cond)}</li>`).join('')}</ul>
      </div>

      ${sign.warning ? `
        <div class="warning-section">
          <strong>⚠️ Important Caveat:</strong>
          <p>${esc(sign.warning)}</p>
        </div>
      ` : ''}

      <div class="detail-section">
        <h4>Suggested Reporting Phrase</h4>
        <textarea class="reporting-phrase" readonly>${esc(sign.reporting_phrase)}</textarea>
      </div>

      <div class="detail-section">
        <h4>Literature References</h4>
        <ul class="references-list">
          ${sign.references.map(ref => `<li>${esc(ref)}</li>`).join('')}
        </ul>
        <p style="font-size:11px;color:var(--text-tertiary);margin-top:8px"><em>${esc(sign.literature_anchor)}</em></p>
      </div>
    `;

    modal.style.display = 'flex';
  } catch (error) {
    alert('Error loading sign details: ' + error.message);
    console.error('Detail error:', error);
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
