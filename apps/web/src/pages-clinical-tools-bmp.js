// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-bmp.js — Brain Map Planner (extracted from
// pages-clinical-tools.js to keep the parent chunk under the bundle warning
// limit). Self-contained: only `api` from the runtime is needed.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from "./api.js";

export async function pgBrainMapPlanner(setTopbar) {
  setTopbar('Brain Map Planner', `
    <button class="btn btn-sm" onclick="window._bmpImportFromProtocol()">Import from protocol &#x2193;</button>
    <button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="window._bmpSaveToProtocol()">Save to protocol &#x2192;</button>
    <button class="btn btn-sm" onclick="window._nav('protocol-wizard')">Protocol Search</button>
    <button class="btn btn-sm" onclick="window._nav('prescriptions')">Prescriptions</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  const FALLBACK_CONDITIONS = [
    'Major Depressive Disorder','Treatment-Resistant Depression','Bipolar Depression',
    'OCD','PTSD','Generalized Anxiety','Social Anxiety','Panic Disorder',
    'ADHD','Schizophrenia','Auditory Hallucinations','Chronic Pain','Fibromyalgia',
    'Parkinson Disease','Stroke Rehabilitation','Aphasia','Tinnitus',
    'Insomnia','Traumatic Brain Injury','Eating Disorders','Addiction','Autism Spectrum'
  ];

  const BMP_SITES = {
    'Fpz':[150,14],'Fp1':[107,20],'Fp2':[193,20],
    'AF7':[72,38],'AFz':[150,40],'AF8':[228,38],
    'F7':[38,82],'F3':[97,72],'Fz':[150,68],'F4':[203,72],'F8':[262,82],
    'FT7':[28,118],'FC3':[90,108],'FCz':[150,104],'FC4':[210,108],'FT8':[272,118],
    'T7':[22,155],'C3':[78,155],'Cz':[150,155],'C4':[222,155],'T8':[278,155],
    'TP7':[28,192],'CP3':[90,202],'CPz':[150,206],'CP4':[210,202],'TP8':[272,192],
    'T5':[38,228],'P3':[97,238],'Pz':[150,242],'P4':[203,238],'T6':[262,228],
    'PO7':[60,268],'PO3':[107,260],'POz':[150,264],'PO4':[193,260],'PO8':[240,268],
    'O1':[108,288],'Oz':[150,294],'O2':[192,288],
    'AF3':[118,46],'AF4':[182,46],
    'F1':[123,72],'F2':[177,72],'F5':[62,80],'F6':[238,80],
    'FC1':[119,108],'FC2':[181,108],'FC5':[54,114],'FC6':[246,114],
    'C1':[114,155],'C2':[186,155],'C5':[50,155],'C6':[250,155],
    'CP1':[119,202],'CP2':[181,202],'CP5':[54,196],'CP6':[246,196],
    'P1':[122,240],'P2':[178,240],'P5':[72,236],'P6':[228,236],
    'PO1':[125,262],'PO2':[175,262],
  };

  const BMP_REGION_SITES = {
    'DLPFC-L':    { primary:['F3'],        ref:['Fp2'],        alt:['AF3','F1','FC1'] },
    'DLPFC-R':    { primary:['F4'],        ref:['Fp1'],        alt:['AF4','F2','FC2'] },
    'DLPFC-B':    { primary:['F3','F4'],   ref:[],             alt:['Fz'] },
    'M1-L':       { primary:['C3'],        ref:['C4'],         alt:['FC3','CP3'] },
    'M1-R':       { primary:['C4'],        ref:['C3'],         alt:['FC4','CP4'] },
    'M1-B':       { primary:['C3','C4'],   ref:['Cz'],         alt:['FC3','FC4'] },
    'SMA':        { primary:['FCz','Cz'],  ref:[],             alt:['FC1','FC2','Fz'] },
    'mPFC':       { primary:['Fz'],        ref:['Pz'],         alt:['AFz','FCz'] },
    'DMPFC':      { primary:['Fz'],        ref:['Oz'],         alt:['FCz','AF4'] },
    'VMPFC':      { primary:['Fpz'],       ref:['Pz'],         alt:['Fp1','Fp2'] },
    'OFC':        { primary:['Fp1','Fp2'], ref:['Pz'],         alt:['AF3','AF4'] },
    'ACC':        { primary:['FCz'],       ref:['Pz'],         alt:['Cz','Fz'] },
    'IFG-L':      { primary:['F7'],        ref:['F8'],         alt:['FT7','FC3'] },
    'IFG-R':      { primary:['F8'],        ref:['F7'],         alt:['FT8','FC4'] },
    'PPC-L':      { primary:['P3'],        ref:['F4'],         alt:['CP3','P5'] },
    'PPC-R':      { primary:['P4'],        ref:['F3'],         alt:['CP4','P6'] },
    'TEMPORAL-L': { primary:['T7'],        ref:['T8'],         alt:['TP7','FT7'] },
    'TEMPORAL-R': { primary:['T8'],        ref:['T7'],         alt:['TP8','FT8'] },
    'S1':         { primary:['C3'],        ref:['C4'],         alt:['CP3','FC3'] },
    'V1':         { primary:['Oz'],        ref:['Cz'],         alt:['O1','O2'] },
    'CEREBELLUM': { primary:['Oz'],        ref:['Cz'],         alt:['O1','O2','POz'] },
    'Cz':         { primary:['Cz'],        ref:['Fz'],         alt:['FC1','FC2','CP1','CP2'] },
    'Pz':         { primary:['Pz'],        ref:['Fz'],         alt:['CPz','POz'] },
    'Fz':         { primary:['Fz'],        ref:['Pz'],         alt:['FCz','AFz'] },
  };

  const BMP_PROTO_MAP = {
    'tms-mdd-hf-standard':    { region:'DLPFC-L', modality:'TMS/rTMS',     lat:'left',     freq:'10',      intensity:'120',  pulses:'3000', sessions:'36' },
    'tms-mdd-itbs':           { region:'DLPFC-L', modality:'iTBS',         lat:'left',     freq:'50',      intensity:'80',   pulses:'600',  sessions:'30' },
    'tms-mdd-bilateral':      { region:'DLPFC-B', modality:'TMS/rTMS',     lat:'bilateral',freq:'10',      intensity:'120',  pulses:'3000', sessions:'36' },
    'tms-mdd-saint':          { region:'DLPFC-L', modality:'iTBS',         lat:'left',     freq:'50',      intensity:'90',   pulses:'1800', sessions:'50' },
    'tms-ocd-h7coil':         { region:'DMPFC',   modality:'Deep TMS',     lat:'bilateral',freq:'20',      intensity:'100',  pulses:'2000', sessions:'29' },
    'tms-ocd-standard':       { region:'DMPFC',   modality:'TMS/rTMS',     lat:'bilateral',freq:'20',      intensity:'100',  pulses:'1500', sessions:'30' },
    'tms-anxiety-r-dlpfc':    { region:'DLPFC-R', modality:'TMS/rTMS',     lat:'right',    freq:'1',       intensity:'110',  pulses:'360',  sessions:'20' },
    'tms-ptsd-dlpfc':         { region:'DLPFC-L', modality:'TMS/rTMS',     lat:'left',     freq:'10',      intensity:'110',  pulses:'2000', sessions:'20' },
    'tms-schiz-avh':          { region:'TEMPORAL-L', modality:'TMS/rTMS',  lat:'left',     freq:'1',       intensity:'90',   pulses:'360',  sessions:'15' },
    'tms-parkinsons-motor':   { region:'M1-L',    modality:'TMS/rTMS',     lat:'bilateral',freq:'5',       intensity:'90',   pulses:'500',  sessions:'20' },
    'tdcs-mdd-anodal-f3':     { region:'DLPFC-L', modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'20' },
    'tdcs-adhd':              { region:'DLPFC-L', modality:'tDCS',         lat:'bilateral',freq:'DC',      intensity:'1 mA', pulses:'\u2014', sessions:'15' },
    'tdcs-pain-m1':           { region:'M1-L',    modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'10' },
    'tdcs-stroke-motor':      { region:'M1-L',    modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'15' },
    'tdcs-aphasia':           { region:'IFG-L',   modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'1 mA', pulses:'\u2014', sessions:'15' },
    'nfb-alpha-theta-anxiety':{ region:'Pz',      modality:'Neurofeedback',lat:'bilateral',freq:'6-12Hz',  intensity:'\u2014', pulses:'\u2014', sessions:'30' },
    'nfb-smr-adhd':           { region:'Cz',      modality:'Neurofeedback',lat:'bilateral',freq:'12-15Hz', intensity:'\u2014', pulses:'\u2014', sessions:'40' },
    'nfb-gamma-cognition':    { region:'Fz',      modality:'Neurofeedback',lat:'bilateral',freq:'38-42Hz', intensity:'\u2014', pulses:'\u2014', sessions:'30' },
    'nfb-theta-alpha-depress':{ region:'Fz',      modality:'Neurofeedback',lat:'bilateral',freq:'4-12Hz',  intensity:'\u2014', pulses:'\u2014', sessions:'30' },
  };

  const BMP_MNI = {
    'F3':'-46, 36, 20','F4':'46, 36, 20','C3':'-52, -2, 50','C4':'52, -2, 50',
    'Cz':'0, -2, 62','Fz':'0, 24, 58','Pz':'0, -62, 56','T7':'-72, -24, 4',
    'T8':'72, -24, 4','T5':'-62, -52, 0','T6':'62, -52, 0','Fp1':'-28, 70, 8',
    'Fp2':'28, 70, 8','Oz':'0, -100, 12','FCz':'0, 16, 62','F7':'-52, 22, 8',
    'F8':'52, 22, 8','O1':'-28, -102, 12','O2':'28, -102, 12',
    'P3':'-46, -58, 46','P4':'46, -58, 46',
  };

  const BMP_BA = {
    'F3':'BA9/46','F4':'BA9/46','C3':'BA4','C4':'BA4','Cz':'BA4',
    'Fz':'BA8/32','Pz':'BA7','T7':'BA21/22','T8':'BA21/22',
    'Fp1':'BA10','Fp2':'BA10','Oz':'BA17','FCz':'BA6',
    'F7':'BA45/47','F8':'BA45/47','O1':'BA17/18','O2':'BA17/18',
    'P3':'BA40','P4':'BA40',
  };

  const BMP_ANATOMY = {
    'Fpz':'Prefrontal Midline','Fp1':'Left Frontopolar Cortex','Fp2':'Right Frontopolar Cortex',
    'AF7':'Left Anterior Frontal','AFz':'Anterior Frontal Midline','AF8':'Right Anterior Frontal',
    'AF3':'Left Anterior Frontal (lat)','AF4':'Right Anterior Frontal (lat)',
    'F7':'Left Inferior Frontal Gyrus','F3':'Left Dorsolateral Prefrontal Cortex (DLPFC)',
    'Fz':'Supplementary Motor / Medial PFC','F4':'Right Dorsolateral Prefrontal Cortex (DLPFC)',
    'F8':'Right Inferior Frontal Gyrus',
    'F1':'Left Frontal (medial)','F2':'Right Frontal (medial)',
    'F5':'Left Frontal (lateral)','F6':'Right Frontal (lateral)',
    'FT7':'Left Frontotemporal','FC3':'Left Premotor / Frontal Eye Field',
    'FCz':'Supplementary Motor Area (SMA)','FC4':'Right Premotor','FT8':'Right Frontotemporal',
    'FC1':'Left SMA (medial)','FC2':'Right SMA (medial)',
    'FC5':'Left Premotor (lateral)','FC6':'Right Premotor (lateral)',
    'T7':'Left Superior Temporal Gyrus','C3':'Left Primary Motor Cortex (M1)',
    'Cz':'Primary Motor / Sensory Midline','C4':'Right Primary Motor Cortex (M1)',
    'T8':'Right Superior Temporal Gyrus',
    'C1':'Left Motor (medial)','C2':'Right Motor (medial)',
    'C5':'Left Motor (lateral)','C6':'Right Motor (lateral)',
    'TP7':'Left Temporoparietal Junction','CP3':'Left Somatosensory / Parietal',
    'CPz':'Parietal Midline','CP4':'Right Somatosensory / Parietal',
    'TP8':'Right Temporoparietal Junction',
    'CP1':'Left Parietal (medial)','CP2':'Right Parietal (medial)',
    'CP5':'Left Parietal (lateral)','CP6':'Right Parietal (lateral)',
    'T5':'Left Posterior Temporal','P3':'Left Inferior Parietal Lobule',
    'Pz':'Posterior Parietal Midline','P4':'Right Inferior Parietal Lobule',
    'T6':'Right Posterior Temporal',
    'P1':'Left Parietal (medial)','P2':'Right Parietal (medial)',
    'P5':'Left Parietal (lateral)','P6':'Right Parietal (lateral)',
    'PO7':'Left Parieto-Occipital','PO3':'Left Parieto-Occipital (medial)',
    'POz':'Parieto-Occipital Midline','PO4':'Right Parieto-Occipital (medial)',
    'PO8':'Right Parieto-Occipital',
    'PO1':'Left Parieto-Occipital (para)','PO2':'Right Parieto-Occipital (para)',
    'O1':'Left Primary Visual Cortex','Oz':'Occipital Midline / V1','O2':'Right Primary Visual Cortex',
  };

  const BMP_CONDITIONS = {
    'F3':['MDD','TRD','PTSD','ADHD','Anxiety','Bipolar Depression'],
    'F4':['Anxiety','Depression (inhibitory)','OCD','Addiction'],
    'Fz':['ADHD','Depression (midline)','Neurofeedback','SMA disorders'],
    'FCz':['SMA','OCD (deep midline)','Motor recovery'],
    'C3':['Motor rehabilitation','Chronic pain','Parkinson','Stroke'],
    'C4':['Motor rehabilitation','Stroke (left hemisphere)','Chronic pain'],
    'Cz':['Neurofeedback (SMR)','Motor midline','ADHD'],
    'Pz':['Neurofeedback (alpha-theta)','Anxiety','Memory'],
    'T7':['Auditory hallucinations','Schizophrenia','Language disorders'],
    'T8':['Tinnitus','Right temporal disorders'],
    'F7':['Aphasia','IFG stimulation'],
    'Oz':['Visual cortex stimulation','Migraine','V1 research'],
  };

  const BMP_PLACEMENT = {
    'F3': 'Position the coil 5 cm anterior and 2 cm lateral to M1 (C3). Target: -46,36,20 MNI. Beam F3: from Cz, 2cm left then 3cm forward.',
    'F4': '5 cm anterior and 2 cm lateral to C4. Mirror of F3. MNI: +46,36,20. From Cz: 2cm right then 3cm forward.',
    'C3': 'Motor cortex left. Locate Cz (50% nasion-inion), measure 7cm lateral left. Confirm with MEP for motor threshold.',
    'C4': 'Motor cortex right. Mirror of C3. 7cm lateral right from Cz.',
    'Cz': 'Midpoint: 50% of nasion-to-inion and 50% of tragus-to-tragus. Their intersection = Cz.',
    'Fz': 'Midline frontal. 30% from nasion along nasion-to-inion midline = Fz.',
    'FCz': 'Midpoint between Fz and Cz on the midline.',
    'T7': 'Left temporal. Step = 10% of nasion-inion arc. T7 is 3 steps lateral-left from Cz on temporal line.',
    'Oz': 'Occipital midline. 10% above the inion; measure upward from inion along midline.',
    'Fp1': 'Left frontopolar. ~5% from Fpz toward F7 on nasion arc.',
    'Fp2': 'Right frontopolar. Mirror of Fp1.',
    'F7': 'Left inferior frontal. Between F3 and T7; ~3 steps lateral from Fz on frontal arc.',
    'F8': 'Right inferior frontal. Mirror of F7.',
    'P3': 'Left inferior parietal. 7cm left from Pz, or 60% nasion-inion then 7cm lateral.',
    'P4': 'Right inferior parietal. Mirror of P3.',
    'T8': 'Right temporal. Mirror of T7.',
    'Pz': 'Parietal midline. 80% of nasion-to-inion distance from nasion.',
  };

  const BMP_PROTO_LABELS = {
    'tms-mdd-hf-standard':    'HF-rTMS DLPFC-L (MDD)',
    'tms-mdd-itbs':           'iTBS DLPFC-L (MDD)',
    'tms-mdd-bilateral':      'Bilateral rTMS (MDD)',
    'tms-mdd-saint':          'SAINT / Accelerated iTBS',
    'tms-ocd-h7coil':         'Deep TMS H7-Coil (OCD)',
    'tms-ocd-standard':       'rTMS DMPFC (OCD)',
    'tms-anxiety-r-dlpfc':    'LF-rTMS R-DLPFC (Anxiety)',
    'tms-ptsd-dlpfc':         'rTMS DLPFC-L (PTSD)',
    'tms-schiz-avh':          'LF-rTMS Temporal-L (AVH)',
    'tms-parkinsons-motor':   'rTMS M1 (Parkinson)',
    'tdcs-mdd-anodal-f3':     'tDCS Anodal F3 (MDD)',
    'tdcs-adhd':              'tDCS DLPFC Bilateral (ADHD)',
    'tdcs-pain-m1':           'tDCS M1 (Chronic Pain)',
    'tdcs-stroke-motor':      'tDCS M1 (Stroke Motor)',
    'tdcs-aphasia':           'tDCS IFG-L (Aphasia)',
    'nfb-alpha-theta-anxiety':'NFB Alpha-Theta Pz (Anxiety)',
    'nfb-smr-adhd':           'NFB SMR Cz (ADHD)',
    'nfb-gamma-cognition':    'NFB Gamma Fz (Cognition)',
    'nfb-theta-alpha-depress':'NFB Theta-Alpha Fz (Depression)',
  };

  const MODALITY_COLORS = {
    'TMS/rTMS':'#00d4bc','iTBS':'#00d4bc','cTBS':'#5ee7df','Deep TMS':'#06b6d4',
    'tDCS':'#4a9eff','tACS':'#818cf8','Neurofeedback':'#f59e0b',
    'taVNS':'#a78bfa','CES':'#34d399','PBM':'#fb923c','TPS':'#f472b6',
  };

  // Modality → dot color for MRI overlay (mirrors MODALITY_DOT_COLOR in
  // pages-mri-analysis.js so the planner's MRI focus viewer is visually
  // consistent with the MRI analysis page).
  const MODALITY_DOT_COLOR = {
    rtms: '#f59e0b', tps: '#c026d3', tfus: '#06b6d4',
    tdcs: '#22c55e', tacs: '#eab308', custom: '#94a3b8',
  };
  function _bmpModalityDotColor(mod) {
    const m = String(mod || '').toLowerCase();
    if (m.indexOf('tdcs') !== -1) return MODALITY_DOT_COLOR.tdcs;
    if (m.indexOf('tacs') !== -1) return MODALITY_DOT_COLOR.tacs;
    if (m.indexOf('tps') !== -1)  return MODALITY_DOT_COLOR.tps;
    if (m.indexOf('tfus') !== -1 || m.indexOf('tus') !== -1) return MODALITY_DOT_COLOR.tfus;
    if (m.indexOf('tms') !== -1 || m.indexOf('itbs') !== -1 || m.indexOf('ctbs') !== -1) {
      return MODALITY_DOT_COLOR.rtms;
    }
    return '#60a5fa';
  }
  // Parse the comma-separated BMP_MNI strings ("-46, 36, 20") into numeric
  // tuples once so the MRI viewer can project per-plane without re-parsing.
  const BMP_MNI_TUPLE = {};
  Object.keys(BMP_MNI).forEach(function(site) {
    const parts = String(BMP_MNI[site] || '').split(',').map(function(s) {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    });
    if (parts.length === 3 && parts.every(function(v) { return v != null; })) {
      BMP_MNI_TUPLE[site] = parts;
    }
  });
  // Resolve MNI for a catalog entry by walking primary 10-20 site → BMP_MNI.
  // Returns null when the region's primary site has no MNI mapping (caller
  // should skip the dot rather than fabricate coordinates).
  function _bmpCatalogMNI(cat) {
    if (!cat) return null;
    const tries = [];
    if (cat.targetRegion && BMP_REGION_SITES[cat.targetRegion]) {
      const rs = BMP_REGION_SITES[cat.targetRegion];
      (rs.primary || []).forEach(function(s) { tries.push(s); });
    }
    if (cat.anode) tries.push(cat.anode);
    for (let i = 0; i < tries.length; i++) {
      const t = BMP_MNI_TUPLE[tries[i]];
      if (t) return { mni: t, site: tries[i] };
    }
    return null;
  }

  const BMP_STORAGE_KEY = 'ds_brain_map_planner_state_v1';
  const BMP_PRESETS_KEY = 'ds_brain_map_planner_presets_v1';

  let bmpState = {
    region:'', modality:'TMS/rTMS', lat:'left',
    freq:'', intensity:'', pulses:'', duration:'', sessions:'', notes:'',
    selectedSite:'', view:'clinical', protoId:'',
    zoom: 1,
    labelMode: 'smart', // smart | full | minimal
    panX: 0, // in SVG coordinate units (viewBox space)
    panY: 0,
    // v2 additions — all behaviourally backwards-compatible (tab defaults to
    // 'clinical' which mirrors the pre-v2 single-screen experience).
    tab: 'clinical',           // clinical | montage | research
    patientId: '',             // optional free-string patient label; '' → "Demo patient"
    placeMode: 'anode',        // anode | cathode — which electrode a map-click places
    compare: false,            // 2-up compare canvases
    eFieldOverlay: true,       // toggle radial-gradient E-field on primary site
    waveform: 'Anodal DC',     // stimulation waveform hint
    mriOverlay: false,         // toggle MRI focus viewer panel under canvas
  };

  // Load persisted state (best-effort). Never trust shape fully.
  try {
    const raw = JSON.parse(localStorage.getItem(BMP_STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      bmpState = {
        ...bmpState,
        region:       typeof raw.region === 'string' ? raw.region : bmpState.region,
        modality:     typeof raw.modality === 'string' ? raw.modality : bmpState.modality,
        lat:          typeof raw.lat === 'string' ? raw.lat : bmpState.lat,
        freq:         typeof raw.freq === 'string' ? raw.freq : bmpState.freq,
        intensity:    typeof raw.intensity === 'string' ? raw.intensity : bmpState.intensity,
        pulses:       typeof raw.pulses === 'string' ? raw.pulses : bmpState.pulses,
        duration:     typeof raw.duration === 'string' ? raw.duration : bmpState.duration,
        sessions:     typeof raw.sessions === 'string' ? raw.sessions : bmpState.sessions,
        notes:        typeof raw.notes === 'string' ? raw.notes : bmpState.notes,
        selectedSite: typeof raw.selectedSite === 'string' ? raw.selectedSite : bmpState.selectedSite,
        view:         (raw.view === 'patient' || raw.view === 'clinical') ? raw.view : bmpState.view,
        protoId:      typeof raw.protoId === 'string' ? raw.protoId : bmpState.protoId,
        zoom:         Number.isFinite(raw.zoom) ? raw.zoom : bmpState.zoom,
        labelMode:    (raw.labelMode === 'full' || raw.labelMode === 'minimal' || raw.labelMode === 'smart') ? raw.labelMode : bmpState.labelMode,
        panX:         Number.isFinite(raw.panX) ? raw.panX : bmpState.panX,
        panY:         Number.isFinite(raw.panY) ? raw.panY : bmpState.panY,
        tab:          (raw.tab === 'clinical' || raw.tab === 'montage' || raw.tab === 'research') ? raw.tab : bmpState.tab,
        patientId:    typeof raw.patientId === 'string' ? raw.patientId : bmpState.patientId,
        placeMode:    (raw.placeMode === 'anode' || raw.placeMode === 'cathode') ? raw.placeMode : bmpState.placeMode,
        compare:      !!raw.compare,
        eFieldOverlay: raw.eFieldOverlay == null ? bmpState.eFieldOverlay : !!raw.eFieldOverlay,
        waveform:     typeof raw.waveform === 'string' ? raw.waveform : bmpState.waveform,
        mriOverlay:   raw.mriOverlay == null ? bmpState.mriOverlay : !!raw.mriOverlay,
      };
    }
  } catch (_) {}

  function _persist() {
    try {
      localStorage.setItem(BMP_STORAGE_KEY, JSON.stringify({
        region: bmpState.region,
        modality: bmpState.modality,
        lat: bmpState.lat,
        freq: bmpState.freq,
        intensity: bmpState.intensity,
        pulses: bmpState.pulses,
        duration: bmpState.duration,
        sessions: bmpState.sessions,
        notes: bmpState.notes,
        selectedSite: bmpState.selectedSite,
        view: bmpState.view,
        protoId: bmpState.protoId,
        zoom: bmpState.zoom,
        labelMode: bmpState.labelMode,
        panX: bmpState.panX,
        panY: bmpState.panY,
        tab: bmpState.tab,
        patientId: bmpState.patientId,
        placeMode: bmpState.placeMode,
        compare: bmpState.compare,
        eFieldOverlay: bmpState.eFieldOverlay,
        waveform: bmpState.waveform,
        mriOverlay: bmpState.mriOverlay,
      }));
    } catch (_) {}
  }

  function _loadPresets() {
    try {
      const raw = JSON.parse(localStorage.getItem(BMP_PRESETS_KEY) || '[]');
      if (Array.isArray(raw)) return raw.filter(x => x && typeof x === 'object' && typeof x.name === 'string');
    } catch (_) {}
    return [];
  }
  function _savePresets(items) {
    try { localStorage.setItem(BMP_PRESETS_KEY, JSON.stringify(items || [])); } catch (_) {}
  }
  function _planSummary() {
    const s = bmpState;
    const parts = [];
    if (s.modality) parts.push(`Modality: ${s.modality}`);
    if (s.region) parts.push(`Target region: ${s.region}`);
    if (s.selectedSite) parts.push(`Primary site: ${s.selectedSite}`);
    if (s.lat) parts.push(`Laterality: ${s.lat}`);
    if (s.freq) parts.push(`Frequency: ${s.freq}`);
    if (s.intensity) parts.push(`Intensity: ${s.intensity}`);
    if (s.pulses) parts.push(`Pulses/session: ${s.pulses}`);
    if (s.duration) parts.push(`Duration: ${s.duration}`);
    if (s.sessions) parts.push(`Sessions: ${s.sessions}`);
    if (s.notes) parts.push(`Notes: ${s.notes}`);
    return parts.join('\n');
  }

  let conds = [], protos = [];
  let _libProtos = [], _libConditions = [], _libDevices = [];
  try {
    const apiObj = window._api || window.api;
    const [cd, pd, lib] = await Promise.all([
      apiObj ? apiObj.conditions().catch(function() { return null; }) : Promise.resolve(null),
      apiObj ? apiObj.protocols().catch(function()  { return null; }) : Promise.resolve(null),
      import('./protocols-data.js').catch(function() { return null; }),
    ]);
    conds  = (cd && cd.items)  ? cd.items  : [];
    protos = (pd && pd.items)  ? pd.items  : [];
    if (lib) {
      _libProtos     = lib.PROTOCOL_LIBRARY || [];
      _libConditions = lib.CONDITIONS       || [];
      _libDevices    = lib.DEVICES          || [];
    }
  } catch (_) {}
  if (!conds.length) conds = FALLBACK_CONDITIONS.map(function(n) { return { name: n }; });

  function _devToModality(dev, subtype) {
    const s = String(subtype || '').toLowerCase();
    if (dev === 'tms' || dev === 'deep_tms') {
      if (s.indexOf('itbs') !== -1) return 'iTBS';
      if (s.indexOf('ctbs') !== -1) return 'cTBS';
      if (s.indexOf('deep') !== -1 || s.indexOf('h-coil') !== -1) return 'Deep TMS';
      return 'TMS/rTMS';
    }
    const M = { tdcs:'tDCS', tacs:'tACS', ces:'CES', tavns:'taVNS', tps:'TPS',
                pbm:'PBM', pemf:'PBM', nf:'Neurofeedback', tus:'TPS' };
    return M[dev] || 'TMS/rTMS';
  }

  function _inferElectrodes(p) {
    const name    = (p && (p.name || '')       || '').toLowerCase();
    const summary = (p && (p.notes || p.summary || '') || '').toLowerCase();
    const target  = (p && (p.target || '')     || '').toLowerCase();
    const blob = name + ' ' + summary + ' ' + target;
    if (/anode\s*f3[\s\S]*cathode\s*f4/i.test(blob)) return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (/left dlpfc|\(f3\)|\bf3\b/.test(blob))   return { anode:'F3', targetRegion:'DLPFC-L' };
    if (/right dlpfc|\(f4\)|\bf4\b/.test(blob))  return { anode:'F4', targetRegion:'DLPFC-R' };
    if (/\bsma\b|\bfcz\b/.test(blob))            return { anode:'FCz', targetRegion:'SMA' };
    if (/dmpfc|dorsomedial/.test(blob))          return { anode:'Fz', targetRegion:'DMPFC' };
    if (/mpfc|medial pfc|\bfz\b/.test(blob))     return { anode:'Fz', targetRegion:'mPFC' };
    if (/ifg|\bf7\b|broca/.test(blob))           return { anode:'F7', targetRegion:'IFG-L' };
    if (/vertex|\bcz\b/.test(blob))              return { anode:'Cz', targetRegion:'Cz' };
    if (/occipital|\boz\b|\bo1\b|\bo2\b/.test(blob)) return { anode:'Oz', targetRegion:'V1' };
    if (/alpha.?theta|\bpz\b/.test(blob))        return { anode:'Pz', targetRegion:'Pz' };
    if (/left m1|m1-l|motor.*left|\bc3\b/.test(blob)) return { anode:'C3', targetRegion:'M1-L' };
    if (/right m1|m1-r|motor.*right|\bc4\b/.test(blob)) return { anode:'C4', targetRegion:'M1-R' };
    if (/temporal.*left|\bt7\b|\bt5\b/.test(blob)) return { anode:'T7', targetRegion:'TEMPORAL-L' };
    if (/temporal.*right|\bt8\b|\bt6\b/.test(blob)) return { anode:'T8', targetRegion:'TEMPORAL-R' };
    if (p && (p.device === 'tms' || p.device === 'deep_tms')) return { anode:'F3', targetRegion:'DLPFC-L' };
    if (p && p.device === 'tdcs')  return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (p && p.device === 'nf')    return { anode:'Cz', targetRegion:'Cz' };
    return { anode: 'F3', targetRegion: 'DLPFC-L' };
  }

  // Unified protocol catalog: curated (exact params) wins, library fills bulk,
  // backend registry fills gaps. Dedup by id.
  const _catalog = [];
  const _seen = new Set();
  Object.keys(BMP_PROTO_MAP).forEach(function(id) {
    _seen.add(id);
    const m = BMP_PROTO_MAP[id];
    const rs = BMP_REGION_SITES[m.region];
    _catalog.push({
      id: id,
      name: BMP_PROTO_LABELS[id] || id,
      conditionId: '',
      device: '',
      modality: m.modality,
      evidenceGrade: 'A',
      summary: '',
      anode:   rs && rs.primary && rs.primary.length ? rs.primary[0] : null,
      cathode: rs && rs.ref && rs.ref.length ? rs.ref[0] : null,
      targetRegion: m.region,
      parameters: { frequency_hz: m.freq, intensity: m.intensity, pulses_per_session: m.pulses, sessions_total: m.sessions },
      source: 'curated',
    });
  });
  _libProtos.forEach(function(p) {
    if (!p || !p.id || _seen.has(p.id)) return;
    _seen.add(p.id);
    const inf = _inferElectrodes(p);
    _catalog.push({
      id: p.id, name: p.name || p.id,
      conditionId: p.conditionId || '',
      device: p.device || '',
      subtype: p.subtype || '',
      modality: _devToModality(p.device, p.subtype),
      evidenceGrade: p.evidenceGrade || '?',
      summary: p.notes || '',
      anode: inf.anode || null,
      cathode: inf.cathode || null,
      targetRegion: inf.targetRegion || null,
      parameters: p.parameters || {},
      source: 'library',
    });
  });
  (protos || []).forEach(function(row) {
    if (!row || !row.id || _seen.has(row.id)) return;
    _seen.add(row.id);
    const inf = _inferElectrodes({
      name: row.name, notes: row.evidence_summary || row.coil_or_electrode_placement || '',
      target: row.target_region || '', device: (row.modality_id || '').toLowerCase(),
    });
    _catalog.push({
      id: row.id, name: row.name || row.id,
      conditionId: row.condition_id || '',
      device: (row.modality_id || '').toLowerCase(),
      subtype: row.subtype || '',
      modality: _devToModality((row.modality_id||'').toLowerCase(), row.subtype),
      evidenceGrade: String(row.evidence_grade || '').replace(/^EV-/, '') || '?',
      summary: row.evidence_summary || '',
      anode: inf.anode || null,
      cathode: inf.cathode || null,
      targetRegion: inf.targetRegion || null,
      parameters: { frequency_hz: row.frequency_hz || '', intensity: row.intensity || '', total_course: row.total_course || '' },
      source: 'backend',
    });
  });

  const _catalogById = {};
  _catalog.forEach(function(e) { _catalogById[e.id] = e; });

  const _bmpProtoFilter = { q: '', cond: '', ev: '', site: '' };

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function _mc() { return MODALITY_COLORS[bmpState.modality] || '#00d4bc'; }

  // ── Brain Map Planner v2 helpers ─────────────────────────────────────────
  // Region-group bucketing mirrors the design's left-atlas groupings so the
  // visible ordering matches the clinician-grade layout without duplicating
  // the region table.
  function _regionGroup(id) {
    if (!id) return 'Other';
    if (/^DLPFC|^mPFC|^DMPFC|^VMPFC|^OFC|^ACC$/.test(id)) return 'Prefrontal';
    if (/^M1|^SMA$|^S1$/.test(id)) return 'Motor / Sensory';
    if (/^TEMPORAL|^IFG|^PPC/.test(id)) return 'Parietal / Temporal';
    if (/^V1$|^CEREBELLUM$/.test(id)) return 'Occipital';
    return 'Other';
  }
  function _regionLabel(id) {
    const map = {
      'DLPFC-L':'DLPFC · Left', 'DLPFC-R':'DLPFC · Right', 'DLPFC-B':'DLPFC · Bilateral',
      'M1-L':'M1 · Left', 'M1-R':'M1 · Right', 'M1-B':'M1 · Bilateral',
      'SMA':'SMA · Supplementary motor', 'mPFC':'mPFC · Medial PFC',
      'DMPFC':'DMPFC · Dorsomedial', 'VMPFC':'VMPFC · Ventromedial',
      'OFC':'OFC · Orbitofrontal', 'ACC':'ACC · Anterior cingulate',
      'IFG-L':"Broca · IFG Left", 'IFG-R':'IFG · Right',
      'PPC-L':'PPC · Left', 'PPC-R':'PPC · Right',
      'TEMPORAL-L':'Temporal · Left', 'TEMPORAL-R':'Temporal · Right',
      'S1':'S1 · Somatosensory', 'V1':'V1 · Primary visual',
      'CEREBELLUM':'Cerebellum', 'Cz':'Cz · Vertex', 'Pz':'Pz · Parietal midline',
      'Fz':'Fz · Frontal midline',
    };
    return map[id] || id.replace(/[-_]/g, ' ');
  }
  function _regionFunction(id) {
    const fn = {
      'DLPFC-L':'Executive control · cognitive reappraisal · top-down affect',
      'DLPFC-R':'Inhibitory control · risk aversion · anxious rumination',
      'DLPFC-B':'Bilateral executive regulation · MDD & cognition',
      'M1-L':'Pain modulation · motor rehab · corticospinal excitability',
      'M1-R':'Motor recovery (right) · chronic pain · post-stroke',
      'M1-B':'Bilateral M1 · motor rehab · pain',
      'SMA':'Motor planning · response inhibition · tics · OCD rituals',
      'mPFC':'Midline self-referential processing · mood',
      'DMPFC':'Deep midline target · OCD · depression',
      'VMPFC':'Emotion valuation · fear extinction · default mode',
      'OFC':'Reward valuation · craving · addiction',
      'ACC':'Conflict monitoring · pain affect · attention',
      'IFG-L':'Speech production · post-stroke aphasia rehab',
      'IFG-R':'Response inhibition · disinhibition',
      'PPC-L':'Attention · working memory · left neglect',
      'PPC-R':'Spatial attention · neglect rehab',
      'TEMPORAL-L':'Auditory hallucinations · language · schizophrenia',
      'TEMPORAL-R':'Tinnitus · right-hemisphere auditory',
      'S1':'Somatosensory cortex · pain processing',
      'V1':'Cortical excitability · migraine prophylaxis',
      'CEREBELLUM':'Motor coordination · ataxia · cognition',
      'Cz':'Motor/sensory midline · neurofeedback SMR',
      'Pz':'Alpha-theta training · anxiety · memory',
      'Fz':'Frontal midline · ADHD · neurofeedback',
    };
    return fn[id] || 'Targeted 10-20 region';
  }

  // Pad-density math for safety envelope. Mirrors the design's 35×35 mm pad
  // spec (12.25 cm²). Guidelines cap at 0.08 mA/cm² (Antal 2017); amber
  // 0.08–0.12; err > 0.12.
  const BMP_PAD_AREA_CM2 = 12.25;
  function _parseIntensityMA(v) {
    const m = String(v || '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return 0;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : 0;
  }
  function _computeDensity(intensity_mA, pad_cm2) {
    const mA = Number.isFinite(intensity_mA) ? intensity_mA : _parseIntensityMA(intensity_mA);
    const area = pad_cm2 || BMP_PAD_AREA_CM2;
    if (area <= 0) return 0;
    return Math.round((mA / area) * 1000) / 1000; // mA/cm² to 3 dp
  }
  function _densityStatus(d) {
    if (d > 0.12) return 'err';
    if (d > 0.08) return 'amber';
    return 'ok';
  }

  // Pick up to 3 evidence rows for the active protocol: the protocol itself
  // plus up to 2 catalog siblings sharing the same targetRegion with distinct
  // evidence grades. All in-memory, no new API.
  function _evidenceForActive() {
    const active = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    if (!active) return [];
    const out = [{
      id: active.id,
      title: active.name,
      summary: active.summary || '',
      grade: active.evidenceGrade || '?',
      meta: active.modality + (active.source !== 'curated' ? ' · inferred target' : ''),
      isActive: true,
    }];
    const seenGrades = new Set([String(active.evidenceGrade || '?').toUpperCase()]);
    _catalog.forEach(function(p) {
      if (out.length >= 3) return;
      if (p.id === active.id) return;
      if (!p.targetRegion || p.targetRegion !== active.targetRegion) return;
      const g = String(p.evidenceGrade || '?').toUpperCase();
      if (seenGrades.has(g)) return;
      seenGrades.add(g);
      out.push({
        id: p.id,
        title: p.name,
        summary: p.summary || '',
        grade: p.evidenceGrade || '?',
        meta: p.modality + ' · ' + (p.source === 'curated' ? 'curated' : p.source === 'library' ? 'library' : 'registry'),
        isActive: false,
      });
    });
    return out;
  }

  function _inferRegionFromSite(site) {
    if (!site) return '';
    const keys = Object.keys(BMP_REGION_SITES);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const rs = BMP_REGION_SITES[k];
      if (!rs) continue;
      if (rs.primary.indexOf(site) !== -1) return k;
    }
    return '';
  }

  function _siteRole(site) {
    if (!bmpState.region || !BMP_REGION_SITES[bmpState.region]) return 'inactive';
    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs.primary.indexOf(site) !== -1) return 'primary';
    if (rs.ref.indexOf(site)     !== -1) return 'ref';
    if (rs.alt.indexOf(site)     !== -1) return 'alt';
    return 'inactive';
  }

  // SVG uses data-site attr + delegated events (avoids inline handler quoting issues)
  function _siteG(name, sx, sy, innerHtml) {
    return '<g class="bmp-site-g" data-site="' + _esc(name) + '" style="cursor:pointer">'
      + innerHtml
      + '</g>';
  }

  function _buildSVG(patientView) {
    const mc = _mc();
    const region = (bmpState.region && BMP_REGION_SITES[bmpState.region])
      ? BMP_REGION_SITES[bmpState.region] : { primary:[], ref:[], alt:[] };
    const pp = region.primary, rp = region.ref, ap = region.alt;
    const sp = [];
    const s = function(x) { sp.push(x); };
    const z = Number(bmpState.zoom || 1);
    const panX = Number(bmpState.panX || 0);
    const panY = Number(bmpState.panY || 0);
    const zSafe = Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1;
    const panXS = Number.isFinite(panX) ? panX : 0;
    const panYS = Number.isFinite(panY) ? panY : 0;
    s('<svg id="bmp-svg" class="bmp-svg" viewBox="0 0 300 310" width="100%" height="420"'
      + ' xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;max-width:520px">');
    s('<defs><filter id="bmp-glow" x="-50%" y="-50%" width="200%" height="200%">'
      + '<feGaussianBlur stdDeviation="3" result="blur"/>'
      + '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter>'
      + '<radialGradient id="bmp-efield" cx="50%" cy="50%" r="50%">'
      + '<stop offset="0%" stop-color="rgba(255,107,157,0.7)"/>'
      + '<stop offset="30%" stop-color="rgba(255,139,71,0.45)"/>'
      + '<stop offset="55%" stop-color="rgba(255,181,71,0.22)"/>'
      + '<stop offset="75%" stop-color="rgba(74,222,128,0.1)"/>'
      + '<stop offset="100%" stop-color="rgba(0,212,188,0)"/>'
      + '</radialGradient>'
      + '</defs>');
    s('<g id="bmp-vp" transform="translate(' + panXS + ' ' + panYS + ') scale(' + zSafe + ')">');
    // Head outline — made visibly stronger (0.25 → 0.55 stroke) so clinicians can
    // actually see the head shape. Matches the new brain-map-svg.js helper.
    s('<ellipse cx="150" cy="155" rx="128" ry="148" fill="#0f1623"'
      + ' stroke="rgba(255,255,255,0.55)" stroke-width="2"/>');
    // Nose triangle pointing up at the nasion (instead of a tiny chevron)
    s('<polygon points="150,4 140,22 160,22" fill="rgba(255,255,255,0.12)"'
      + ' stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linejoin="round"/>');
    // Ear bumps (ellipses) on both sides — clearer front/back orientation
    s('<ellipse cx="16" cy="155" rx="8" ry="22" fill="rgba(255,255,255,0.08)"'
      + ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>');
    s('<ellipse cx="284" cy="155" rx="8" ry="22" fill="rgba(255,255,255,0.08)"'
      + ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>');
    // Midline + coronal guides
    s('<line x1="150" y1="10" x2="150" y2="300" stroke="rgba(255,255,255,0.08)"'
      + ' stroke-width="0.6" stroke-dasharray="2 4"/>');
    s('<line x1="22" y1="155" x2="278" y2="155" stroke="rgba(255,255,255,0.08)"'
      + ' stroke-width="0.6" stroke-dasharray="2 4"/>');
    // L/R hemisphere labels just outside the head
    s('<text x="32" y="158" text-anchor="middle" font-size="10"'
      + ' fill="rgba(255,255,255,0.35)" font-family="system-ui">L</text>');
    s('<text x="268" y="158" text-anchor="middle" font-size="10"'
      + ' fill="rgba(255,255,255,0.35)" font-family="system-ui">R</text>');
    if (patientView) {
      pp.forEach(function(site) {
        const pos = BMP_SITES[site]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        const anat = BMP_ANATOMY[site] || site;
        const lbl  = anat.length > 22 ? anat.slice(0, 22) + '...' : anat;
        s(_siteG(site, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="32" fill="' + mc + '" opacity="0.18"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="22" fill="' + mc + '" opacity="0.28"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="' + mc + '" opacity="0.55"/>'
          + '<text x="' + sx + '" y="' + (sy + 46) + '" text-anchor="middle" font-size="9"'
          + ' fill="rgba(255,255,255,0.7)" font-family="system-ui">' + _esc(lbl) + '</text>'
        ));
      });
    } else {
      const showInactiveLabels = (bmpState.labelMode === 'full') || (bmpState.labelMode === 'smart' && (bmpState.zoom || 1) >= 1.35);
      Object.keys(BMP_SITES).forEach(function(name) {
        if (_siteRole(name) !== 'inactive') return;
        const pos = BMP_SITES[name];
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="7" fill="rgba(148,163,184,0.10)"'
          + ' stroke="rgba(148,163,184,0.24)" stroke-width="0.9"/>'
          + (showInactiveLabels
            ? ('<text x="' + (sx + 9) + '" y="' + (sy + 4) + '" font-size="8"'
              + ' fill="rgba(148,163,184,0.35)" font-family="system-ui">' + _esc(name) + '</text>')
            : '')
        ));
      });
      ap.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="rgba(74,158,255,0.15)"'
          + ' stroke="#4a9eff" stroke-width="1" stroke-dasharray="3 2"/>'
          + '<text x="' + (sx + 11) + '" y="' + (sy + 4) + '" font-size="9"'
          + ' fill="rgba(74,158,255,0.7)" font-family="system-ui">' + _esc(name) + '</text>'
        ));
      });
      rp.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="#ffb547" opacity="0.12"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="#ffb547" opacity="0.55"'
          + ' filter="url(#bmp-glow)"/>'
          + '<text x="' + (sx + 12) + '" y="' + (sy + 4) + '" font-size="9" fill="#ffb547"'
          + ' font-weight="600" font-family="system-ui">' + _esc(name)
          + (bmpState.modality === 'tDCS' ? ' \u2212' : '') + '</text>'
        ));
      });
      pp.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        const isTDCS = (bmpState.modality === 'tDCS');
        const isNFB  = (bmpState.modality === 'Neurofeedback');
        const isTMS  = (['TMS/rTMS','iTBS','cTBS','Deep TMS'].indexOf(bmpState.modality) !== -1);
        // Pre-baked E-field overlay (radial gradient) — fires on the first
        // primary site whenever the toggle is on. No data dep; purely visual
        // cue so clinicians see where the peak E-field lobe sits.
        if (bmpState.eFieldOverlay) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="56" fill="url(#bmp-efield)"'
            + ' opacity="0.85" pointer-events="none"/>');
        }
        s('<circle cx="' + sx + '" cy="' + sy + '" r="18" fill="' + mc + '" opacity="0.09"/>');
        s('<circle cx="' + sx + '" cy="' + sy + '" r="14" fill="' + mc + '" opacity="0.13"/>');
        if (isTMS) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="18" fill="none" stroke="' + mc + '"'
            + ' stroke-width="3" stroke-dasharray="2 3" opacity="0.35"/>');
          s('<line x1="' + sx + '" y1="' + (sy - 18) + '" x2="' + sx + '" y2="' + (sy - 25) + '"'
            + ' stroke="' + mc + '" stroke-width="2" opacity="0.5"/>');
        }
        if (isNFB) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="16" fill="none" stroke="' + mc + '"'
            + ' stroke-width="1.5" stroke-dasharray="4 3" opacity="0.4"/>');
          s('<circle cx="' + sx + '" cy="' + sy + '" r="22" fill="none" stroke="' + mc + '"'
            + ' stroke-width="1" stroke-dasharray="6 4" opacity="0.25"/>');
        }
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="' + mc + '" opacity="0.85"'
          + ' filter="url(#bmp-glow)"/>'
          + '<text x="' + (sx + 11) + '" y="' + (sy + 3) + '" font-size="8" fill="' + mc + '"'
          + ' font-weight="700" font-family="system-ui">' + _esc(name)
          + (isTDCS ? ' +' : '') + '</text>'
        ));
      });
    }
    s('</g></svg>');
    return sp.join('');
  }

  // Attach delegated events to the SVG container after it is rendered
  function _attachSVGEvents(container) {
    if (!container) return;
    container.addEventListener('click', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteClick(g.dataset.site);
    });
    container.addEventListener('mouseover', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteHover(g.dataset.site, true, e);
    });
    container.addEventListener('mouseout', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteHover(g.dataset.site, false, e);
    });
  }

  function _buildDetailPanel(site) {
    if (!site) {
      return '<div class="bmp-detail-placeholder">'
        + '<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:40px 0">'
        + 'Click any electrode on the map<br>or load a protocol to see details'
        + '</div></div>';
    }
    const anat = BMP_ANATOMY[site] || site;
    const mni  = BMP_MNI[site]  || '\u2014';
    const ba   = BMP_BA[site]   || '\u2014';
    const condArr = BMP_CONDITIONS[site] || [];
    const condsHtml = condArr.map(function(c) {
      return '<span class="bmp-cond-chip">' + _esc(c) + '</span>';
    }).join('');
    const placement = BMP_PLACEMENT[site] || 'See 10-20 standard for placement.';
    let siteRegion = '';
    const rkeys = Object.keys(BMP_REGION_SITES);
    for (let ri = 0; ri < rkeys.length; ri++) {
      const rv = BMP_REGION_SITES[rkeys[ri]];
      if (rv.primary.indexOf(site) !== -1 || rv.ref.indexOf(site) !== -1 || rv.alt.indexOf(site) !== -1) {
        siteRegion = rkeys[ri]; break;
      }
    }
    const altSites = (siteRegion && BMP_REGION_SITES[siteRegion]) ? BMP_REGION_SITES[siteRegion].alt : [];
    const linkedProtos = [];
    const _linkSeen = new Set();
    _catalog.forEach(function(p) {
      if (linkedProtos.length >= 8 || _linkSeen.has(p.id)) return;
      if (p.anode === site || p.cathode === site) { linkedProtos.push(p.id); _linkSeen.add(p.id); }
    });
    if (linkedProtos.length < 8) {
      Object.keys(BMP_PROTO_MAP).forEach(function(pid) {
        if (linkedProtos.length >= 8 || _linkSeen.has(pid)) return;
        const rs = BMP_REGION_SITES[BMP_PROTO_MAP[pid].region];
        if (rs && (rs.primary.indexOf(site) !== -1 || rs.ref.indexOf(site) !== -1)) {
          linkedProtos.push(pid); _linkSeen.add(pid);
        }
      });
    }
    let h = '<div class="bmp-detail-card">';
    const activeCat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    if (activeCat) {
      const evC = { A:'#00d4bc', B:'#4a9eff', C:'#ffb547', D:'var(--text-tertiary)', E:'var(--text-tertiary)' };
      const evColor = evC[activeCat.evidenceGrade] || 'var(--text-tertiary)';
      h += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);line-height:1.3">' + _esc(activeCat.name) + '</div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px">';
      h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;border:1px solid ' + evColor + '44;color:' + evColor + '">Ev. ' + _esc(activeCat.evidenceGrade) + '</span>';
      if (activeCat.modality) h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">' + _esc(activeCat.modality) + '</span>';
      if (activeCat.targetRegion) h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">◎ ' + _esc(activeCat.targetRegion) + '</span>';
      h += '</div>';
      if (activeCat.summary) {
        h += '<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">' + _esc(activeCat.summary.slice(0, 220)) + (activeCat.summary.length > 220 ? '\u2026' : '') + '</div>';
      }
      // Heuristic-target caveat: only curated entries carry exact anchors.
      if (activeCat.source !== 'curated') {
        h += '<div role="note" style="display:flex;gap:6px;align-items:flex-start;font-size:10.5px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:6px 8px;margin-bottom:10px;line-height:1.4">'
          + '<span aria-hidden="true" style="flex-shrink:0">⚠</span>'
          + '<span>Target electrode inferred from protocol text. Verify anatomical placement before prescribing.</span>'
          + '</div>';
      }
      h += '<div style="height:1px;background:var(--border);margin:4px 0 10px"></div>';
    }
    h += '<div class="bmp-detail-site-name">' + _esc(site) + '</div>';
    h += '<div class="bmp-detail-region">' + _esc(anat) + '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    if (mni !== '\u2014') h += '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">MNI: ' + _esc(mni) + '</span>';
    if (ba  !== '\u2014') h += '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">' + _esc(ba) + '</span>';
    h += '</div>';
    if (condsHtml) {
      h += '<div class="bmp-detail-section-label">Associated Conditions</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px">' + condsHtml + '</div>';
    }
    h += '<div class="bmp-detail-section-label">Placement Guidance</div>';
    h += '<div class="bmp-placement-text">' + _esc(placement) + '</div>';
    if (altSites.length) {
      h += '<div class="bmp-detail-section-label">Alternate Targets</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
      altSites.forEach(function(s2) {
        h += '<button class="bmp-alt-btn" data-altsite="' + _esc(s2) + '">'
          + _esc(s2) + '</button>';
      });
      h += '</div>';
    }
    if (linkedProtos.length) {
      h += '<div class="bmp-detail-section-label">Linked Protocols</div>';
      h += '<div style="display:flex;flex-direction:column;gap:5px">';
      linkedProtos.forEach(function(pid) {
        h += '<button class="bmp-proto-link" data-proto="' + _esc(pid) + '">'
          + _esc(BMP_PROTO_LABELS[pid] || (_catalogById[pid] && _catalogById[pid].name) || pid) + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function _updateMap() {
    // If compare is on, rebuild the whole canvas-wrap (cheap; SVG is small)
    // so both panels share the current state.
    if (bmpState.compare) {
      const wrap = document.querySelector('.bm-canvas-wrap');
      if (wrap) {
        wrap.innerHTML = _buildCanvasPanels();
        _attachSVGEvents(document.getElementById('bmp-svg-container'));
      }
      return;
    }
    const ctr = document.getElementById('bmp-svg-container');
    if (!ctr) return;
    ctr.innerHTML = _buildSVG(bmpState.view === 'patient');
    _attachSVGEvents(ctr);
    // Refresh the "ACTIVE · patient · region" label.
    const lbl = document.querySelector('.bm-panel-label');
    if (lbl) {
      const patientLabel = bmpState.patientId || 'Demo patient';
      const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
      lbl.innerHTML = 'ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel);
    }
  }
  function _updateRight() {
    const right = document.getElementById('bm-right');
    if (!right) return;
    right.innerHTML = _buildParamsPanel();
    _wireRightPanel();
  }
  function _updateAtlas() {
    const left = document.getElementById('bm-left');
    if (!left) return;
    left.innerHTML = _buildAtlasRail();
    _wireAtlas();
  }

  function _updateDetail() {
    const dp = document.getElementById('bmp-detail-panel');
    if (dp) dp.innerHTML = _buildDetailPanel(bmpState.selectedSite);
  }

  function _updateParams() {
    const pp = document.getElementById('bmp-params-section');
    if (pp) pp.style.display = (bmpState.modality || bmpState.protoId) ? '' : 'none';
    // Re-render the right panel so metrics + safety + evidence reflect
    // latest state (intensity change → density recomputes instantly).
    _updateRight();
  }

  function _loadProtocol(pid) {
    const pm = BMP_PROTO_MAP[pid];
    const cat = _catalogById[pid];
    if (!pm && !cat) return;

    bmpState.protoId = pid;
    if (pm) {
      bmpState.region    = pm.region;
      bmpState.modality  = pm.modality;
      bmpState.lat       = pm.lat;
      bmpState.freq      = pm.freq;
      bmpState.intensity = pm.intensity;
      bmpState.pulses    = pm.pulses;
      bmpState.sessions  = pm.sessions;
      bmpState.duration  = pm.duration || bmpState.duration;
    } else {
      bmpState.modality = cat.modality || bmpState.modality;
      bmpState.region   = cat.targetRegion
        || (cat.anode ? _inferRegionFromSite(cat.anode) : '')
        || bmpState.region;
      bmpState.lat      = cat.targetRegion && /-R$/.test(cat.targetRegion) ? 'right'
                       : cat.targetRegion && /-B$/.test(cat.targetRegion) ? 'bilateral'
                       : 'left';
      const P = cat.parameters || {};
      bmpState.freq      = P.frequency_hz != null ? String(P.frequency_hz) : '';
      bmpState.intensity = P.intensity_pct_rmt != null ? (String(P.intensity_pct_rmt) + '% MT')
                         : P.intensity != null ? String(P.intensity) : '';
      bmpState.pulses    = P.pulses_per_session != null ? String(P.pulses_per_session) : '';
      bmpState.duration  = P.session_duration_min != null ? String(P.session_duration_min) : bmpState.duration;
      bmpState.sessions  = P.sessions_total != null ? String(P.sessions_total)
                         : P.total_course != null ? String(P.total_course) : '';
    }

    const modSel = document.getElementById('bmp-mod-sel');
    if (modSel) modSel.value = bmpState.modality;
    const regSel = document.getElementById('bmp-region-sel');
    if (regSel) regSel.value = bmpState.region || '';
    document.querySelectorAll('.bmp-lat-btn').forEach(function(b) {
      b.classList.toggle('bmp-lat-active', b.dataset.lat === bmpState.lat);
    });
    ['freq','intensity','pulses','duration','sessions'].forEach(function(k) {
      const inp = document.getElementById('bmp-param-' + k);
      if (inp) inp.value = bmpState[k] || '';
    });
    const ps = document.getElementById('bmp-proto-sel');
    if (ps) ps.value = pid;

    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs && rs.primary.length) bmpState.selectedSite = rs.primary[0];
    else if (cat && cat.anode)   bmpState.selectedSite = cat.anode;

    _updateMap(); _updateDetail(); _updateParams();
    _persist();
  }

  const _condSet = {};
  _libConditions.forEach(function(c) { if (c && c.id) _condSet[c.id] = c.label || c.id; });
  (conds || []).forEach(function(c) {
    const id = c.id || c.slug || c.name;
    if (id && !_condSet[id]) _condSet[id] = c.label || c.name || id;
  });
  const _condEntries = Object.keys(_condSet).map(function(id) { return { id: id, label: _condSet[id] }; })
    .sort(function(a, b) { return a.label.localeCompare(b.label); });

  const condOptions = _condEntries.map(function(c) {
    return '<option value="' + _esc(c.id) + '">' + _esc(c.label) + '</option>';
  }).join('');

  function _filteredCatalog() {
    const q    = (_bmpProtoFilter.q || '').toLowerCase();
    const cond = _bmpProtoFilter.cond;
    const ev   = _bmpProtoFilter.ev;
    const site = _bmpProtoFilter.site;
    return _catalog.filter(function(p) {
      if (cond && p.conditionId !== cond) return false;
      if (ev   && (p.evidenceGrade || '?') !== ev) return false;
      if (site && p.anode !== site && p.cathode !== site) return false;
      if (q) {
        const blob = (p.name + ' ' + (p.summary || '') + ' ' + (p.conditionId || '')).toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function _renderProtoSelect() {
    const sel = document.getElementById('bmp-proto-sel');
    if (!sel) return;
    const list = _filteredCatalog();
    const capped = list.slice(0, 200);
    const opts = ['<option value="">\u2014 select protocol \u2014</option>']
      .concat(capped.map(function(p) {
        const ev = p.evidenceGrade && p.evidenceGrade !== '?' ? ' [' + p.evidenceGrade + ']' : '';
        return '<option value="' + _esc(p.id) + '">' + _esc(p.name + ev) + '</option>';
      }));
    sel.innerHTML = opts.join('');
    if (bmpState.protoId && list.some(function(p) { return p.id === bmpState.protoId; })) {
      sel.value = bmpState.protoId;
    }
    const cntEl = document.getElementById('bmp-proto-count');
    if (cntEl) cntEl.textContent = list.length + ' protocol' + (list.length === 1 ? '' : 's');
  }

  const regionOptions = Object.keys(BMP_REGION_SITES).map(function(k) {
    const pretty = k.replace(/[-_]/g, ' ');
    return '<option value="' + _esc(k) + '">' + _esc(pretty) + '</option>';
  }).join('');

  const modalityOptions = ['TMS/rTMS','iTBS','cTBS','Deep TMS','tDCS','tACS',
    'Neurofeedback','taVNS','CES','PBM','TPS'].map(function(m) {
    return '<option value="' + _esc(m) + '"'
      + (m === bmpState.modality ? ' selected' : '') + '>' + _esc(m) + '</option>';
  }).join('');

  const latVal = bmpState.lat;
  function _latBtn(v, lbl) {
    return '<button class="bmp-lat-btn' + (latVal === v ? ' bmp-lat-active' : '') + '"'
      + ' data-lat="' + v + '">'
      + lbl + '</button>';
  }

  // ── v2 render helpers (bm-* classes, clinician-grade layout) ───────────
  // Build the left atlas rail: search + condition chips + grouped regions.
  function _buildAtlasRail() {
    const groups = { 'Prefrontal': [], 'Motor / Sensory': [], 'Parietal / Temporal': [], 'Occipital': [], 'Other': [] };
    Object.keys(BMP_REGION_SITES).forEach(function(id) {
      groups[_regionGroup(id)].push(id);
    });
    let h = '<div class="bm-left-head">'
      + '<div style="position:relative">'
      + '<input id="bm-region-search" class="bm-search" placeholder="Region, function, condition\u2026" />'
      + '</div>'
      + '<div id="bm-cond-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">';
    // condition chips — "All" + conditions from the unified set
    const allActive = !_bmpProtoFilter.cond ? ' bm-chip-active' : '';
    h += '<span class="bm-chip' + allActive + '" data-cond="">All</span>';
    _condEntries.slice(0, 10).forEach(function(c) {
      const active = _bmpProtoFilter.cond === c.id ? ' bm-chip-active' : '';
      h += '<span class="bm-chip' + active + '" data-cond="' + _esc(c.id) + '">'
        + _esc(c.label) + '</span>';
    });
    h += '</div></div><div class="bm-left-body" id="bm-left-body">';
    Object.keys(groups).forEach(function(g) {
      if (!groups[g].length) return;
      h += '<div class="bm-region-group-title">' + _esc(g) + '</div>';
      groups[g].forEach(function(id) {
        const rs = BMP_REGION_SITES[id];
        const primary = (rs.primary && rs.primary[0]) || '';
        const ba = BMP_BA[primary] || '';
        const sites = (rs.primary || []).join(' · ');
        const condArr = BMP_CONDITIONS[primary] || [];
        const active = bmpState.region === id ? ' active' : '';
        h += '<div class="bm-region' + active + '" data-region-id="' + _esc(id) + '"'
          + ' data-region-q="' + _esc((_regionLabel(id) + ' ' + _regionFunction(id) + ' ' + sites).toLowerCase()) + '">'
          + '<div class="bm-region-dot"></div>'
          + '<div class="bm-region-body">'
          + '<div class="bm-region-name">' + _esc(_regionLabel(id)) + '</div>'
          + '<div class="bm-region-sites">' + _esc(sites) + (ba ? ' \u00b7 ' + _esc(ba) : '') + '</div>'
          + '<div class="bm-region-fn">' + _esc(_regionFunction(id)) + '</div>';
        if (condArr.length) {
          h += '<div class="bm-region-cond">';
          condArr.slice(0, 4).forEach(function(c) { h += '<span>' + _esc(c) + '</span>'; });
          h += '</div>';
        }
        h += '</div></div>';
      });
    });
    h += '</div>';
    return h;
  }

  // Right-panel parameter groups fed by active catalog entry + BMP_PROTO_MAP.
  function _buildParamsPanel() {
    const cat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    const rs = BMP_REGION_SITES[bmpState.region] || { primary:[], ref:[], alt:[] };
    const anode   = bmpState.selectedSite || (rs.primary && rs.primary[0]) || (cat && cat.anode) || '—';
    const cathode = (rs.ref && rs.ref[0]) || (cat && cat.cathode) || '—';
    const intensity_mA = _parseIntensityMA(bmpState.intensity);
    const density = _computeDensity(intensity_mA);
    const dStatus = _densityStatus(density);
    const peakE = (0.4 + Math.min(intensity_mA, 4) * 0.06).toFixed(2);
    const focal = (0.55 + Math.min(intensity_mA, 4) * 0.04).toFixed(2);
    const ev = _evidenceForActive();

    // Determine which groups are visible per tab. Montage → hide safety &
    // evidence, widen electrodes + stim. Research → emphasise evidence.
    const tab = bmpState.tab;
    const showElectrodes = tab !== 'research' ? true : true;
    const showStim = tab !== 'research';
    const showSafety = tab === 'clinical';
    const showEvidence = (tab === 'clinical' || tab === 'research');

    let h = '<div class="bm-right-head">'
      + '<div style="display:flex;gap:10px;align-items:center">'
      + '<div class="bm-metric" style="flex:1;margin:0;padding:8px 10px">'
      + '<div class="bm-metric-lbl">Peak E-field</div>'
      + '<div class="bm-metric-num">' + _esc(peakE) + '<span class="unit">V/m</span></div>'
      + '</div>'
      + '<div class="bm-metric" style="flex:1;margin:0;padding:8px 10px">'
      + '<div class="bm-metric-lbl">Focality</div>'
      + '<div class="bm-metric-num">' + _esc(focal) + '<span class="unit">/1.0</span></div>'
      + '</div>'
      + '</div></div>';

    h += '<div class="bm-right-body" id="bm-right-body">';

    if (showElectrodes) {
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">01</span>Electrodes</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        + '<div style="padding:8px;background:rgba(255,107,157,0.06);border:1px solid rgba(255,107,157,0.18);border-radius:6px">'
        + '<div style="font-size:9px;color:var(--rose);font-weight:700;letter-spacing:0.04em;font-family:var(--font-mono)">ANODE +</div>'
        + '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:4px">' + _esc(anode) + '</div>'
        + '<div style="font-size:9.5px;color:var(--text-tertiary);margin-top:2px">35\u00d735 mm \u00b7 saline <span style="opacity:0.6">(example)</span></div>'
        + '<div style="font-size:9.5px;color:var(--teal);margin-top:2px">\u03a9 4.2 k\u03a9 <span style="opacity:0.6">(example)</span></div>'
        + '</div>'
        + '<div style="padding:8px;background:rgba(74,158,255,0.06);border:1px solid rgba(74,158,255,0.18);border-radius:6px">'
        + '<div style="font-size:9px;color:var(--blue);font-weight:700;letter-spacing:0.04em;font-family:var(--font-mono)">CATHODE \u2212</div>'
        + '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:4px">' + _esc(cathode) + '</div>'
        + '<div style="font-size:9.5px;color:var(--text-tertiary);margin-top:2px">35\u00d735 mm \u00b7 saline <span style="opacity:0.6">(example)</span></div>'
        + '<div style="font-size:9.5px;color:var(--teal);margin-top:2px">\u03a9 3.8 k\u03a9 <span style="opacity:0.6">(example)</span></div>'
        + '</div>'
        + '</div>'
        + '<div class="bm-polarity">'
        + '<button class="' + (bmpState.placeMode === 'anode' ? 'active anode' : '') + '" data-placemode="anode">\u25cf Anode mode</button>'
        + '<button class="' + (bmpState.placeMode === 'cathode' ? 'active cathode' : '') + '" data-placemode="cathode">\u25cb Cathode mode</button>'
        + '</div>';
      if (cat && cat.source !== 'curated') {
        h += '<div role="note" style="display:flex;gap:6px;align-items:flex-start;font-size:10.5px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:6px 8px;margin-top:8px;line-height:1.4">'
          + '<span aria-hidden="true" style="flex-shrink:0">\u26a0</span>'
          + '<span>Target electrode inferred from protocol text. Verify anatomical placement before prescribing.</span>'
          + '</div>';
      }
      h += '<div style="margin-top:8px;font-size:10px;color:var(--text-tertiary);line-height:1.45">'
        + 'Click any 10-20 site on the map to place the <strong>' + _esc(bmpState.placeMode) + '</strong>. '
        + 'Region: <strong style="color:var(--text-primary)">' + _esc(_regionLabel(bmpState.region) || '—') + '</strong>.'
        + '</div>';
      h += '</div>';
    }

    if (showStim) {
      const intensityPct = Math.min(100, Math.max(0, (intensity_mA / 4) * 100));
      const durationN = Number(bmpState.duration || 0) || 0;
      const durationPct = Math.min(100, Math.max(0, (durationN / 45) * 100));
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">02</span>Stimulation</div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Current</span>'
        + '<span class="bm-param-val">' + (intensity_mA ? intensity_mA.toFixed(1) + ' mA' : '—') + '</span></div>'
        + '<div class="bm-slider-wrap">'
        + '<input id="bm-slider-current" type="range" min="0" max="4" step="0.1" value="' + intensity_mA + '" class="bm-slider-input" />'
        + '<div class="bm-slider-ticks"><span>0</span><span>1</span><span>2</span><span>3</span><span>4 mA</span></div>'
        + '</div>'
        + '<div class="bm-param-row" style="margin-top:10px"><span class="bm-param-label">Duration</span>'
        + '<span class="bm-param-val">' + (durationN ? durationN + ' min' : '—') + '</span></div>'
        + '<div class="bm-slider-wrap">'
        + '<input id="bm-slider-duration" type="range" min="0" max="45" step="1" value="' + durationN + '" class="bm-slider-input" />'
        + '<div class="bm-slider-ticks"><span>5</span><span>15</span><span>30</span><span>45 min</span></div>'
        + '</div>'
        + '<div class="bm-param-row" style="margin-top:10px"><span class="bm-param-label">Ramp</span>'
        + '<span class="bm-param-val">30 s / 30 s</span></div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Waveform</span>'
        + '<select id="bm-waveform" class="form-select" style="font-size:10.5px;padding:2px 6px;max-width:130px">'
        + ['Anodal DC','Cathodal DC','Biphasic'].map(function(w) {
            return '<option value="' + _esc(w) + '"' + (bmpState.waveform === w ? ' selected' : '') + '>' + _esc(w) + '</option>';
          }).join('')
        + '</select></div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Blinding</span>'
        + '<span class="bm-param-val" style="color:var(--text-tertiary)">Open (clinical)</span></div>';
      h += '</div>';
    }

    if (showSafety) {
      h += '<div class="bm-param-group" id="bm-safety-group">'
        + '<div class="bm-param-group-title"><span class="num">03</span>Safety &amp; contraindications</div>';
      const densityText = density ? density.toFixed(3) + ' mA/cm\u00b2' : '—';
      if (dStatus === 'ok') {
        h += '<div class="bm-warn ok">'
          + '<span class="bm-warn-ico">\u2713</span>'
          + '<div><div class="bm-warn-title">Within safety envelope</div>'
          + '<div class="bm-warn-body">Current density ' + _esc(densityText) + ' \u00b7 below 0.08 mA/cm\u00b2 limit \u00b7 NIBS guidelines Antal 2017.</div></div>'
          + '</div>';
      } else if (dStatus === 'amber') {
        h += '<div class="bm-warn amb">'
          + '<span class="bm-warn-ico">\u25d0</span>'
          + '<div><div class="bm-warn-title">Approaching density limit</div>'
          + '<div class="bm-warn-body">Current density ' + _esc(densityText) + ' \u00b7 between 0.08 and 0.12 mA/cm\u00b2 \u00b7 monitor scalp response.</div></div>'
          + '</div>';
      } else {
        h += '<div class="bm-warn err">'
          + '<span class="bm-warn-ico">\u26a0</span>'
          + '<div><div class="bm-warn-title">Current density exceeds guideline</div>'
          + '<div class="bm-warn-body">Computed ' + _esc(densityText) + ' \u00b7 above 0.12 mA/cm\u00b2 \u00b7 reduce intensity or enlarge pad.</div></div>'
          + '</div>';
      }
      h += '<div class="bm-warn amb">'
        + '<span class="bm-warn-ico">\u25d0</span>'
        + '<div><div class="bm-warn-title">Scalp sensitivity check <span style="opacity:0.6;font-weight:400">(example)</span></div>'
        + '<div class="bm-warn-body">Recommend saline refresh + skin inspection pre-session.</div></div>'
        + '</div>';
      h += '</div>';
    }

    if (showEvidence) {
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">04</span>Evidence \u00b7 this montage</div>';
      if (!ev.length) {
        h += '<div style="font-size:11px;color:var(--text-tertiary);padding:8px 0">'
          + 'Load a protocol to see evidence for this montage.</div>';
      } else {
        ev.forEach(function(r) {
          const gClass = /^A/i.test(r.grade) ? 'a' : /^B/i.test(r.grade) ? 'b' : /^C/i.test(r.grade) ? 'c' : '';
          h += '<div class="bm-evidence" data-proto="' + _esc(r.id) + '">'
            + '<div class="bm-evidence-header">'
            + '<div class="bm-evidence-title">' + _esc(r.title) + '</div>'
            + '<span class="bm-evidence-grade ' + gClass + '">' + _esc(r.grade) + '</span>'
            + '</div>';
          if (r.meta) h += '<div class="bm-evidence-meta">' + _esc(r.meta) + '</div>';
          if (r.summary) {
            const s = r.summary.slice(0, 160) + (r.summary.length > 160 ? '\u2026' : '');
            h += '<div class="bm-evidence-delta">' + _esc(s) + '</div>';
          }
          h += '</div>';
        });
      }
      if (bmpState.tab === 'research' && cat) {
        h += '<div style="margin-top:10px;padding:10px;background:var(--bg-surface);border:1px dashed var(--border);border-radius:6px;font-size:10.5px;color:var(--text-secondary);line-height:1.5">'
          + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px">Raw catalog entry</div>'
          + 'id: ' + _esc(cat.id) + '<br>'
          + 'source: ' + _esc(cat.source) + '<br>'
          + 'targetRegion: ' + _esc(cat.targetRegion || '') + '<br>'
          + 'anode: ' + _esc(cat.anode || '') + ' \u00b7 cathode: ' + _esc(cat.cathode || '')
          + '</div>';
      }
      h += '</div>';
    }

    // Active-protocol detail re-used from _buildDetailPanel (kept for site-level
    // info: MNI, BA, placement guidance, linked protocols, alt sites).
    h += '<div class="bm-param-group">'
      + '<div class="bm-param-group-title"><span class="num">\u2699</span>Site detail</div>'
      + '<div id="bmp-detail-panel" class="bm-site-detail">' + _buildDetailPanel(bmpState.selectedSite || '') + '</div>'
      + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpViewDetail()">View Protocol Detail</button>'
      + '<button class="btn btn-sm" style="font-size:11px;border-color:var(--teal);color:var(--teal)" onclick="window._bmpPrescribeProto(window._bmpState && window._bmpState.protoId)">Prescribe This Protocol</button>'
      + '</div>'
      + '</div>';

    h += '</div>'; // /.bm-right-body

    return h;
  }

  // Advanced filters expander — keeps the old dropdowns reachable so nothing
  // is deleted; clinicians can still filter by condition / evidence / search
  // from the canvas toolbar row.
  function _buildAdvancedFilters() {
    return '<details class="bm-adv-filters">'
      + '<summary>Advanced filters</summary>'
      + '<div class="bm-adv-filters-body">'
      + '<input id="bmp-proto-q" class="form-input bm-adv-input" type="text" placeholder="Search protocols\u2026"'
        + ' value="' + _esc(_bmpProtoFilter.q || '') + '"'
        + ' oninput="window._bmpSetProtoFilter(\'q\', this.value)" />'
      + '<select id="bmp-proto-ev" class="form-select bm-adv-input" onchange="window._bmpSetProtoFilter(\'ev\', this.value)">'
      + '<option value="">All evidence</option>'
      + '<option value="A"' + (_bmpProtoFilter.ev === 'A' ? ' selected' : '') + '>Grade A</option>'
      + '<option value="B"' + (_bmpProtoFilter.ev === 'B' ? ' selected' : '') + '>Grade B</option>'
      + '<option value="C"' + (_bmpProtoFilter.ev === 'C' ? ' selected' : '') + '>Grade C</option>'
      + '</select>'
      + '<select id="bmp-cond-sel" class="form-select bm-adv-input" onchange="window._bmpSetProtoFilter(\'cond\', this.value)">'
      + '<option value="">All conditions</option>' + condOptions
      + '</select>'
      + '<select id="bmp-mod-sel" class="form-select bm-adv-input" onchange="window._bmpSetModality(this.value)">'
      + modalityOptions
      + '</select>'
      + '<select id="bmp-region-sel" class="form-select bm-adv-input" onchange="window._bmpSetRegion(this.value)">'
      + '<option value="">Select region</option>' + regionOptions
      + '</select>'
      + '<div class="bm-adv-overflow">'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpCopySummary()">Copy summary</button>'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpSavePreset()">Save preset</button>'
      + '<select id="bmp-preset-sel" class="form-select bm-adv-input" onchange="window._bmpLoadPreset(this.value)">'
      + '<option value="">Load preset</option>'
      + '</select>'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpReset()">Reset planner</button>'
      + '</div>'
      + '<div class="bm-adv-lat">'
      + '<div class="bmp-lat-toggle">' + _latBtn('left','Left') + _latBtn('bilateral','Bilateral') + _latBtn('right','Right') + '</div>'
      + '</div>'
      + '<div id="bmp-params-section" class="bm-adv-params" style="display:none">'
      + '<label>Freq (Hz)<input id="bmp-param-freq" class="form-input" type="text"></label>'
      + '<label>Intensity<input id="bmp-param-intensity" class="form-input" type="text"></label>'
      + '<label>Pulses<input id="bmp-param-pulses" class="form-input" type="text"></label>'
      + '<label>Duration (min)<input id="bmp-param-duration" class="form-input" type="text"></label>'
      + '<label>Sessions<input id="bmp-param-sessions" class="form-input" type="text"></label>'
      + '<label style="grid-column:1 / -1">Notes<textarea id="bmp-param-notes" class="form-input" rows="2"></textarea></label>'
      + '</div>'
      + '</div>'
      + '</details>';
  }

  // Main canvas toolbar: view modes + overlay toggles + compare.
  function _buildCanvasToolbar() {
    return '<div class="bm-view-toolbar">'
      + '<div class="bm-view-toggle">'
      + '<button class="active" data-canvas-mode="2d">\u25c9 2D 10-20</button>'
      + '<button disabled data-canvas-mode="3d">\u25ce 3D cortex <span class="bm-soon">Soon</span></button>'
      + '<button disabled data-canvas-mode="inflated">\u25c8 Inflated <span class="bm-soon">Soon</span></button>'
      + '<button disabled data-canvas-mode="slices">\u25a4 Slices <span class="bm-soon">Soon</span></button>'
      + '</div>'
      + '<div style="width:1px;height:20px;background:var(--border)"></div>'
      + '<label class="bm-toggle-row" data-toggle="efield">'
      + '<span class="bm-toggle-pill ' + (bmpState.eFieldOverlay ? 'on' : '') + '"><span></span></span>'
      + 'E-field overlay</label>'
      + '<label class="bm-toggle-row" data-toggle="labels">'
      + '<span class="bm-toggle-pill ' + (bmpState.labelMode !== 'minimal' ? 'on' : '') + '"><span></span></span>'
      + 'Atlas labels</label>'
      + '<div class="bm-map-ctrl" style="margin-left:8px">'
      + '<span class="bmp-map-ctrl-lbl">Find</span>'
      + '<input id="bmp-site-search" class="bmp-map-search" placeholder="F3, Cz, Pz" />'
      + '<button class="btn btn-sm" style="font-size:11px;padding:4px 10px" onclick="window._bmpGoSite()">Go</button>'
      + '</div>'
      + '<div class="bm-map-ctrl">'
      + '<span class="bmp-map-ctrl-lbl">Labels</span>'
      + '<select id="bmp-label-mode" class="form-select" style="font-size:11px;padding:3px 8px" onchange="window._bmpSetLabelMode(this.value)">'
      + '<option value="smart"' + (bmpState.labelMode === 'smart' ? ' selected' : '') + '>Smart</option>'
      + '<option value="full"' + (bmpState.labelMode === 'full' ? ' selected' : '') + '>Full</option>'
      + '<option value="minimal"' + (bmpState.labelMode === 'minimal' ? ' selected' : '') + '>Minimal</option>'
      + '</select>'
      + '</div>'
      + '<div class="bm-map-ctrl">'
      + '<span class="bmp-map-ctrl-lbl">Zoom</span>'
      + '<input id="bmp-zoom" type="range" min="1" max="1.8" step="0.05" value="' + (bmpState.zoom || 1) + '" />'
      + '</div>'
      + '<div style="margin-left:auto;display:flex;gap:6px">'
      + '<button class="btn btn-sm" style="font-size:10.5px" onclick="window._bmpResetView()">\u21ba Reset</button>'
      + '<button class="btn btn-sm ' + (bmpState.compare ? 'btn-primary' : '') + '" style="font-size:10.5px" onclick="window._bmpToggleCompare()">\u21c6 Compare</button>'
      + '</div>'
      + '</div>';
  }

  // Build one or two canvas panels depending on compare mode.
  function _buildCanvasPanels() {
    const patientLabel = bmpState.patientId || 'Demo patient';
    const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
    const main = '<div class="bm-canvas-panel" style="flex:1;width:100%;position:relative">'
      + '<div class="bm-panel-label">ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel) + '</div>'
      + '<div class="bmp-svg-wrap"><div id="bmp-svg-container">' + _buildSVG(bmpState.view === 'patient') + '</div></div>'
      + '</div>';
    if (!bmpState.compare) {
      return '<div class="bm-canvas">' + main + '</div>';
    }
    // Compare mode: second panel renders the first linked protocol sharing
    // the same region, so clinicians can see an alternative montage side by
    // side. No new API — all in-memory catalog.
    let altHtml = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:11px">No comparable montage in catalog.</div>';
    const activeCat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    const alt = _catalog.find(function(p) {
      if (!activeCat) return p.targetRegion === bmpState.region && p.id !== bmpState.protoId;
      return p.targetRegion === activeCat.targetRegion && p.id !== activeCat.id;
    });
    if (alt) {
      altHtml = '<div class="bm-panel-label">COMPARE \u00b7 <strong>' + _esc(alt.name) + '</strong></div>'
        + '<div class="bmp-svg-wrap" style="opacity:0.85"><div id="bmp-svg-container-alt">'
        + _buildSVG(false)
        + '</div></div>';
    }
    const altPanel = '<div class="bm-canvas-panel" style="flex:1;width:100%;position:relative">' + altHtml + '</div>';
    return '<div class="bm-canvas compare">' + main + altPanel + '</div>';
  }

  // Tab strip — clinical / montage / research
  function _buildTabStrip() {
    const tabs = [
      { id:'clinical', num:'01', label:'Clinical planner' },
      { id:'montage',  num:'02', label:'Montage studio' },
      { id:'research', num:'03', label:'Research overlay' },
    ];
    let h = '<div class="bm-tabs-wrap">';
    tabs.forEach(function(t) {
      h += '<button class="bm-tab' + (bmpState.tab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">'
        + '<span class="tab-num">' + t.num + '</span>' + _esc(t.label) + '</button>';
    });
    h += '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;padding-right:4px">'
      + '<span style="font-size:10.5px;color:var(--text-tertiary);font-family:var(--font-mono)">Patient</span>'
      + '<input id="bm-patient-inp" class="form-input" placeholder="Demo patient"'
      + ' value="' + _esc(bmpState.patientId) + '"'
      + ' style="font-size:11px;padding:3px 8px;width:150px" />'
      + '</div></div>';
    return h;
  }

  const hideAtlas = (bmpState.tab === 'montage');

  el.innerHTML =
    _buildTabStrip()
    + '<div class="bm-shell bm-shell-v2' + (hideAtlas ? ' bm-no-left' : '') + '">'
    + (hideAtlas ? '' : ('<aside class="bm-left" id="bm-left">' + _buildAtlasRail() + '</aside>'))
    + '<div class="bm-center">'
    + _buildCanvasToolbar()
    + _buildAdvancedFilters()
    + '<div class="bm-proto-strip">'
      + '<span class="bm-proto-strip-lbl">Protocol</span>'
      + '<select id="bmp-proto-sel" class="form-select" style="flex:1;font-size:12px" onchange="window._bmpLoadProto(this.value)">'
      + '<option value="">\u2014 select protocol \u2014</option>'
      + '</select>'
      + '<span id="bmp-proto-count" style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap">0 protocols</span>'
    + '</div>'
    + '<div class="bm-canvas-wrap">' + _buildCanvasPanels() + '</div>'
    + '<div class="bm-legend-row" style="padding:8px 16px;border-top:1px solid var(--border)">'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:var(--teal)"></span>Primary</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:#ffb547"></span>Reference</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:#4a9eff;opacity:0.6"></span>Alternate</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:rgba(148,163,184,0.3)"></span>Inactive</div>'
    + '</div>'
    + '<div id="bmp-mri-host" class="bmp-mri-host">'
      + (bmpState.mriOverlay ? _buildBMPFocusViewer() : '')
    + '</div>'
    + '</div>'
    + '<aside class="bm-right" id="bm-right">' + _buildParamsPanel() + '</aside>'
    + '</div>'
    + '<div id="bmp-tooltip" class="bmp-tooltip" style="display:none"></div>';

  // Attach SVG events after initial render
  _attachSVGEvents(document.getElementById('bmp-svg-container'));

  // Hydrate UI controls from state
  try {
    const rs = document.getElementById('bmp-region-sel');
    if (rs && bmpState.region) rs.value = bmpState.region;
    const ps = document.getElementById('bmp-proto-sel');
    if (ps && bmpState.protoId) ps.value = bmpState.protoId;
    const modSel = document.getElementById('bmp-mod-sel');
    if (modSel && bmpState.modality) modSel.value = bmpState.modality;
    const vb = el.querySelectorAll('.bmp-view-btn');
    vb.forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    const lt = el.querySelectorAll('.bmp-lat-btn');
    lt.forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    const setVal = (id, v) => { const inp = document.getElementById(id); if (inp) inp.value = v || ''; };
    setVal('bmp-param-freq', bmpState.freq);
    setVal('bmp-param-intensity', bmpState.intensity);
    setVal('bmp-param-pulses', bmpState.pulses);
    setVal('bmp-param-duration', bmpState.duration);
    setVal('bmp-param-sessions', bmpState.sessions);
    setVal('bmp-param-notes', bmpState.notes);
  } catch (_) {}

  _renderProtoSelect();

  _updateParams();
  if (bmpState.selectedSite) { _updateDetail(); }
  _updateMap();

  // Populate presets dropdown
  function _renderPresetSelect() {
    const sel = document.getElementById('bmp-preset-sel');
    if (!sel) return;
    const items = _loadPresets();
    const opts = ['<option value="">\u2014 select \u2014</option>']
      .concat(items.map(p => '<option value="' + _esc(p.id) + '">' + _esc(p.name) + '</option>'));
    sel.innerHTML = opts.join('');
  }
  _renderPresetSelect();

  // ── v2 wiring ───────────────────────────────────────────────────────────
  // These are defined as named `var` so they can be referenced before first
  // call (hoisted) by _updateRight/_updateAtlas.
  function _wireRightPanel() {
    const root = document.getElementById('bm-right');
    if (!root) return;
    // Polarity toggle — anode/cathode placement mode
    root.querySelectorAll('[data-placemode]').forEach(function(b) {
      b.addEventListener('click', function() {
        bmpState.placeMode = b.dataset.placemode === 'cathode' ? 'cathode' : 'anode';
        _persist();
        _updateRight();
      });
    });
    // Current slider
    const curEl = root.querySelector('#bm-slider-current');
    if (curEl) {
      curEl.addEventListener('input', function() {
        const v = Number(curEl.value || 0);
        const mA = Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : 0;
        bmpState.intensity = mA.toFixed(1) + ' mA';
        // Keep the legacy text input in sync too
        const legacy = document.getElementById('bmp-param-intensity');
        if (legacy) legacy.value = bmpState.intensity;
        _persist();
        _updateRight();
      });
    }
    // Duration slider
    const durEl = root.querySelector('#bm-slider-duration');
    if (durEl) {
      durEl.addEventListener('input', function() {
        const v = Number(durEl.value || 0);
        const m = Number.isFinite(v) ? Math.max(0, Math.min(45, v)) : 0;
        bmpState.duration = String(Math.round(m));
        const legacy = document.getElementById('bmp-param-duration');
        if (legacy) legacy.value = bmpState.duration;
        _persist();
        _updateRight();
      });
    }
    // Waveform select
    const wf = root.querySelector('#bm-waveform');
    if (wf) {
      wf.addEventListener('change', function() {
        bmpState.waveform = wf.value || 'Anodal DC';
        _persist();
      });
    }
    // Evidence card click → load that protocol
    root.querySelectorAll('.bm-evidence').forEach(function(card) {
      card.addEventListener('click', function() {
        const pid = card.dataset.proto;
        if (pid) window._bmpLoadProto(pid);
      });
    });
    // Detail panel click (alt site + linked protocol buttons — unchanged behaviour)
    const detailPanel = root.querySelector('#bmp-detail-panel');
    if (detailPanel) {
      detailPanel.addEventListener('click', function(e) {
        const ab = e.target.closest('[data-altsite]');
        if (ab) { window._bmpSiteClick(ab.dataset.altsite); return; }
        const pb = e.target.closest('[data-proto]');
        if (pb) { window._bmpLoadProto(pb.dataset.proto); return; }
      });
    }
  }

  function _wireAtlas() {
    const root = document.getElementById('bm-left');
    if (!root) return;
    // Region click → set region + select primary site
    root.querySelectorAll('[data-region-id]').forEach(function(r) {
      r.addEventListener('click', function() {
        window._bmpSetRegion(r.dataset.regionId);
      });
    });
    // Condition chip click → set filter (reuse existing setter so main
    // protocol select re-renders)
    root.querySelectorAll('[data-cond]').forEach(function(c) {
      c.addEventListener('click', function() {
        window._bmpSetProtoFilter('cond', c.dataset.cond);
        // toggle the active class locally
        root.querySelectorAll('[data-cond]').forEach(function(x) {
          x.classList.toggle('bm-chip-active', x.dataset.cond === c.dataset.cond);
        });
      });
    });
    // Search filter — filter visible regions by name/function/condition substring
    const search = root.querySelector('#bm-region-search');
    if (search) {
      search.addEventListener('input', function() {
        const q = String(search.value || '').toLowerCase().trim();
        root.querySelectorAll('[data-region-id]').forEach(function(r) {
          if (!q) { r.style.display = ''; return; }
          const blob = r.dataset.regionQ || '';
          r.style.display = blob.indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
  }

  function _wireTabs() {
    const root = el.querySelector('.bm-tabs-wrap');
    if (!root) return;
    root.querySelectorAll('[data-tab]').forEach(function(t) {
      t.addEventListener('click', function() {
        const v = t.dataset.tab;
        if (!v || v === bmpState.tab) return;
        bmpState.tab = v;
        _persist();
        // Toggle the atlas rail visibility for montage tab, re-render right
        const shell = el.querySelector('.bm-shell-v2');
        const leftAside = el.querySelector('#bm-left');
        if (shell) {
          shell.classList.toggle('bm-no-left', v === 'montage');
          if (v === 'montage' && leftAside) leftAside.style.display = 'none';
          else if (leftAside) leftAside.style.display = '';
        }
        // Highlight active tab
        root.querySelectorAll('[data-tab]').forEach(function(x) {
          x.classList.toggle('active', x.dataset.tab === v);
        });
        _updateRight();
      });
    });
    // Patient input
    const pInp = el.querySelector('#bm-patient-inp');
    if (pInp) {
      pInp.addEventListener('input', function() {
        bmpState.patientId = String(pInp.value || '').slice(0, 80);
        _persist();
        const lbl = el.querySelector('.bm-panel-label');
        if (lbl) {
          const patientLabel = bmpState.patientId || 'Demo patient';
          const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
          lbl.innerHTML = 'ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel);
        }
      });
    }
  }

  function _wireCanvasToolbar() {
    const root = el.querySelector('.bm-view-toolbar');
    if (!root) return;
    root.querySelectorAll('[data-toggle]').forEach(function(l) {
      l.addEventListener('click', function(e) {
        e.preventDefault();
        const k = l.dataset.toggle;
        if (k === 'efield') {
          bmpState.eFieldOverlay = !bmpState.eFieldOverlay;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.eFieldOverlay);
          _persist();
          _updateMap();
        } else if (k === 'labels') {
          bmpState.labelMode = (bmpState.labelMode === 'minimal') ? 'smart' : 'minimal';
          const ls = document.getElementById('bmp-label-mode');
          if (ls) ls.value = bmpState.labelMode;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.labelMode !== 'minimal');
          _persist();
          _updateMap();
        } else if (k === 'mri-overlay') {
          bmpState.mriOverlay = !bmpState.mriOverlay;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.mriOverlay);
          _persist();
          _renderBMPFocusViewer();
        }
      });
    });
  }

  // _wireRightPanel() already ran via _updateParams → _updateRight above.
  // Atlas + tabs + canvas toolbar are rendered once (not re-rendered by
  // _updateRight), so wire them once here.
  _wireAtlas();
  _wireTabs();
  _wireCanvasToolbar();
  // MRI focus viewer — only wire when the toggle is on (host was rendered
  // with the viewer's HTML). When off, host is empty and wiring is a no-op.
  if (bmpState.mriOverlay) _wireBMPFocusViewer();

  // New top-bar button handlers. When a patient context is present, the
  // Import button will fall back to loading the most-recent backend planner
  // draft (round-trip). Without a patient it simply focuses the protocol
  // picker as before.
  window._bmpImportFromProtocol = function() {
    const sel = document.getElementById('bmp-proto-sel');
    if (sel) {
      try { sel.focus(); sel.scrollIntoView({ behavior:'smooth', block:'center' }); } catch (_) {}
    }
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (patientId && typeof window._bmpLoadFromBackend === 'function') {
      window._bmpLoadFromBackend();
    }
  };
  // Save current planner state to the backend as a draft against the
  // authenticated clinician. Round-trips through /api/v1/protocols/saved —
  // the full bmpState blob is stored in parameters_json so the planner can
  // re-hydrate (see _bmpLoadFromBackend below).
  window._bmpSaveToProtocol = async function() {
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (!patientId) {
      window._showNotifToast?.({
        title:'Attach a patient',
        body:'Set a patient label (top-right) before saving the montage to backend. The local plan has been preserved.',
        severity:'warn',
      });
      return;
    }
    const conditionId = bmpState.protoId && BMP_PROTO_MAP[bmpState.protoId]
      ? (BMP_PROTO_LABELS[bmpState.protoId] || bmpState.protoId)
      : (bmpState.region || 'custom');
    try {
      const res = await api.saveProtocol({
        patient_id: patientId,
        name: 'Planner · ' + (BMP_PROTO_LABELS[bmpState.protoId] || bmpState.region || bmpState.selectedSite || 'custom montage'),
        condition: conditionId,
        modality: (bmpState.modality || 'TMS').toLowerCase().split('/')[0],
        device_slug: null,
        parameters_json: {
          source: 'brain-map-planner',
          bmpState: { ...bmpState },
        },
        clinician_notes: bmpState.notes || null,
        governance_state: 'draft',
      });
      // Cache id so subsequent edits PATCH instead of creating duplicates.
      if (res?.id) {
        try { localStorage.setItem('ds_bmp_saved_id', String(res.id)); } catch (_) {}
      }
      window._showNotifToast?.({
        title:'Saved to backend',
        body:'Planner state round-trip saved for patient ' + patientId + '.',
        severity:'success',
      });
    } catch (e) {
      window._showNotifToast?.({
        title:'Save failed',
        body:(e?.message || 'backend offline') + ' — local plan preserved.',
        severity:'warn',
      });
    }
  };

  // Load most-recent planner state back from backend drafts (opposite of
  // _bmpSaveToProtocol). Triggered by the Import from protocol button when
  // no protocol select is visible.
  window._bmpLoadFromBackend = async function() {
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (!patientId) {
      window._showNotifToast?.({ title:'Attach a patient', body:'Set a patient to load saved planner state.', severity:'warn' });
      return;
    }
    try {
      const r = await api.listSavedProtocols(patientId);
      const items = Array.isArray(r?.items) ? r.items : [];
      const match = items.reverse().find(d => (d.parameters_json || {}).source === 'brain-map-planner');
      if (!match) {
        window._showNotifToast?.({ title:'No saved planner', body:'No backend planner drafts for this patient.', severity:'warn' });
        return;
      }
      const prior = (match.parameters_json || {}).bmpState || {};
      Object.assign(bmpState, prior);
      _persist();
      if (typeof _updateMap === 'function') _updateMap();
      window._showNotifToast?.({ title:'Planner restored', body:'Loaded saved planner state from backend.', severity:'success' });
    } catch (e) {
      window._showNotifToast?.({ title:'Load failed', body: e?.message || 'backend offline', severity:'warn' });
    }
  };
  window._bmpToggleCompare = function() {
    bmpState.compare = !bmpState.compare;
    _persist();
    _updateMap();
  };

  // Delegated events for lat buttons
  const latToggle = el.querySelector('.bmp-lat-toggle');
  if (latToggle) {
    latToggle.addEventListener('click', function(e) {
      const b = e.target.closest('[data-lat]');
      if (!b) return;
      bmpState.lat = b.dataset.lat;
      el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) {
        btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat);
      });
      _persist();
    });
  }

  // View toggle
  const viewToggle = el.querySelector('.bmp-view-toggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', function(e) {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      bmpState.view = b.dataset.view;
      el.querySelectorAll('.bmp-view-btn').forEach(function(btn) {
        btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view);
      });
      _updateMap();
      _persist();
    });
  }

  // Zoom control
  const zoomInp = document.getElementById('bmp-zoom');
  if (zoomInp) {
    zoomInp.addEventListener('input', function() {
      const z = Number(zoomInp.value || 1);
      bmpState.zoom = (Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1);
      _updateMap();
      _persist();
    });
  }
  window._bmpResetView = function() {
    bmpState.zoom = 1;
    bmpState.panX = 0;
    bmpState.panY = 0;
    const zi = document.getElementById('bmp-zoom');
    if (zi) zi.value = '1';
    _updateMap();
    _persist();
  };
  window._bmpSetLabelMode = function(m) {
    bmpState.labelMode = (m === 'full' || m === 'minimal' || m === 'smart') ? m : 'smart';
    _updateMap();
    _persist();
  };

  // Search / jump to electrode
  function _baseScale() {
    const svg = document.getElementById('bmp-svg');
    if (!svg) return { sx: 1, sy: 1, el: null };
    const r = svg.getBoundingClientRect();
    return { sx: (r.width / 300) || 1, sy: (r.height / 310) || 1, el: svg };
  }
  function _centerOnSite(site) {
    const pos = BMP_SITES[site];
    if (!pos) return false;
    const wrap = document.querySelector('.bmp-svg-wrap');
    if (!wrap) return false;
    const { sx, sy } = _baseScale();
    const z = Number(bmpState.zoom || 1);
    const zSafe = Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    // Transform is: translate(panX panY) scale(z) in viewBox units.
    // Screen px = ((x + panX) * z) * baseScale
    bmpState.panX = (cx / (sx * zSafe)) - pos[0];
    bmpState.panY = (cy / (sy * zSafe)) - pos[1];
    bmpState.selectedSite = site;
    if (!bmpState.region) {
      const r = _inferRegionFromSite(site);
      if (r) {
        bmpState.region = r;
        const rs = document.getElementById('bmp-region-sel');
        if (rs) rs.value = r;
      }
    }
    _updateDetail();
    _updateMap();
    _persist();
    return true;
  }
  window._bmpGoSite = function() {
    const inp = document.getElementById('bmp-site-search');
    const raw = String(inp?.value || '').trim().toUpperCase();
    if (!raw) return;
    const site = raw.replace(/\s+/g, '');
    if (!_centerOnSite(site)) {
      window._showNotifToast?.({ title:'Not found', body:`Unknown site: ${site}`, severity:'warn' });
    }
  };
  const siteInp = document.getElementById('bmp-site-search');
  if (siteInp) {
    siteInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') window._bmpGoSite();
    });
  }

  // Wheel zoom (zoom to cursor)
  const svgWrap = document.querySelector('.bmp-svg-wrap');
  if (svgWrap) {
    svgWrap.addEventListener('wheel', function(e) {
      if (!e.ctrlKey && !e.metaKey) return; // prevents hijacking normal scroll; hold Ctrl for zoom
      e.preventDefault();
      const { sx, sy } = _baseScale();
      const rect = svgWrap.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const z0 = Number(bmpState.zoom || 1);
      const z1 = Math.max(1, Math.min(1.8, z0 + (e.deltaY < 0 ? 0.08 : -0.08)));
      // World coords under cursor before zoom
      const wx = (px / (sx * z0)) - Number(bmpState.panX || 0);
      const wy = (py / (sy * z0)) - Number(bmpState.panY || 0);
      // Solve for new pan to keep world point under cursor
      bmpState.zoom = z1;
      bmpState.panX = (px / (sx * z1)) - wx;
      bmpState.panY = (py / (sy * z1)) - wy;
      const zi = document.getElementById('bmp-zoom');
      if (zi) zi.value = String(z1);
      _updateMap();
      _persist();
    }, { passive: false });
  }

  // Click-drag pan (when zoomed)
  if (svgWrap) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startPanX = 0, startPanY = 0;
    svgWrap.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if ((bmpState.zoom || 1) <= 1.01) return;
      // Don't start drag from form controls
      if (e.target.closest('button, input, select, textarea')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startPanX = Number(bmpState.panX || 0);
      startPanY = Number(bmpState.panY || 0);
      svgWrap.classList.add('bmp-dragging');
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      const { sx, sy } = _baseScale();
      const z = Number(bmpState.zoom || 1);
      const dx = (e.clientX - startX) / (sx * z);
      const dy = (e.clientY - startY) / (sy * z);
      bmpState.panX = startPanX + dx;
      bmpState.panY = startPanY + dy;
      _updateMap();
    });
    window.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      svgWrap.classList.remove('bmp-dragging');
      _persist();
    });
  }

  // Region select
  window._bmpSetRegion = function(r) {
    bmpState.region = r || '';
    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs && rs.primary && rs.primary.length) bmpState.selectedSite = rs.primary[0];
    _updateMap(); _updateDetail();
    _persist();
  };

  // Quick actions
  window._bmpCopySummary = async function() {
    const txt = _planSummary();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      window._showNotifToast?.({ title:'Copied', body:'Plan summary copied to clipboard.', severity:'info' });
    } catch (_) {
      // Fallback: prompt
      window.prompt('Copy plan summary:', txt);
    }
  };
  window._bmpReset = function() {
    localStorage.removeItem(BMP_STORAGE_KEY);
    bmpState.region = '';
    bmpState.protoId = '';
    bmpState.modality = 'TMS/rTMS';
    bmpState.lat = 'left';
    bmpState.freq = '';
    bmpState.intensity = '';
    bmpState.pulses = '';
    bmpState.duration = '';
    bmpState.sessions = '';
    bmpState.notes = '';
    bmpState.selectedSite = '';
    bmpState.view = 'clinical';
    const rs = document.getElementById('bmp-region-sel'); if (rs) rs.value = '';
    const ps = document.getElementById('bmp-proto-sel'); if (ps) ps.value = '';
    const ms = document.getElementById('bmp-mod-sel');   if (ms) ms.value = bmpState.modality;
    el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    el.querySelectorAll('.bmp-view-btn').forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    ['freq','intensity','pulses','duration','sessions','notes'].forEach(function(k) {
      const id = 'bmp-param-' + k;
      const inp = document.getElementById(id);
      if (inp) inp.value = '';
    });
    _updateParams(); _updateDetail(); _updateMap();
    _persist();
    window._showNotifToast?.({ title:'Reset', body:'Planner reset to defaults.', severity:'info' });
  };
  window._bmpSavePreset = function() {
    const name = window.prompt('Preset name (e.g., "MDD rTMS F3")', '');
    if (!name) return;
    const id = 'bmp_' + Math.random().toString(16).slice(2, 10);
    const items = _loadPresets();
    items.unshift({ id, name, state: { ...bmpState } });
    _savePresets(items.slice(0, 50));
    _renderPresetSelect();
    const sel = document.getElementById('bmp-preset-sel'); if (sel) sel.value = id;
    window._showNotifToast?.({ title:'Saved', body:`Preset saved: ${name}`, severity:'info' });
  };
  window._bmpLoadPreset = function(id) {
    if (!id) return;
    const items = _loadPresets();
    const p = items.find(x => x.id === id);
    if (!p || !p.state) return;
    const s = p.state;
    bmpState = { ...bmpState, ...s };
    // hydrate controls
    const rs = document.getElementById('bmp-region-sel'); if (rs) rs.value = bmpState.region || '';
    const ps = document.getElementById('bmp-proto-sel'); if (ps) ps.value = bmpState.protoId || '';
    const ms = document.getElementById('bmp-mod-sel');   if (ms) ms.value = bmpState.modality || 'TMS/rTMS';
    el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    el.querySelectorAll('.bmp-view-btn').forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    const setVal = (key) => { const inp = document.getElementById('bmp-param-' + key); if (inp) inp.value = bmpState[key] || ''; };
    ['freq','intensity','pulses','duration','sessions','notes'].forEach(setVal);
    _updateParams(); _updateDetail(); _updateMap();
    _persist();
    window._showNotifToast?.({ title:'Loaded', body:`Preset loaded: ${p.name}`, severity:'info' });
  };

  // Keep manual parameter edits in state + persist
  function _wireParam(id, key) {
    const elp = document.getElementById(id);
    if (!elp) return;
    elp.addEventListener('input', function() {
      bmpState[key] = String(elp.value || '');
      _persist();
    });
  }
  _wireParam('bmp-param-freq', 'freq');
  _wireParam('bmp-param-intensity', 'intensity');
  _wireParam('bmp-param-pulses', 'pulses');
  _wireParam('bmp-param-duration', 'duration');
  _wireParam('bmp-param-sessions', 'sessions');
  _wireParam('bmp-param-notes', 'notes');

  // Detail panel delegated events (alt targets + linked protocols)
  const detailPanel = document.getElementById('bmp-detail-panel');
  if (detailPanel) {
    detailPanel.addEventListener('click', function(e) {
      const ab = e.target.closest('[data-altsite]');
      if (ab) { window._bmpSiteClick(ab.dataset.altsite); return; }
      const pb = e.target.closest('[data-proto]');
      if (pb) { window._bmpLoadProto(pb.dataset.proto); return; }
    });
  }

  // ── global handlers ───────────────────────────────────────────────────────
  window._bmpLoadProto = function(pid) { if (pid) _loadProtocol(pid); };

  window._bmpSetProtoFilter = function(key, value) {
    if (key !== 'q' && key !== 'cond' && key !== 'ev' && key !== 'site') return;
    _bmpProtoFilter[key] = String(value == null ? '' : value);
    _renderProtoSelect();
    if (bmpState.mriOverlay) _renderBMPFocusViewer();
  };

  window._bmpSetModality = function(m) {
    bmpState.modality = m; _updateMap(); _updateParams();
    _persist();
  };

  window._bmpSetLat = function(lat) {
    bmpState.lat = lat;
    el.querySelectorAll('.bmp-lat-btn').forEach(function(b) {
      b.classList.toggle('bmp-lat-active', b.dataset.lat === lat);
    });
  };

  window._bmpSetView = function(v) {
    bmpState.view = v;
    const btns = el.querySelectorAll('.bmp-view-btn');
    btns.forEach(function(b) { b.classList.toggle('bmp-view-active', b.dataset.view === v); });
    _updateMap();
  };

  window._bmpSiteHover = function(name, on, evt) {
    const tt = document.getElementById('bmp-tooltip');
    if (!tt) return;
    if (!on) {
      tt.style.display = 'none';
      return;
    }
    const anat = BMP_ANATOMY[name] || name;
    const cl   = (BMP_CONDITIONS[name] || []).join(', ') || 'General electrode site';
    tt.innerHTML = '<strong style="font-size:13px">' + name + '</strong>'
      + '<br><span style="font-size:11px;color:rgba(255,255,255,0.7)">' + anat + '</span>'
      + '<br><span style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px;display:block">' + cl + '</span>';
    tt.style.display = 'block';
    if (evt) { tt.style.left = (evt.clientX + 14) + 'px'; tt.style.top = (evt.clientY - 10) + 'px'; }
  };

  document.addEventListener('mousemove', function(e) {
    const tt = document.getElementById('bmp-tooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top  = (e.clientY - 10) + 'px';
    }
  });

  window._bmpSiteClick = function(name) {
    if (!bmpState.region) {
      const r = _inferRegionFromSite(name);
      if (r) {
        bmpState.region = r;
        const rs = document.getElementById('bmp-region-sel');
        if (rs) rs.value = r;
      }
    }
    bmpState.selectedSite = name;
    // Bidirectional: click a site → filter protocol list to that electrode.
    // Click the same site again → clear the filter.
    _bmpProtoFilter.site = (_bmpProtoFilter.site === name) ? '' : name;
    _renderProtoSelect();
    _updateDetail(); _updateMap(); _updateParams();
    _persist();
  };

  window._bmpPrescribe   = function() { window._nav('prescriptions'); };
  window._bmpUseInWizard = function() { window._nav('protocol-wizard'); };

  window._bmpViewDetail = function() {
    if (bmpState.protoId) window._protDetailId = bmpState.protoId;
    window._nav('protocol-detail');
  };

  window._bmpPrescribeProto = function(pid) {
    const safe = String(pid || '').replace(/['"<>&]/g, '');
    if (safe) {
      if (protos && protos.find) {
        const p = protos.find(function(pr) { return (pr.id || '') === safe; });
        if (p) window._rxPrefilledProto = p;
      }
      window._protDetailId = safe;
    }
    window._nav('prescriptions');
  };

  window._bmpState = bmpState;
}
