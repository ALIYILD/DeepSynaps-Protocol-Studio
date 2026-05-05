/**
 * Clinic Marketplace hub — curated demo listings + API catalog mapping.
 * Separated from pages-clinical-hubs.js for testing and clarity.
 */

/** Required governance copy (also asserted in unit tests). */
export const MARKETPLACE_GOVERNANCE_NOTICE =
  'Marketplace items may require clinic approval, configuration, evidence review, regulatory review, and clinician governance before clinical use. Activation here does not approve treatment, prescribe care, or replace clinical judgement.';

/** Shortcuts to clinical modules (in-app navigation targets). */
export const MARKETPLACE_MODULE_SHORTCUTS = [
  { id: 'protocol-studio', label: 'Protocol Studio', route: 'protocol-studio', hint: 'Design & review protocols' },
  { id: 'handbooks-v2', label: 'Handbooks', route: 'handbooks-v2', hint: 'Guidance & references' },
  { id: 'documents-v2', label: 'Documents', route: 'documents-v2', hint: 'Clinic documents' },
  { id: 'labs-analyzer', label: 'Labs', route: 'labs-analyzer', hint: 'Lab interpretation support' },
  { id: 'qeeg-launcher', label: 'qEEG', route: 'qeeg-launcher', hint: 'EEG / neurophysiology' },
  { id: 'mri-analysis', label: 'MRI', route: 'mri-analysis', hint: 'Structural imaging pipeline' },
  { id: 'deeptwin', label: 'DeepTwin', route: 'deeptwin', hint: 'Patient intelligence hub' },
  { id: 'monitor', label: 'Monitor / devices', route: 'monitor', hint: 'Device workspace' },
  { id: 'risk-analyzer', label: 'Risk', route: 'risk-analyzer', hint: 'Safety signals' },
  { id: 'medication-analyzer', label: 'Medication', route: 'medication-analyzer', hint: 'Medication context' },
];

/**
 * Illustrative listings shown when the catalog API is empty or unreachable.
 * These are NOT in-app purchases — links go to external vendors for discovery only.
 */
export const DEMO_CURATED_LISTINGS = [
  { id: 'l1', cat: 'consultations', title: 'Initial TMS Assessment', clinic: 'Smart TMS', price: 120, unit: 'session', badge: 'Featured', rating: 4.9, reviews: 142, desc: 'Comprehensive first-consultation including QEEG screening and protocol recommendation.', img: '🩺', url: 'https://www.smarttms.co.uk/gps-referrals/', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l2', cat: 'consultations', title: 'Follow-up Protocol Review', clinic: 'AIM Neuromodulation', price: 75, unit: 'session', badge: '', rating: 4.7, reviews: 89, desc: 'Review progress, adjust stimulation parameters and outcomes targets mid-course.', img: '🩺', url: 'https://www.aimneuromodulation.com/', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l3', cat: 'consultations', title: 'tDCS Home Setup Consultation', clinic: 'Neuroelectrics', price: 60, unit: 'session', badge: 'New', rating: 4.5, reviews: 23, desc: 'Remote session to configure home tDCS device and safety protocols.', img: '🩺', url: 'https://www.neuroelectrics.com/blog/home-based-tdcs-as-a-promising-treatment-for-depression', listingKind: 'demo_curated', regulatoryNote: 'Educational content only — not a regulatory clearance claim for your clinic.' },
  { id: 'l4', cat: 'products', title: 'Ten20 Conductive EEG Paste 228g', clinic: 'Weaver and Company', price: 12, unit: 'item', badge: 'Bestseller', rating: 4.7, reviews: 1250, desc: 'Industry-standard conductive paste for EEG, EMG, and neurofeedback electrode application.', img: '🧴', url: 'https://www.amazon.com/dp/B00GTX2MNE', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l5', cat: 'products', title: 'Muse 2 Brain Sensing Headband', clinic: 'Interaxon', price: 199, unit: 'item', badge: 'Featured', rating: 4.3, reviews: 3200, desc: 'EEG-powered meditation headband with real-time biofeedback for brain activity, heart rate, breathing, and movement.', img: '🧠', url: 'https://www.amazon.com/dp/B07HL2JQQJ', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l6', cat: 'products', title: 'Polar H10 Heart Rate Sensor', clinic: 'Polar', price: 89, unit: 'item', badge: '', rating: 4.7, reviews: 18500, desc: 'Medical-grade ECG chest strap with dual Bluetooth + ANT+. Gold standard for HRV monitoring in clinical settings.', img: '🫀', url: 'https://www.amazon.com/dp/B07PM54P4N', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l17', cat: 'products', title: 'Oura Ring Gen 4', clinic: 'Oura Health', price: 349, unit: 'item', badge: 'New', rating: 4.2, reviews: 5400, desc: 'Titanium smart ring with advanced sleep staging, HRV, blood oxygen, and activity tracking. 7-day battery life.', img: '💍', url: 'https://www.amazon.com/dp/B0DKLHHMZ5', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l18', cat: 'products', title: 'Verilux HappyLight Touch Plus', clinic: 'Verilux', price: 64, unit: 'item', badge: '', rating: 4.5, reviews: 9800, desc: '10,000 lux UV-free LED light therapy lamp. Adjustable brightness and colour temperature for SAD and circadian therapy.', img: '☀️', url: 'https://www.amazon.com/dp/B07WC7KT4G', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l19', cat: 'products', title: 'Garmin vivosmart 5 Fitness Tracker', clinic: 'Garmin', price: 149, unit: 'item', badge: '', rating: 4.3, reviews: 7200, desc: 'Fitness tracker with stress tracking, Body Battery energy monitoring, sleep score, and Garmin Connect integration.', img: '⌚', url: 'https://www.amazon.com/dp/B09W1TVFS7', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l20', cat: 'products', title: 'LectroFan Evo White Noise Machine', clinic: 'Adaptive Sound', price: 49, unit: 'item', badge: '', rating: 4.6, reviews: 11400, desc: 'High-fidelity white noise, fan, and ocean sounds with precise volume control. 22 non-looping sounds for sleep and focus.', img: '🔊', url: 'https://www.amazon.com/dp/B07XXR2NVB', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l7', cat: 'software', title: 'NeuroGuide QEEG Software', clinic: 'Applied Neuroscience', price: 49, unit: 'month', badge: 'Featured', rating: 4.9, reviews: 204, desc: 'Industry-standard QEEG analysis, database comparison, and clinical report generation platform with normative databases.', img: '💻', url: 'https://www.appliedneuroscience.com/product/neuroguide/', listingKind: 'demo_curated', regulatoryNote: 'Third-party software — verify licensing and intended use with the vendor.' },
  { id: 'l8', cat: 'software', title: 'qEEG-Pro Report Generator', clinic: 'qEEG-Pro', price: 29, unit: 'month', badge: '', rating: 4.5, reviews: 78, desc: 'Automated clinical QEEG report generation with z-score analysis, ERP processing, and protocol recommendations.', img: '📊', url: 'https://qeeg.pro/', listingKind: 'demo_curated', regulatoryNote: 'Decision-support outputs require clinician review — not autonomous diagnosis.' },
  { id: 'l9', cat: 'software', title: 'BrainMaster Discovery 24E', clinic: 'BrainMaster', price: 0, unit: 'free', badge: 'Free', rating: 4.2, reviews: 331, desc: 'Neurofeedback software suite with real-time EEG acquisition, biofeedback, and patient engagement tracking.', img: '📱', url: 'https://brainmaster.com/our-software/', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l10', cat: 'seminars', title: 'rTMS in Treatment-Resistant Depression', clinic: 'Clinical TMS Society', price: 95, unit: 'seat', badge: 'Live', rating: 4.9, reviews: 67, desc: 'Half-day CPD seminar covering evidence, protocols, and real-world outcomes.', img: '🎤', url: 'https://www.clinicaltmssociety.org/education', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l11', cat: 'seminars', title: 'Neuromodulation for Chronic Pain', clinic: 'INS', price: 85, unit: 'seat', badge: '', rating: 4.7, reviews: 41, desc: 'Evidence-based webinar on SCS, TENS, and tDCS for pain management by the International Neuromodulation Society.', img: '🎤', url: 'https://www.neuromodulation.com/webinars', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l12', cat: 'workshops', title: 'Hands-On TMS Coil Placement', clinic: 'Clinical TMS Society', price: 195, unit: 'seat', badge: '', rating: 5.0, reviews: 29, desc: 'Practical workshop: figure-8 placement, motor threshold mapping, safety protocols.', img: '🔧', url: 'https://www.clinicaltmssociety.org/courses', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l13', cat: 'workshops', title: 'QEEG Interpretation Workshop', clinic: 'Neurocare Academy', price: 225, unit: 'seat', badge: 'New', rating: 4.8, reviews: 15, desc: 'Full-day workshop analysing real patient EEG traces and building personalised protocol maps.', img: '🔧', url: 'https://www.neurocaregroup.com/academy.html', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l14', cat: 'courses', title: 'Medical Neuroscience — Duke University', clinic: 'Coursera', price: 0, unit: 'free audit', badge: 'Featured', rating: 4.9, reviews: 4200, desc: 'Comprehensive neuroanatomy and neurophysiology. ~14 weeks. Free audit or paid certificate.', img: '📚', url: 'https://www.coursera.org/learn/medical-neuroscience', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l15', cat: 'courses', title: 'Fundamentals of Neuroscience — HarvardX', clinic: 'edX', price: 0, unit: 'free audit', badge: '', rating: 4.8, reviews: 2800, desc: 'Three-part Harvard Medical School series covering cellular, systems, and clinical neuroscience.', img: '📚', url: 'https://www.edx.org/xseries/harvardx-fundamentals-of-neuroscience', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l16', cat: 'courses', title: 'Computational Neuroscience — University of Washington', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.7, reviews: 1600, desc: 'Neural coding, modelling, and closed-loop stimulation design primer. ~9 weeks.', img: '📚', url: 'https://www.coursera.org/learn/computational-neuroscience', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l21', cat: 'courses', title: 'The Brain and Space — Duke University', clinic: 'Coursera', price: 0, unit: 'free audit', badge: 'New', rating: 4.7, reviews: 900, desc: 'How the brain creates our sense of spatial awareness. Covers spatial perception, sensory systems, brain mapping.', img: '📚', url: 'https://www.coursera.org/learn/the-brain-and-space', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l22', cat: 'courses', title: 'Introduction to Psychology — Yale University', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.9, reviews: 12500, desc: 'Paul Bloom\'s famous course covering brain structure, neural development, perception, learning, memory, and more.', img: '📚', url: 'https://www.coursera.org/learn/introduction-psychology', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l23', cat: 'courses', title: 'Neuroscience and Neuroimaging — Johns Hopkins', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.6, reviews: 1100, desc: 'Neurohacking in R — neuroimaging analysis including preprocessing, structural and functional MRI.', img: '📚', url: 'https://www.coursera.org/learn/neurohacking', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l24', cat: 'courses', title: 'Understanding the Brain — University of Chicago', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.8, reviews: 3500, desc: 'Neurobiology of everyday life — how the brain generates behaviour and how it is affected by disease.', img: '📚', url: 'https://www.coursera.org/learn/neurobiology', listingKind: 'demo_curated', regulatoryNote: null },
  { id: 'l25', cat: 'courses', title: 'Biohacking Your Brain\'s Health — Udemy', clinic: 'Udemy', price: 19, unit: 'course', badge: '', rating: 4.5, reviews: 5200, desc: 'Practical strategies for optimising brain health through sleep, nutrition, exercise, and neurofeedback techniques.', img: '📚', url: 'https://www.udemy.com/topic/neuroscience/', listingKind: 'demo_curated', regulatoryNote: null },
  // Explicit coming-soon / unavailable examples for honest UI coverage
  { id: 'cs-lab-integration', cat: 'software', title: 'Clinic EHR sync (preview)', clinic: 'DeepSynaps', price: null, unit: '', badge: 'Coming soon', rating: null, reviews: null, desc: 'Planned integration for scheduling context — not available for activation yet.', img: '🔗', url: '', listingKind: 'coming_soon', regulatoryNote: 'No vendor connection is established from this screen.' },
  { id: 'unvendor-x', cat: 'products', title: 'Illustrative device slot', clinic: 'N/A', price: null, unit: 'item', badge: 'Unavailable', rating: null, reviews: null, desc: 'Placeholder for a device listing without a vendor link — shows disabled action.', img: '📦', url: '', listingKind: 'unavailable', regulatoryNote: null },
];

export function kindToHubCategory(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'product' || k === 'device') return 'products';
  if (k === 'service') return 'consultations';
  if (k === 'software') return 'software';
  if (k === 'education') return 'seminars';
  if (k === 'course') return 'courses';
  return 'products';
}

/**
 * Map a row from GET /api/v1/patient-portal/marketplace/items to hub listing shape.
 */
export function mapApiMarketplaceItem(it) {
  const clinical = !!it.clinical;
  const pu = String(it.price_unit || '').toUpperCase();
  const isCurrency = pu === 'GBP' || pu === 'USD' || pu === 'EUR';
  return {
    id: it.id,
    cat: kindToHubCategory(it.kind),
    title: it.name,
    clinic: it.provider,
    price: it.price,
    /** Original DB field — currency code or a unit label depending on seed data */
    unit: it.price_unit || 'item',
    priceCurrency: isCurrency ? pu : null,
    badge: it.featured ? 'Featured' : '',
    rating: null,
    reviews: null,
    desc: it.description || '',
    img: it.icon || '📦',
    url: it.external_url || '',
    listingKind: 'catalog_active',
    regulatoryNote: clinical
      ? 'Marked clinical in the catalog — verify governance, evidence, and intended use before patient-facing use.'
      : null,
    clinicalFlag: clinical,
    apiKind: it.kind,
    source: it.source || 'deepsynaps_curated',
  };
}

export function resolveMarketplaceCatalog(apiFetchResult, demoList, apiError) {
  const items = apiFetchResult?.items;
  if (apiError || items === undefined) {
    return {
      rows: demoList,
      mode: 'demo_fallback',
      banner: {
        tone: 'warn',
        text: 'Could not reach the catalog API — showing an illustrative offline catalogue. Seller tools still use the API when available.',
      },
      apiError: apiError || null,
    };
  }
  if (Array.isArray(items) && items.length > 0) {
    return {
      rows: items.map(mapApiMarketplaceItem),
      mode: 'api_catalog',
      banner: null,
      apiError: null,
    };
  }
  return {
    rows: demoList,
    mode: 'demo_fallback_empty_api',
    banner: {
      tone: 'info',
      text: 'Server catalogue is empty — showing illustrative demo listings for discovery layout only.',
    },
    apiError: null,
  };
}

export function canManageSellerListings(role) {
  const r = String(role || '');
  return r === 'clinician' || r === 'admin' || r === 'clinic-admin' || r === 'supervisor';
}
