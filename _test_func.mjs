export async function pgBrainMapPlanner(setTopbar) {
  setTopbar('Brain Map Planner', `
    <button class="btn btn-sm" onclick="window._nav('protocol-wizard')" style="border-color:var(--teal);color:var(--teal)">Protocol Search</button>
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

  let bmpState = {
    region:'', modality:'TMS/rTMS', lat:'left',
    freq:'', intensity:'', pulses:'', duration:'', sessions:'', notes:'',
    selectedSite:'', view:'clinical', protoId:'',
  };

  let conds = [], protos = [];
  try {
    const apiObj = window._api || window.api;
    const [cd, pd] = await Promise.all([
      apiObj ? apiObj.conditions().catch(function() { return null; }) : Promise.resolve(null),
      apiObj ? apiObj.protocols().catch(function()  { return null; }) : Promise.resolve(null),
    ]);
    conds  = (cd && cd.items)  ? cd.items  : [];
    protos = (pd && pd.items)  ? pd.items  : [];
  } catch (_) {}
  if (!conds.length) conds = FALLBACK_CONDITIONS.map(function(n) { return { name: n }; });

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function _mc() { return MODALITY_COLORS[bmpState.modality] || '#00d4bc'; }

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
    s('<svg id="bmp-svg" viewBox="0 0 300 310" width="280" height="290"'
      + ' xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">');
    s('<defs><filter id="bmp-glow" x="-50%" y="-50%" width="200%" height="200%">'
      + '<feGaussianBlur stdDeviation="3" result="blur"/>'
      + '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter></defs>');
    s('<ellipse cx="150" cy="155" rx="128" ry="148" fill="#0f1623"'
      + ' stroke="rgba(148,163,184,0.25)" stroke-width="1.5"/>');
    s('<path d="M143,8 Q150,2 157,8" fill="none" stroke="rgba(148,163,184,0.25)"'
      + ' stroke-width="1.5" stroke-linecap="round"/>');
    s('<path d="M22,148 Q15,155 22,162" fill="none" stroke="rgba(148,163,184,0.25)"'
      + ' stroke-width="1.5" stroke-linecap="round"/>');
    s('<path d="M278,148 Q285,155 278,162" fill="none" stroke="rgba(148,163,184,0.25)"'
      + ' stroke-width="1.5" stroke-linecap="round"/>');
    s('<line x1="150" y1="10" x2="150" y2="300" stroke="rgba(148,163,184,0.08)"'
      + ' stroke-width="0.5" stroke-dasharray="4 4"/>');
    s('<line x1="22" y1="155" x2="278" y2="155" stroke="rgba(148,163,184,0.08)"'
      + ' stroke-width="0.5" stroke-dasharray="4 4"/>');
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
          + '<text x="' + sx + '" y="' + (sy + 42) + '" text-anchor="middle" font-size="7.5"'
          + ' fill="rgba(255,255,255,0.7)" font-family="system-ui">' + _esc(lbl) + '</text>'
        ));
      });
    } else {
      Object.keys(BMP_SITES).forEach(function(name) {
        if (_siteRole(name) !== 'inactive') return;
        const pos = BMP_SITES[name];
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="5" fill="rgba(148,163,184,0.10)"'
          + ' stroke="rgba(148,163,184,0.22)" stroke-width="0.8"/>'
          + '<text x="' + (sx + 7) + '" y="' + (sy + 3) + '" font-size="6"'
          + ' fill="rgba(148,163,184,0.35)" font-family="system-ui">' + _esc(name) + '</text>'
        ));
      });
      ap.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="7" fill="rgba(74,158,255,0.15)"'
          + ' stroke="#4a9eff" stroke-width="0.8" stroke-dasharray="3 2"/>'
          + '<text x="' + (sx + 9) + '" y="' + (sy + 3) + '" font-size="7"'
          + ' fill="rgba(74,158,255,0.7)" font-family="system-ui">' + _esc(name) + '</text>'
        ));
      });
      rp.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="#ffb547" opacity="0.12"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="8" fill="#ffb547" opacity="0.55"'
          + ' filter="url(#bmp-glow)"/>'
          + '<text x="' + (sx + 10) + '" y="' + (sy + 3) + '" font-size="7.5" fill="#ffb547"'
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
    s('</svg>');
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
    Object.keys(BMP_PROTO_MAP).forEach(function(pid) {
      const rs = BMP_REGION_SITES[BMP_PROTO_MAP[pid].region];
      if (rs && (rs.primary.indexOf(site) !== -1 || rs.ref.indexOf(site) !== -1) && linkedProtos.length < 6)
        linkedProtos.push(pid);
    });
    let h = '<div class="bmp-detail-card">';
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
          + _esc(BMP_PROTO_LABELS[pid] || pid) + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function _updateMap() {
    const ctr = document.getElementById('bmp-svg-container');
    if (!ctr) return;
    ctr.innerHTML = _buildSVG(bmpState.view === 'patient');
    _attachSVGEvents(ctr);
  }

  function _updateDetail() {
    const dp = document.getElementById('bmp-detail-panel');
    if (dp) dp.innerHTML = _buildDetailPanel(bmpState.selectedSite);
  }

  function _updateParams() {
    const pp = document.getElementById('bmp-params-section');
    if (pp) pp.style.display = (bmpState.modality || bmpState.protoId) ? '' : 'none';
  }

  function _loadProtocol(pid) {
    const pm = BMP_PROTO_MAP[pid]; if (!pm) return;
    bmpState.protoId   = pid;
    bmpState.region    = pm.region;
    bmpState.modality  = pm.modality;
    bmpState.lat       = pm.lat;
    bmpState.freq      = pm.freq;
    bmpState.intensity = pm.intensity;
    bmpState.pulses    = pm.pulses;
    bmpState.sessions  = pm.sessions;
    const modSel = document.getElementById('bmp-mod-sel');
    if (modSel) modSel.value = pm.modality;
    document.querySelectorAll('.bmp-lat-btn').forEach(function(b) {
      b.classList.toggle('bmp-lat-active', b.dataset.lat === pm.lat);
    });
    ['freq','intensity','pulses','sessions'].forEach(function(k) {
      const inp = document.getElementById('bmp-param-' + k);
      if (inp) inp.value = pm[k] || '';
    });
    const ps = document.getElementById('bmp-proto-sel');
    if (ps) ps.value = pid;
    const rs = BMP_REGION_SITES[pm.region];
    if (rs && rs.primary.length) bmpState.selectedSite = rs.primary[0];
    _updateMap(); _updateDetail(); _updateParams();
  }

  const protoOptions = Object.keys(BMP_PROTO_LABELS).map(function(id) {
    return '<option value="' + _esc(id) + '">' + _esc(BMP_PROTO_LABELS[id]) + '</option>';
  }).join('');

  const condOptions = conds.map(function(c) {
    const n = c.name || c;
    return '<option value="' + _esc(n) + '">' + _esc(n) + '</option>';
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

  el.innerHTML =
    '<div class="bmp-layout">'
    + '<div class="bmp-panel bmp-panel--left">'
      + '<div class="bmp-section-card">'
        + '<div class="bmp-section-title">Load Protocol</div>'
        + '<select id="bmp-proto-sel" class="form-select" style="width:100%;font-size:12px"'
          + ' onchange="window._bmpLoadProto(this.value)">'
          + '<option value="">\u2014 select protocol \u2014</option>'
          + protoOptions
        + '</select>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 4px">'
        + '<div style="flex:1;height:1px;background:var(--border)"></div>'
        + '<span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">or configure manually</span>'
        + '<div style="flex:1;height:1px;background:var(--border)"></div>'
      + '</div>'
      + '<div class="bmp-section-card">'
        + '<div class="bmp-section-title">Condition</div>'
        + '<select id="bmp-cond-sel" class="form-select" style="width:100%;font-size:12px">'
          + '<option value="">\u2014 select \u2014</option>' + condOptions
        + '</select>'
      + '</div>'
      + '<div class="bmp-section-card">'
        + '<div class="bmp-section-title">Modality</div>'
        + '<select id="bmp-mod-sel" class="form-select" style="width:100%;font-size:12px"'
          + ' onchange="window._bmpSetModality(this.value)">'
          + modalityOptions
        + '</select>'
      + '</div>'
      + '<div class="bmp-section-card">'
        + '<div class="bmp-section-title">Laterality</div>'
        + '<div class="bmp-lat-toggle">'
          + _latBtn('left','Left') + _latBtn('bilateral','Bilateral') + _latBtn('right','Right')
        + '</div>'
      + '</div>'
      + '<div id="bmp-params-section" class="bmp-section-card" style="display:none">'
        + '<div class="bmp-section-title">Parameters</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px">'
          + '<label style="font-size:11px;color:var(--text-secondary)">Frequency (Hz)'
            + '<input id="bmp-param-freq" class="form-input" type="text"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box"></label>'
          + '<label style="font-size:11px;color:var(--text-secondary)">Intensity (% MT)'
            + '<input id="bmp-param-intensity" class="form-input" type="text"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box"></label>'
          + '<label style="font-size:11px;color:var(--text-secondary)">Pulses/session'
            + '<input id="bmp-param-pulses" class="form-input" type="text"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box"></label>'
          + '<label style="font-size:11px;color:var(--text-secondary)">Duration (min)'
            + '<input id="bmp-param-duration" class="form-input" type="text"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box"></label>'
          + '<label style="font-size:11px;color:var(--text-secondary)">Sessions'
            + '<input id="bmp-param-sessions" class="form-input" type="text"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box"></label>'
          + '<label style="font-size:11px;color:var(--text-secondary)">Notes'
            + '<textarea id="bmp-param-notes" class="form-input" rows="2"'
            + ' style="margin-top:3px;width:100%;font-size:12px;box-sizing:border-box;resize:vertical"></textarea></label>'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">'
        + '<button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal);font-size:12px"'
          + ' onclick="window._bmpPrescribe()">Add to Prescription</button>'
        + '<button class="btn btn-sm" style="font-size:12px"'
          + ' onclick="window._bmpUseInWizard()">Use in Protocol Wizard</button>'
      + '</div>'
    + '</div>'
    + '<div class="bmp-panel bmp-panel--map">'
      + '<div class="bmp-map-wrap">'
        + '<div class="bmp-map-header">'
          + '<span style="font-size:13px;font-weight:700;color:var(--text-primary)">Electrode Map</span>'
          + '<div class="bmp-view-toggle">'
            + '<button class="bmp-view-btn bmp-view-active" data-view="clinical">Clinical</button>'
            + '<button class="bmp-view-btn" data-view="patient">Patient</button>'
          + '</div>'
        + '</div>'
        + '<div class="bmp-svg-wrap"><div id="bmp-svg-container">' + _buildSVG(false) + '</div></div>'
        + '<div class="bmp-legend-row">'
          + '<div class="bmp-legend-item"><span class="bmp-legend-swatch" style="background:var(--teal)"></span>Primary</div>'
          + '<div class="bmp-legend-item"><span class="bmp-legend-swatch" style="background:#ffb547"></span>Reference</div>'
          + '<div class="bmp-legend-item"><span class="bmp-legend-swatch" style="background:#4a9eff;opacity:0.6"></span>Alternate</div>'
          + '<div class="bmp-legend-item"><span class="bmp-legend-swatch" style="background:rgba(148,163,184,0.3)"></span>Inactive</div>'
        + '</div>'
      + '</div>'
    + '</div>'
    + '<div class="bmp-panel bmp-panel--right">'
      + '<div id="bmp-detail-panel">' + _buildDetailPanel('') + '</div>'
      + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'
        + '<button class="btn btn-sm" style="font-size:12px" onclick="window._bmpViewDetail()">View Protocol Detail</button>'
        + '<button class="btn btn-sm" style="font-size:12px" onclick="window._bmpPrescribeProto(window._bmpState && window._bmpState.protoId)">Prescribe This Protocol</button>'
      + '</div>'
    + '</div>'
    + '</div>'
    + '<div id="bmp-tooltip" class="bmp-tooltip" style="display:none"></div>';

  // Attach SVG events after initial render
  _attachSVGEvents(document.getElementById('bmp-svg-container'));

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
    });
  }

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

  window._bmpSetModality = function(m) {
    bmpState.modality = m; _updateMap(); _updateParams();
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
    bmpState.selectedSite = name;
    _updateDetail(); _updateMap(); _updateParams();
  };

  window._bmpPrescribe   = function() { window._nav('prescriptions'); };
  window._bmpUseInWizard = function() { window._nav('protocol-wizard'); };

  window._bmpViewDetail = function() {
    if (bmpState.protoId && protos && protos.find) {
      const p = protos.find(function(pr) { return (pr.id || '') === bmpState.protoId; });
      if (p) window._pilDetailProto = p;
    }
    window._nav('protocol-detail');
  };

  window._bmpPrescribeProto = function(pid) {
    if (pid && protos && protos.find) {
      const p = protos.find(function(pr) { return (pr.id || '').replace(/['"<>&]/g, '') === pid; });
      if (p) window._rxPrefilledProto = p;
    }
    window._nav('prescriptions');
  };

  window._bmpState = bmpState;
}
