/**
 * pages-knowledge-explorer.js
 * DeepSynaps Knowledge Layer Dashboard
 * Displays 67 database adapters with search, filter, and detail exploration
 *
 * Color Scheme: DeepSynaps (low saturation, warm tones)
 * Primary: warm taupe/cream backgrounds with muted category colors
 */

import React, { useState, useEffect, useMemo } from "react";
import NeuroimagingLiveRegistry from "./neuroimaging-live-registry.js";

// ============================================================
// COLOR SYSTEM — DeepSynaps Warm Low-Saturation Palette
// ============================================================
const COLORS = {
  // Base
  bg: "#f5f3f0",
  cardBg: "#ffffff",
  surface: "#faf9f7",
  border: "#e8e5e1",
  borderHover: "#d4d0ca",

  // Text
  textPrimary: "#2d2a26",
  textSecondary: "#6b6560",
  textMuted: "#9a9490",
  textInverse: "#ffffff",

  // Accent
  accent: "#8a7e72",
  accentLight: "#f0ece6",
  accentHover: "#7a6e62",

  // Categories (muted, low saturation)
  neuroimaging: "#5e7a96",
  neuroimagingLight: "#e8eef3",
  neuroimagingDark: "#4a6278",

  genetics: "#5e8a6e",
  geneticsLight: "#e6f0e9",
  geneticsDark: "#4a6e56",

  pharma: "#7a6a8e",
  pharmaLight: "#eee8f3",
  pharmaDark: "#5e5070",

  evidence: "#b8895e",
  evidenceLight: "#f5ebe3",
  evidenceDark: "#8e6a48",

  adverse: "#a66b6b",
  adverseLight: "#f3e5e5",
  adverseDark: "#7a4e4e",

  others: "#8a8580",
  othersLight: "#ebe9e6",
  othersDark: "#6a6560",

  // Access types
  free: "#5e8a6e",
  register: "#5e7a96",
  academic: "#b8895e",
  restricted: "#a66b6b",
  licensed: "#7a6a8e",

  // Status
  active: "#5e8a6e",
  beta: "#b8895e",
  pending: "#8a8580",
  deprecated: "#a66b6b",
};

// Category configuration
const CATEGORIES = {
  Neuroimaging: {
    key: "Neuroimaging",
    color: COLORS.neuroimaging,
    colorLight: COLORS.neuroimagingLight,
    colorDark: COLORS.neuroimagingDark,
    count: 18,
  },
  Genetics: {
    key: "Genetics",
    color: COLORS.genetics,
    colorLight: COLORS.geneticsLight,
    colorDark: COLORS.geneticsDark,
    count: 14,
  },
  Pharma: {
    key: "Pharma",
    color: COLORS.pharma,
    colorLight: COLORS.pharmaLight,
    colorDark: COLORS.pharmaDark,
    count: 11,
  },
  Evidence: {
    key: "Evidence",
    color: COLORS.evidence,
    colorLight: COLORS.evidenceLight,
    colorDark: COLORS.evidenceDark,
    count: 12,
  },
  "Adverse Events": {
    key: "Adverse Events",
    color: COLORS.adverse,
    colorLight: COLORS.adverseLight,
    colorDark: COLORS.adverseDark,
    count: 6,
  },
  Others: {
    key: "Others",
    color: COLORS.others,
    colorLight: COLORS.othersLight,
    colorDark: COLORS.othersDark,
    count: 6,
  },
};

const ACCESS_TYPES = ["Free/Open", "Register", "Academic", "Restricted", "Licensed"];
const PHASES = ["P1", "P2", "P3"];
const DATA_TYPES = [
  "Imaging",
  "Genomic",
  "Clinical",
  "Literature",
  "Drug",
  "Phenotypic",
  "Proteomic",
  "Metabolomic",
  "Registry",
  "Ontology",
];

// ============================================================
// ICON COMPONENTS (SVG — no emojis)
// ============================================================

const Icons = {
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),

  Filter: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),

  Grid: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),

  List: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),

  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),

  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),

  ChevronUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),

  Database: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),

  Brain: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  ),

  Dna: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 15 5.7-5.7a2.1 2.1 0 0 1 3 0l2.3 2.3a2.1 2.1 0 0 0 3 0l4-4" />
      <path d="m2 9 5.7 5.7a2.1 2.1 0 0 0 3 0l2.3-2.3a2.1 2.1 0 0 1 3 0l4 4" />
      <path d="M6 22V10.6" />
      <path d="M18 22V10.6" />
      <path d="m2 15 5.7-5.7a2.1 2.1 0 0 1 3 0l2.3 2.3a2.1 2.1 0 0 0 3 0l4-4" />
    </svg>
  ),

  Pill: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  ),

  FileText: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),

  AlertTriangle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),

  MoreHorizontal: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  ),

  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),

  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),

  Layers: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),

  Activity: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),

  Zap: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),

  Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),

  ExternalLink: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),

  Lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),

  Unlock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),

  User: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),

  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),

  BarChart: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),

  Code: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
};

// ============================================================
// ADAPTER DATA — 67 Database Adapters
// ============================================================

const ADAPTERS = [
  // === NEUROIMAGING (18) ===
  {
    id: 1, name: "ADNI", category: "Neuroimaging", phase: "P3", access: "Register",
    dataTypes: ["Imaging", "Clinical", "Phenotypic"], status: "active",
    description: "Alzheimer's Disease Neuroimaging Initiative. Longitudinal MRI and PET imaging data with biomarkers and clinical assessments for Alzheimer's research.",
    rateLimit: "100 requests/hour", records: "2,000+ subjects",
    apiEndpoint: "https://adni.loni.usc.edu/api/v1",
    sampleQuery: "GET /subjects?diagnosis=AD&modality=MRI",
    documentation: "https://adni.loni.usc.edu/data-samples/access-data/",
    provenance: "NIH/NIA funded consortium",
    confidence: 0.96,
  },
  {
    id: 2, name: "AIBL", category: "Neuroimaging", phase: "P3", access: "Academic",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Australian Imaging, Biomarker and Lifestyle Flagship Study of Ageing. Research dataset with MRI, PET, and cognitive data.",
    rateLimit: "On request", records: "1,300+ participants",
    apiEndpoint: "https://aibl.csiro.au/api",
    sampleQuery: "POST /query/cohort {age: [65,85]}",
    documentation: "https://aibl.csiro.au/research/access-data",
    provenance: "CSIRO Australia / University of Melbourne",
    confidence: 0.92,
  },
  {
    id: 3, name: "OASIS", category: "Neuroimaging", phase: "P1", access: "Free/Open",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Open Access Series of Imaging Studies. Open neuroimaging dataset with cross-sectional and longitudinal MRI data across the adult lifespan.",
    rateLimit: "Unlimited", records: "1,100+ sessions",
    apiEndpoint: "https://www.oasis-brains.org/api",
    sampleQuery: "GET /data/subjects?project=OASIS3",
    documentation: "https://www.oasis-brains.org/#data",
    provenance: "Washington University / NIH",
    confidence: 0.95,
  },
  {
    id: 4, name: "UK Biobank Brain", category: "Neuroimaging", phase: "P3", access: "Restricted",
    dataTypes: ["Imaging", "Genomic", "Clinical", "Phenotypic"], status: "active",
    description: "UK Biobank Brain Imaging. Large-scale population brain imaging (MRI, fMRI, DTI) linked to genetic and health records for 50,000+ participants.",
    rateLimit: "Project-based", records: "50,000+ scans",
    apiEndpoint: "https://biobank.ndph.ox.ac.uk/showcase/",
    sampleQuery: "GET /imaging/series?field=20263",
    documentation: "https://biobank.ndph.ox.ac.uk/showcase/exinfo.cgi?src=Imaging",
    provenance: "UK Biobank / Oxford University",
    confidence: 0.97,
  },
  {
    id: 5, name: "HCP", category: "Neuroimaging", phase: "P3", access: "Free/Open",
    dataTypes: ["Imaging", "Phenotypic"], status: "active",
    description: "Human Connectome Project. High-resolution multimodal MRI data (structural, functional, diffusion) for understanding human brain connectivity.",
    rateLimit: "Unlimited", records: "1,200+ subjects",
    apiEndpoint: "https://db.humanconnectome.org/api",
    sampleQuery: "GET /datapackages?project=HCP_1200",
    documentation: "https://www.humanconnectome.org/access-data/",
    provenance: "NIH / Washington University / U Minnesota",
    confidence: 0.94,
  },
  {
    id: 6, name: "OpenNeuro", category: "Neuroimaging", phase: "P3", access: "Register",
    dataTypes: ["Imaging"], status: "active",
    description: "Free and open platform for sharing neuroimaging (primarily MRI) data in BIDS format. Includes datasets from hundreds of studies worldwide.",
    rateLimit: "Unlimited", records: "700+ datasets",
    apiEndpoint: "https://openneuro.org/api",
    sampleQuery: "GET /datasets?modality=bold&tasks=rest",
    documentation: "https://docs.openneuro.org",
    provenance: "Stanford / Poldrack Lab / Squishymedia",
    confidence: 0.93,
  },
  {
    id: 7, name: "NeuroVault", category: "Neuroimaging", phase: "P1", access: "Free/Open",
    dataTypes: ["Imaging"], status: "active",
    description: "Repository for sharing unthresholded statistical brain maps (fMRI, PET, etc.). Supports meta-analyses and decoding.",
    rateLimit: "500 requests/hour", records: "50,000+ maps",
    apiEndpoint: "https://neurovault.org/api",
    sampleQuery: "GET /api/collections?name=language",
    documentation: "https://neurovault.org/api-docs",
    provenance: "Stanford / INCF",
    confidence: 0.88,
  },
  {
    id: 8, name: "Brain-CODE", category: "Neuroimaging", phase: "P1", access: "Academic",
    dataTypes: ["Imaging", "Genomic", "Clinical"], status: "active",
    description: "Brain Centre for Ontario Data Exploration. Repository for neuroscience data from Ontario Brain Institute-funded programs.",
    rateLimit: "On request", records: "100,000+ records",
    apiEndpoint: "https://brain-code.ca/api",
    sampleQuery: "GET /datasets?program=ONDRI",
    documentation: "https://brain-code.ca/data-access",
    provenance: "Ontario Brain Institute",
    confidence: 0.87,
  },
  {
    id: 9, name: "NITRC", category: "Neuroimaging", phase: "P3", access: "Free/Open",
    dataTypes: ["Imaging"], status: "active",
    description: "Neuroimaging Informatics Tools and Resources Clearinghouse. Repository of neuroimaging software tools and datasets.",
    rateLimit: "Unlimited", records: "5,000+ tools",
    apiEndpoint: "https://www.nitrc.org/api",
    sampleQuery: "GET /projects?category=fmri",
    documentation: "https://www.nitrc.org/documentation",
    provenance: "NIH / NIBIB",
    confidence: 0.89,
  },
  {
    id: 10, name: "FCON1000", category: "Neuroimaging", phase: "P3", access: "Register",
    dataTypes: ["Imaging"], status: "deprecated",
    description: "1000 Functional Connectomes Project. Large-scale resting-state fMRI dataset aggregated from multi-site collaborations. Now part of OpenNeuro.",
    rateLimit: "Unlimited", records: "1,400+ subjects",
    apiEndpoint: "https://www.nitrc.org/projects/fcon_1000",
    sampleQuery: "GET /projects/fcon_1000/subjects",
    documentation: "https://www.nitrc.org/plugins/mwiki/index.php/fcon_1000",
    provenance: "NYU Langone / INCF",
    confidence: 0.82,
  },
  {
    id: 11, name: "ABCD Study", category: "Neuroimaging", phase: "P3", access: "Restricted",
    dataTypes: ["Imaging", "Genomic", "Clinical", "Phenotypic"], status: "active",
    description: "Adolescent Brain Cognitive Development Study. Longitudinal study of child development with MRI, genetics, and behavioral data.",
    rateLimit: "Project-based", records: "11,000+ youth",
    apiEndpoint: "https://abcdstudy.org/api",
    sampleQuery: "GET /data/ndar?collection=ABCD",
    documentation: "https://abcdstudy.org/science/",
    provenance: "NIH / NIDA",
    confidence: 0.96,
  },
  {
    id: 12, name: "IXI Dataset", category: "Neuroimaging", phase: "P1", access: "Academic",
    dataTypes: ["Imaging"], status: "active",
    description: "Information eXtraction from Images dataset. MR brain images from ~600 normal subjects across 3 London hospitals.",
    rateLimit: "Unlimited", records: "600 subjects",
    apiEndpoint: "https://brain-development.org/ixi-dataset/",
    sampleQuery: "GET /ixi/data?modality=T1",
    documentation: "https://brain-development.org/ixi-dataset/",
    provenance: "Imperial College London / IXICO",
    confidence: 0.86,
  },
  {
    id: 13, name: "MIRIAD", category: "Neuroimaging", phase: "P1", access: "Register",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Minimal Interval Resonance Imaging in Alzheimer's Disease. Longitudinal MRI study for Alzheimer's disease progression.",
    rateLimit: "100 requests/day", records: "560 scans",
    apiEndpoint: "https://miriad.isc.cnrs.fr/api",
    sampleQuery: "GET /subjects?group=AD&interval=6months",
    documentation: "https://miriad.isc.cnrs.fr/",
    provenance: "CNRS / Imperial College",
    confidence: 0.85,
  },
  {
    id: 14, name: "DLBS", category: "Neuroimaging", phase: "P1", access: "Register",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Dallas Lifespan Brain Study. Cross-sectional and longitudinal MRI data examining brain structure/function across the adult lifespan.",
    rateLimit: "50 requests/day", records: "350 adults",
    apiEndpoint: "https://dallasbrainstudy.utdallas.edu/api",
    sampleQuery: "GET /participants?age_range=[18,90]",
    documentation: "https://dallasbrainstudy.utdallas.edu/",
    provenance: "UT Dallas / UT Southwestern",
    confidence: 0.84,
  },
  {
    id: 15, name: "GSP", category: "Neuroimaging", phase: "P1", access: "Register",
    dataTypes: ["Imaging", "Phenotypic"], status: "active",
    description: "Brain Genomics Superstruct Project. Open-access neuroimaging, behavior, and cognitive data from 1,500+ young adults.",
    rateLimit: "Unlimited", records: "1,570 participants",
    apiEndpoint: "https://neuroinformatics.harvard.edu/gsp/api",
    sampleQuery: "GET /data/release?version=3.0",
    documentation: "https://neuroinformatics.harvard.edu/gsp/",
    provenance: "Harvard University",
    confidence: 0.88,
  },
  {
    id: 16, name: "NKI-RS", category: "Neuroimaging", phase: "P3", access: "Restricted",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Nathan Kline Institute - Rockland Sample. Community-based lifespan dataset with multimodal MRI and deep phenotyping.",
    rateLimit: "Unlimited", records: "1,000+ participants",
    apiEndpoint: "https://fcon_1000.projects.nitrc.org/api",
    sampleQuery: "GET /indiv/rockland?modality=rest",
    documentation: "https://fcon_1000.projects.nitrc.org/indi/pro/nki_rs.html",
    provenance: "Nathan Kline Institute",
    confidence: 0.90,
  },
  {
    id: 17, name: "COBRE", category: "Neuroimaging", phase: "P1", access: "Free/Open",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Center for Biomedical Research Excellence. Schizophrenia neuroimaging dataset with structural and functional MRI.",
    rateLimit: "Unlimited", records: "146 subjects",
    apiEndpoint: "https://cobre.mrn.org/api",
    sampleQuery: "GET /subjects?diagnosis=schizophrenia",
    documentation: "https://fcon_1000.projects.nitrc.org/indi/retro/cobre.html",
    provenance: "Mind Research Network / UNM",
    confidence: 0.83,
  },
  {
    id: 18, name: "FBIRN", category: "Neuroimaging", phase: "P1", access: "Academic",
    dataTypes: ["Imaging", "Clinical"], status: "active",
    description: "Functional Biomedical Informatics Research Network. Multi-site fMRI and MRI dataset for schizophrenia and bipolar research.",
    rateLimit: "On approval", records: "1,000+ scans",
    apiEndpoint: "https://fbirn.usc.edu/api",
    sampleQuery: "GET /fbirn/phase3?modality=fMRI",
    documentation: "https://fbirn.usc.edu/resources/data/",
    provenance: "NIH / NIBIB / MGH",
    confidence: 0.86,
  },

  // === GENETICS (14) ===
  {
    id: 19, name: "GWAS Catalog", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Phenotypic"], status: "active",
    description: "Catalog of published genome-wide association studies. Curated associations between SNPs and traits/diseases.",
    rateLimit: "Unlimited", records: "600,000+ associations",
    apiEndpoint: "https://www.ebi.ac.uk/gwas/rest/api",
    sampleQuery: "GET /singleNucleotidePolymorphisms/rs7329174",
    documentation: "https://www.ebi.ac.uk/gwas/docs/api",
    provenance: "EMBL-EBI / NHGRI",
    confidence: 0.97,
  },
  {
    id: 20, name: "dbGaP", category: "Genetics", phase: "P3", access: "Restricted",
    dataTypes: ["Genomic", "Clinical", "Phenotypic"], status: "active",
    description: "Database of Genotypes and Phenotypes. Archive of studies examining genotype-phenotype relationships with controlled access.",
    rateLimit: "Project-based", records: "1,000+ studies",
    apiEndpoint: "https://dbgap.ncbi.nlm.nih.gov/api",
    sampleQuery: "GET /studies?disease=alzheimer",
    documentation: "https://www.ncbi.nlm.nih.gov/gap/docs/about/",
    provenance: "NCBI / NIH",
    confidence: 0.96,
  },
  {
    id: 21, name: "ClinVar", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Clinical"], status: "active",
    description: "Archive of clinically significant genomic variants with expert-curated interpretations of pathogenicity.",
    rateLimit: "3 requests/second", records: "2M+ variants",
    apiEndpoint: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
    sampleQuery: "GET /esearch.fcgi?db=clinvar&term=BRCA1",
    documentation: "https://www.ncbi.nlm.nih.gov/clinvar/docs/api/",
    provenance: "NCBI / NIH",
    confidence: 0.98,
  },
  {
    id: 22, name: "gnomAD", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic"], status: "active",
    description: "Genome Aggregation Database. Allele frequencies from large-scale sequencing of diverse human populations. Essential for variant interpretation.",
    rateLimit: "Unlimited", records: "807,000+ exomes",
    apiEndpoint: "https://gnomad.broadinstitute.org/api",
    sampleQuery: "POST /api {query: gene(bgene: BRCA1) {...}}",
    documentation: "https://gnomad.broadinstitute.org/help",
    provenance: "Broad Institute",
    confidence: 0.97,
  },
  {
    id: 23, name: "Open Targets Genetics", category: "Genetics", phase: "P1", access: "Free/Open",
    dataTypes: ["Genomic", "Clinical"], status: "active",
    description: "Open Targets Genetics Portal. GWAS evidence linking genes to diseases with fine-mapping and colocalization.",
    rateLimit: "Unlimited", records: "200,000+ trait-gene pairs",
    apiEndpoint: "https://genetics.opentargets.org/api",
    sampleQuery: "POST /graphql {genes(ensemblIds: [ENSG000...]) {...}}",
    documentation: "https://genetics-docs.opentargets.org/",
    provenance: "Open Targets / EMBL-EBI / GSK",
    confidence: 0.93,
  },
  {
    id: 24, name: "GTEx", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Proteomic"], status: "active",
    description: "Genotype-Tissue Expression Project. Tissue-specific gene expression and regulation from 948 donors across 54 tissues.",
    rateLimit: "Unlimited", records: "54 tissues, 948 donors",
    apiEndpoint: "https://gtexportal.org/api/v2",
    sampleQuery: "GET /expression/gene?gencodeId=ENSG000...",
    documentation: "https://gtexportal.org/api/index.html",
    provenance: "Broad Institute / NIH Common Fund",
    confidence: 0.96,
  },
  {
    id: 25, name: "ENCODE", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic"], status: "active",
    description: "Encyclopedia of DNA Elements. Comprehensive functional genomic elements including regulatory regions, transcription, and chromatin structure.",
    rateLimit: "Unlimited", records: "9,000+ experiments",
    apiEndpoint: "https://www.encodeproject.org/api",
    sampleQuery: "GET /search/?type=Experiment&assay=ChIP-seq",
    documentation: "https://www.encodeproject.org/help/rest-api/",
    provenance: "ENCODE Consortium / NIH",
    confidence: 0.95,
  },
  {
    id: 26, name: "RegulomeDB", category: "Genetics", phase: "P1", access: "Free/Open",
    dataTypes: ["Genomic"], status: "active",
    description: "Database annotating SNPs with known and predicted regulatory elements. Scores regulatory potential of genetic variants.",
    rateLimit: "Unlimited", records: "Million+ scored variants",
    apiEndpoint: "http://www.regulomedb.org/api",
    sampleQuery: "GET /api/regulome-search?regions=chr1:10000-10500",
    documentation: "http://www.regulomedb.org/about",
    provenance: "Stanford University / NIH",
    confidence: 0.90,
  },
  {
    id: 27, name: "PharmGKB", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Drug", "Clinical"], status: "active",
    description: "Pharmacogenomics Knowledgebase. Curated knowledge about genetic variants affecting drug response, dosing, and adverse reactions.",
    rateLimit: "Unlimited", records: "500+ drug-gene pairs",
    apiEndpoint: "https://api.pharmgkb.org/v1",
    sampleQuery: "GET /data/chemical?symbol=warfarin",
    documentation: "https://www.pharmgkb.org/page/api",
    provenance: "Stanford University / NIH",
    confidence: 0.94,
  },
  {
    id: 28, name: "GeneCards", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Clinical"], status: "active",
    description: "Comprehensive human gene compendium integrating gene-centric information from ~150 web sources.",
    rateLimit: "500 requests/day", records: "All human genes",
    apiEndpoint: "https://genecards.weizmann.ac.il/api",
    sampleQuery: "GET /api/gene?symbol=APOE",
    documentation: "https://www.genecards.org/guide",
    provenance: "Weizmann Institute of Science",
    confidence: 0.93,
  },
  {
    id: 29, name: "UniProt", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Proteomic"], status: "active",
    description: "Universal Protein Resource. Comprehensive protein sequence and annotation database including function, domains, and variants.",
    rateLimit: "Unlimited", records: "230M+ sequences",
    apiEndpoint: "https://rest.uniprot.org/uniprotkb",
    sampleQuery: "GET /search?query=organism_id:9606+AND+gene:APP",
    documentation: "https://www.uniprot.org/help/api",
    provenance: "UniProt Consortium / EMBL-EBI / SIB",
    confidence: 0.98,
  },
  {
    id: 30, name: "STRING", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Proteomic"], status: "active",
    description: "Protein-Protein Interaction Networks. Database of known and predicted protein-protein interactions with confidence scores.",
    rateLimit: "Unlimited", records: "2B+ interactions",
    apiEndpoint: "https://string-db.org/api",
    sampleQuery: "GET /json/network?identifiers=BRCA1",
    documentation: "https://string-db.org/cgi/help?subpage=api",
    provenance: "STRING Consortium / EMBL / University of Zurich",
    confidence: 0.95,
  },
  {
    id: 31, name: "BioGRID", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Proteomic"], status: "active",
    description: "Biological General Repository for Interaction Datasets. Curated protein and genetic interaction data from multiple organisms.",
    rateLimit: "Unlimited", records: "2.3M+ interactions",
    apiEndpoint: "https://webservice.thebiogrid.org",
    sampleQuery: "GET /interactions?searchNames=BRCA1",
    documentation: "https://wiki.thebiogrid.org/doku.php/api",
    provenance: "BioGRID / University of Toronto",
    confidence: 0.92,
  },
  {
    id: 32, name: "Reactome", category: "Genetics", phase: "P3", access: "Free/Open",
    dataTypes: ["Genomic", "Proteomic"], status: "active",
    description: "Curated pathway knowledgebase for human biological pathways and reactions.",
    rateLimit: "Unlimited", records: "15,000+ reactions",
    apiEndpoint: "https://reactome.org/ContentService",
    sampleQuery: "GET /data/query/enhanced/PTEN",
    documentation: "https://reactome.org/dev/content-service",
    provenance: "Reactome / OICR / NYU",
    confidence: 0.94,
  },

  // === PHARMA (11) ===
  {
    id: 33, name: "DrugBank", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug", "Clinical"], status: "active",
    description: "Comprehensive drug and drug target database. Information on drugs, mechanisms, interactions, and targets.",
    rateLimit: "Unlimited (public), 600/h (API)", records: "15,000+ drugs",
    apiEndpoint: "https://go.drugbank.com/api",
    sampleQuery: "GET /v1/drugs?q=aspirin",
    documentation: "https://docs.drugbank.com/v1/",
    provenance: "University of Alberta / OMx",
    confidence: 0.96,
  },
  {
    id: 34, name: "ChEMBL", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug", "Proteomic"], status: "active",
    description: "Manually curated chemical bioactivity database. Structure, activity, and target data for drug-like compounds.",
    rateLimit: "Unlimited", records: "2.3M+ compounds",
    apiEndpoint: "https://www.ebi.ac.uk/chembl/api/data",
    sampleQuery: "GET /molecule?pref_name__iexact=aspirin",
    documentation: "https://chembl.gitbook.io/chembl-interface-documentation/",
    provenance: "EMBL-EBI",
    confidence: 0.97,
  },
  {
    id: 35, name: "PubChem", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug"], status: "active",
    description: "World's largest collection of freely accessible chemical information from NIH.",
    rateLimit: "5 requests/second", records: "110M+ compounds",
    apiEndpoint: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    sampleQuery: "GET /compound/name/aspirin/cids/JSON",
    documentation: "https://pubchemdocs.ncbi.nlm.nih.gov/pug-rest",
    provenance: "NCBI / NIH",
    confidence: 0.98,
  },
  {
    id: 36, name: "STITCH", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug", "Proteomic"], status: "active",
    description: "Chemical-protein interaction network database. Integration of chemicals and proteins with confidence scores.",
    rateLimit: "Unlimited", records: "500K chemicals, 9.6M proteins",
    apiEndpoint: "http://stitch.embl.de/api",
    sampleQuery: "GET /json/network?identifiers=aspirin",
    documentation: "http://stitch.embl.de/cgi/help.pl?UserId=...&page=api",
    provenance: "EMBL / University of Zurich",
    confidence: 0.92,
  },
  {
    id: 37, name: "SIDER", category: "Pharma", phase: "P1", access: "Free/Open",
    dataTypes: ["Drug", "Clinical"], status: "active",
    description: "Side Effect Resource. Adverse drug reactions extracted from drug labels and public documents.",
    rateLimit: "Unlimited", records: "1,500 drugs, 5,800 side effects",
    apiEndpoint: "http://sideeffects.embl.de/api",
    sampleQuery: "GET /drugs/aspirin",
    documentation: "http://sideeffects.embl.de/about/",
    provenance: "EMBL / University of Zurich",
    confidence: 0.89,
  },
  {
    id: 38, name: "KEGG DRUG", category: "Pharma", phase: "P3", access: "Licensed",
    dataTypes: ["Drug"], status: "active",
    description: "Kyoto Encyclopedia of Genes and Genomes Drug. Approved drugs in Japan, USA, and Europe with target and pathway info.",
    rateLimit: "Academic license required", records: "11,000+ drugs",
    apiEndpoint: "https://rest.kegg.jp",
    sampleQuery: "GET /get/dr:D00109",
    documentation: "https://www.kegg.jp/kegg/rest/keggapi.html",
    provenance: "Kanehisa Laboratories / Kyoto University",
    confidence: 0.95,
  },
  {
    id: 39, name: "DailyMed", category: "Pharma", phase: "P3", access: "Register",
    dataTypes: ["Drug", "Clinical"], status: "active",
    description: "FDA's official repository of drug labeling information. Current prescribing information for marketed drugs.",
    rateLimit: "Unlimited", records: "100,000+ labels",
    apiEndpoint: "https://dailymed.nlm.nih.gov/dailymed/services",
    sampleQuery: "GET /v2/spls.json?drug_name=aspirin",
    documentation: "https://dailymed.nlm.nih.gov/dailymed/app-support.webmd",
    provenance: "NLM / FDA",
    confidence: 0.97,
  },
  {
    id: 40, name: "RxNorm", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug"], status: "active",
    description: "Normalized naming system for clinical drugs. Links drug names from many sources to clinical vocabularies.",
    rateLimit: "Unlimited", records: "100,000+ concepts",
    apiEndpoint: "https://rxnav.nlm.nih.gov/REST",
    sampleQuery: "GET /drugs?name=aspirin",
    documentation: "https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getDrugs.html",
    provenance: "NLM / NIH",
    confidence: 0.96,
  },
  {
    id: 41, name: "ATC/DDD", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug"], status: "active",
    description: "Anatomical Therapeutic Chemical classification with Defined Daily Doses. WHO standard for drug classification.",
    rateLimit: "Unlimited", records: "5,000+ codes",
    apiEndpoint: "https://www.whocc.no/api",
    sampleQuery: "GET /atc_ddd_index/?code=N02BE01",
    documentation: "https://www.whocc.no/atc_ddd_index/",
    provenance: "WHO Collaborating Centre",
    confidence: 0.94,
  },
  {
    id: 42, name: "Orange Book", category: "Pharma", phase: "P1", access: "Free/Open",
    dataTypes: ["Drug"], status: "active",
    description: "FDA Approved Drug Products with Therapeutic Equivalence Evaluations. Patent and exclusivity information.",
    rateLimit: "Unlimited", records: "30,000+ products",
    apiEndpoint: "https://www.accessdata.fda.gov/scripts/cder/ob/api",
    sampleQuery: "GET /api/product?proprietary_name=aspirin",
    documentation: "https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files",
    provenance: "FDA / CDER",
    confidence: 0.95,
  },
  {
    id: 43, name: "FDA NDC", category: "Pharma", phase: "P3", access: "Free/Open",
    dataTypes: ["Drug"], status: "active",
    description: "National Drug Code Directory. FDA's database of all drugs manufactured for commercial distribution.",
    rateLimit: "Unlimited", records: "300,000+ products",
    apiEndpoint: "https://api.fda.gov/drug/ndc.json",
    sampleQuery: "GET ?search=brand_name:aspirin&limit=10",
    documentation: "https://open.fda.gov/apis/drug/ndc/",
    provenance: "FDA / openFDA",
    confidence: 0.97,
  },

  // === EVIDENCE (12) ===
  {
    id: 44, name: "PubMed / MEDLINE", category: "Evidence", phase: "P3", access: "Free/Open",
    dataTypes: ["Literature"], status: "active",
    description: "Premier biomedical literature database from NLM. 35M+ citations from life science journals.",
    rateLimit: "3 requests/second", records: "35M+ citations",
    apiEndpoint: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
    sampleQuery: "GET /esearch.fcgi?db=pubmed&term=alzheimer+therapy",
    documentation: "https://www.ncbi.nlm.nih.gov/books/NBK25501/",
    provenance: "NLM / NIH",
    confidence: 0.99,
  },
  {
    id: 45, name: "Cochrane Library", category: "Evidence", phase: "P3", access: "Licensed",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "Gold-standard systematic reviews and meta-analyses for evidence-based healthcare decisions.",
    rateLimit: "Institutional license", records: "10,000+ reviews",
    apiEndpoint: "https://www.cochranelibrary.com/api",
    sampleQuery: "GET /search?p_p_id=search&query=stroke+prevention",
    documentation: "https://www.cochranelibrary.com/about",
    provenance: "Cochrane Collaboration / Wiley",
    confidence: 0.97,
  },
  {
    id: 46, name: "EMBASE", category: "Evidence", phase: "P3", access: "Licensed",
    dataTypes: ["Literature"], status: "active",
    description: "Biomedical and pharmacological literature database from Elsevier. Strong drug and disease coverage.",
    rateLimit: "Institutional license", records: "32M+ records",
    apiEndpoint: "https://api.elsevier.com/content/embase",
    sampleQuery: "GET /search?query=alzheimer+disease+therapy",
    documentation: "https://dev.elsevier.com/",
    provenance: "Elsevier",
    confidence: 0.96,
  },
  {
    id: 47, name: "ClinicalTrials.gov", category: "Evidence", phase: "P3", access: "Restricted",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "World's largest clinical trial registry. Study protocols, results, and locations from 200+ countries.",
    rateLimit: "Unlimited", records: "480,000+ studies",
    apiEndpoint: "https://clinicaltrials.gov/api/v2",
    sampleQuery: "GET /studies?query.cond=alzheimer+disease",
    documentation: "https://clinicaltrials.gov/data-api/api",
    provenance: "NLM / NIH",
    confidence: 0.97,
  },
  {
    id: 48, name: "WHO ICTRP", category: "Evidence", phase: "P3", access: "Free/Open",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "International Clinical Trials Registry Platform. Aggregates clinical trial data from registries worldwide.",
    rateLimit: "Unlimited", records: "800,000+ trials",
    apiEndpoint: "https://apps.who.int/trailsr/api",
    sampleQuery: "GET /search?query=alzheimer&recruitment=recruiting",
    documentation: "https://www.who.int/clinical-trials-registry-platform",
    provenance: "World Health Organization",
    confidence: 0.94,
  },
  {
    id: 49, name: "EU CTR", category: "Evidence", phase: "P2", access: "Free/Open",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "EU Clinical Trials Register. All clinical trials conducted in the European Union.",
    rateLimit: "Unlimited", records: "40,000+ trials",
    apiEndpoint: "https://www.clinicaltrialsregister.eu/api",
    sampleQuery: "GET /search?query=cancer+immunotherapy",
    documentation: "https://www.clinicaltrialsregister.eu/about.html",
    provenance: "EMA / EU",
    confidence: 0.93,
  },
  {
    id: 50, name: "bioRxiv", category: "Evidence", phase: "P1", access: "Academic",
    dataTypes: ["Literature"], status: "active",
    description: "Preprint server for biology. Rapid dissemination of biological research before peer review.",
    rateLimit: "Unlimited", records: "200,000+ preprints",
    apiEndpoint: "https://api.biorxiv.org",
    sampleQuery: "GET /details/biorxiv/2023-01-01/2023-12-31/100",
    documentation: "https://api.biorxiv.org/",
    provenance: "Cold Spring Harbor Laboratory",
    confidence: 0.88,
  },
  {
    id: 51, name: "medRxiv", category: "Evidence", phase: "P1", access: "Free/Open",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "Preprint server for health sciences. Preprints in medicine, clinical research, and related fields.",
    rateLimit: "Unlimited", records: "50,000+ preprints",
    apiEndpoint: "https://api.medrxiv.org",
    sampleQuery: "GET /details/medrxiv/2023-01-01/2023-12-31/50",
    documentation: "https://api.medrxiv.org/",
    provenance: "Cold Spring Harbor Laboratory / BMJ / Yale",
    confidence: 0.87,
  },
  {
    id: 52, name: "Epistemonikos", category: "Evidence", phase: "P2", access: "Restricted",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "Database of systematic reviews with translated abstracts and structured summaries in multiple languages.",
    rateLimit: "Unlimited", records: "150,000+ systematic reviews",
    apiEndpoint: "https://www.epistemonikos.org/api",
    sampleQuery: "GET /search?query=depression+treatment",
    documentation: "https://www.epistemonikos.org/en/about_us",
    provenance: "Epistemonikos Foundation",
    confidence: 0.91,
  },
  {
    id: 53, name: "Trip Database", category: "Evidence", phase: "P2", access: "Register",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "Clinical search engine designed to quickly identify the best available evidence for practice.",
    rateLimit: "Unlimited", records: "Indexed from 100+ sources",
    apiEndpoint: "https://www.tripdatabase.com/api",
    sampleQuery: "GET /search?criteria=hypertension+guidelines",
    documentation: "https://www.tripdatabase.com/",
    provenance: "Trip Database Ltd / Wales",
    confidence: 0.89,
  },
  {
    id: 54, name: "NICE Evidence", category: "Evidence", phase: "P1", access: "Licensed",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "UK National Institute for Health and Care Excellence evidence search. Guidelines, pathways, and technology appraisals.",
    rateLimit: "Unlimited", records: "Millions of records",
    apiEndpoint: "https://www.evidence.nhs.uk/api",
    sampleQuery: "GET /search?q=diabetes+management",
    documentation: "https://www.evidence.nhs.uk/",
    provenance: "NHS England / NICE",
    confidence: 0.93,
  },
  {
    id: 55, name: "BMJ Best Practice", category: "Evidence", phase: "P2", access: "Licensed",
    dataTypes: ["Literature", "Clinical"], status: "active",
    description: "Point-of-care clinical decision support with evidence-based treatment recommendations and calculators.",
    rateLimit: "Institutional license", records: "1,000+ topics",
    apiEndpoint: "https://bestpractice.bmj.com/api",
    sampleQuery: "GET /topics?search=atrial+fibrillation",
    documentation: "https://bestpractice.bmj.com/info/",
    provenance: "BMJ Publishing Group",
    confidence: 0.94,
  },

  // === ADVERSE EVENTS (6) ===
  {
    id: 56, name: "FAERS", category: "Adverse Events", phase: "P3", access: "Free/Open",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "FDA Adverse Event Reporting System. Post-marketing safety surveillance reports for drugs and biologics.",
    rateLimit: "Unlimited", records: "25M+ reports",
    apiEndpoint: "https://api.fda.gov/drug/event.json",
    sampleQuery: "GET ?search=patient.drug.medicinalproduct:aspirin",
    documentation: "https://open.fda.gov/apis/drug/event/",
    provenance: "FDA / openFDA",
    confidence: 0.95,
  },
  {
    id: 57, name: "VAERS", category: "Adverse Events", phase: "P3", access: "Free/Open",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "Vaccine Adverse Event Reporting System. US national post-marketing vaccine safety surveillance program.",
    rateLimit: "Unlimited", records: "1M+ reports",
    apiEndpoint: "https://vaers.hhs.gov/data/api",
    sampleQuery: "GET /data/download?year=2023",
    documentation: "https://vaers.hhs.gov/data.html",
    provenance: "CDC / FDA / HHS",
    confidence: 0.94,
  },
  {
    id: 58, name: "WHO VigiBase", category: "Adverse Events", phase: "P3", access: "Restricted",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "WHO Global ICR Database for Adverse Drug Reactions. World's largest ADR database with 35M+ reports.",
    rateLimit: "National pharmacovigilance access", records: "35M+ reports",
    apiEndpoint: "https://www.who-umc.org/api/vigibase",
    sampleQuery: "POST /vigisearch {drug: paracetamol, reaction: hepatotoxicity}",
    documentation: "https://www.who-umc.org/vigibase/vigisearch/",
    provenance: "Uppsala Monitoring Centre / WHO",
    confidence: 0.96,
  },
  {
    id: 59, name: "EudraVigilance", category: "Adverse Events", phase: "P2", access: "Restricted",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "European database of suspected adverse reactions to medicines. EU regulatory pharmacovigilance system.",
    rateLimit: "MAH/regulatory access", records: "25M+ reports",
    apiEndpoint: "https://www.ema.europa.eu/api/ev",
    sampleQuery: "GET /adr-reports?product=covid-19+vaccine",
    documentation: "https://www.ema.europa.eu/en/human-regulatory/research-development/",
    provenance: "EMA / European Union",
    confidence: 0.94,
  },
  {
    id: 60, name: "Canada Vigilance", category: "Adverse Events", phase: "P2", access: "Academic",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "Canadian Adverse Reaction Online Database. Reports of suspected adverse reactions to health products in Canada.",
    rateLimit: "Unlimited", records: "500,000+ reports",
    apiEndpoint: "https://health-products.canada.ca/api",
    sampleQuery: "GET /adr?drug_name=metformin",
    documentation: "https://www.canada.ca/en/health-canada/services/drugs-health-products/",
    provenance: "Health Canada",
    confidence: 0.91,
  },
  {
    id: 61, name: "MedWatch", category: "Adverse Events", phase: "P2", access: "Free/Open",
    dataTypes: ["Registry", "Clinical"], status: "active",
    description: "FDA Safety Information and Adverse Event Reporting Program. Portal for reporting and querying safety alerts.",
    rateLimit: "Unlimited", records: "Thousands of alerts",
    apiEndpoint: "https://www.fda.gov/safety/medwatch/api",
    sampleQuery: "GET /safety-alerts?product=drug&year=2024",
    documentation: "https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program",
    provenance: "FDA",
    confidence: 0.93,
  },

  // === OTHERS (6) ===
  {
    id: 62, name: "OMIM", category: "Others", phase: "P3", access: "Register",
    dataTypes: ["Genomic", "Clinical", "Ontology"], status: "active",
    description: "Online Mendelian Inheritance in Man. Authoritative compendium of human genes and genetic phenotypes.",
    rateLimit: "5 requests/minute (registered)", records: "25,000+ entries",
    apiEndpoint: "https://api.omim.org/api",
    sampleQuery: "GET /entry/search?search=alzheimer",
    documentation: "https://www.omim.org/help/api",
    provenance: "Johns Hopkins / NHGRI",
    confidence: 0.97,
  },
  {
    id: 63, name: "Orphanet", category: "Others", phase: "P3", access: "Free/Open",
    dataTypes: ["Clinical", "Ontology"], status: "active",
    description: "Reference portal for rare diseases and orphan drugs. Knowledge base for diagnostic and care pathways.",
    rateLimit: "Unlimited", records: "6,000+ rare diseases",
    apiEndpoint: "http://www.orpha.net/sparql",
    sampleQuery: "SELECT ?disease WHERE {?disease a orpha:RareDisease}",
    documentation: "https://www.orpha.net/consor/cgi-bin/about.php",
    provenance: "INSERM / French Ministry of Health",
    confidence: 0.95,
  },
  {
    id: 64, name: "ICD-10/11", category: "Others", phase: "P3", access: "Free/Open",
    dataTypes: ["Ontology", "Clinical"], status: "active",
    description: "International Classification of Diseases. WHO standard diagnostic tool for epidemiology and health management.",
    rateLimit: "Unlimited", records: "55,000+ codes",
    apiEndpoint: "https://id.who.int/icd/api",
    sampleQuery: "GET /entity/1435254666",
    documentation: "https://icd.who.int/icdapi",
    provenance: "World Health Organization",
    confidence: 0.98,
  },
  {
    id: 65, name: "SNOMED CT", category: "Others", phase: "P3", access: "Licensed",
    dataTypes: ["Ontology", "Clinical"], status: "active",
    description: "Systematized Nomenclature of Medicine Clinical Terms. Most comprehensive clinical healthcare terminology.",
    rateLimit: "License required", records: "350,000+ concepts",
    apiEndpoint: "https://browser.ihtsdotools.org/api/v2",
    sampleQuery: "GET /snomed/ct/v2/concepts?s=hypertension",
    documentation: "https://confluence.ihtsdotools.org/",
    provenance: "SNOMED International / IHTSDO",
    confidence: 0.97,
  },
  {
    id: 66, name: "LOINC", category: "Others", phase: "P3", access: "Free/Open",
    dataTypes: ["Ontology", "Clinical"], status: "active",
    description: "Logical Observation Identifiers Names and Codes. Standard for identifying laboratory and clinical observations.",
    rateLimit: "Unlimited", records: "100,000+ terms",
    apiEndpoint: "https://loinc.org/api",
    sampleQuery: "GET /search?query=glucose+blood",
    documentation: "https://loinc.org/get-started/loinc-terms-api/",
    provenance: "Regenstrief Institute",
    confidence: 0.96,
  },
  {
    id: 67, name: "UMLS", category: "Others", phase: "P3", access: "Register",
    dataTypes: ["Ontology", "Clinical"], status: "active",
    description: "Unified Medical Language System. Integrates and distributes key terminology, classification, and coding standards.",
    rateLimit: "UTS license required", records: "4M+ concepts",
    apiEndpoint: "https://uts-ws.nlm.nih.gov/rest",
    sampleQuery: "GET /search/current?string=hypertension&sabs=SNOMEDCT_US",
    documentation: "https://documentation.uts.nlm.nih.gov/",
    provenance: "NLM / NIH",
    confidence: 0.96,
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCategoryColor(category) {
  return CATEGORIES[category]?.color || COLORS.others;
}

function getCategoryLightColor(category) {
  return CATEGORIES[category]?.colorLight || COLORS.othersLight;
}

function getCategoryDarkColor(category) {
  return CATEGORIES[category]?.colorDark || COLORS.othersDark;
}

function getAccessColor(access) {
  const map = {
    "Free/Open": COLORS.free,
    "Register": COLORS.register,
    "Academic": COLORS.academic,
    "Restricted": COLORS.restricted,
    "Licensed": COLORS.licensed,
  };
  return map[access] || COLORS.others;
}

function getAccessIcon(access) {
  switch (access) {
    case "Free/Open": return <Icons.Unlock />;
    case "Register": return <Icons.User />;
    case "Academic": return <Icons.FileText />;
    case "Restricted": return <Icons.Lock />;
    case "Licensed": return <Icons.Lock />;
    default: return <Icons.Database />;
  }
}

function getStatusBadge(status) {
  const styles = {
    active: { bg: "#e6f0e9", color: COLORS.active, label: "Active" },
    beta: { bg: "#f5ebe3", color: COLORS.beta, label: "Beta" },
    pending: { bg: "#ebe9e6", color: COLORS.pending, label: "Pending" },
    deprecated: { bg: "#f3e5e5", color: COLORS.deprecated, label: "Legacy" },
  };
  const s = styles[status] || styles.pending;
  return { ...s, label: s.label };
}

function getPhaseBadge(phase) {
  const styles = {
    P1: { bg: "#f0ece6", color: COLORS.accent, label: "P1" },
    P2: { bg: "#e8eef3", color: COLORS.neuroimaging, label: "P2" },
    P3: { bg: "#e6f0e9", color: COLORS.genetics, label: "P3" },
  };
  return styles[phase] || styles.P1;
}

function getCategoryIcon(category) {
  switch (category) {
    case "Neuroimaging": return <Icons.Brain />;
    case "Genetics": return <Icons.Dna />;
    case "Pharma": return <Icons.Pill />;
    case "Evidence": return <Icons.FileText />;
    case "Adverse Events": return <Icons.AlertTriangle />;
    default: return <Icons.MoreHorizontal />;
  }
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

// --- Category Summary Bar ---
function CategorySummaryBar({ selectedCategory, onSelectCategory }) {
  return (
    <div style={styles.categoryBar}>
      {Object.values(CATEGORIES).map((cat) => {
        const isSelected = selectedCategory === cat.key;
        return (
          <button
            key={cat.key}
            onClick={() => onSelectCategory(isSelected ? "" : cat.key)}
            style={{
              ...styles.categoryBarItem,
              borderColor: isSelected ? cat.colorDark : "transparent",
              backgroundColor: isSelected ? cat.colorLight : "transparent",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: cat.color,
                display: "inline-block",
                marginRight: 8,
                flexShrink: 0,
              }}
            />
            <span style={styles.categoryBarName}>{cat.key}</span>
            <span
              style={{
                ...styles.categoryBarCount,
                backgroundColor: isSelected ? cat.color : COLORS.textMuted,
                color: COLORS.textInverse,
              }}
            >
              {cat.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- Search Panel ---
function SearchPanel({
  searchQuery,
  onSearchChange,
  selectedAdapters,
  onToggleAdapter,
  onSearchExecute,
  searchResults,
  isSearching,
  filteredAdapters,
}) {
  const [showAdapterSelect, setShowAdapterSelect] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  const handleSelectAll = () => {
    if (selectAll) {
      selectedAdapters.forEach((id) => onToggleAdapter(id));
    } else {
      filteredAdapters.forEach((a) => {
        if (!selectedAdapters.includes(a.id)) onToggleAdapter(a.id);
      });
    }
    setSelectAll(!selectAll);
  };

  return (
    <div style={styles.searchPanel}>
      <div style={styles.searchHeader}>
        <Icons.Search />
        <span style={styles.searchTitle}>Cross-Adapter Search</span>
      </div>

      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="Search across selected adapters..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchExecute()}
          style={styles.searchInput}
        />
        <button onClick={onSearchExecute} style={styles.searchButton}>
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      <div style={styles.adapterSelectSection}>
        <button
          onClick={() => setShowAdapterSelect(!showAdapterSelect)}
          style={styles.adapterSelectToggle}
        >
          <Icons.Layers />
          <span>
            {selectedAdapters.length > 0
              ? `${selectedAdapters.length} adapter${selectedAdapters.length !== 1 ? "s" : ""} selected`
              : "Select target adapters"}
          </span>
          {showAdapterSelect ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
        </button>

        {showAdapterSelect && (
          <div style={styles.adapterDropdown}>
            <div style={styles.adapterDropdownHeader}>
              <button onClick={handleSelectAll} style={styles.selectAllBtn}>
                {selectAll ? "Deselect All" : "Select All Visible"}
              </button>
            </div>
            <div style={styles.adapterDropdownList}>
              {filteredAdapters.map((adapter) => (
                <label key={adapter.id} style={styles.adapterDropdownItem}>
                  <input
                    type="checkbox"
                    checked={selectedAdapters.includes(adapter.id)}
                    onChange={() => onToggleAdapter(adapter.id)}
                    style={styles.checkbox}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: getCategoryColor(adapter.category),
                      display: "inline-block",
                      marginRight: 8,
                      flexShrink: 0,
                    }}
                  />
                  <span style={styles.adapterDropdownName}>{adapter.name}</span>
                  <span style={styles.adapterDropdownCategory}>{adapter.category}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {searchResults.length > 0 && (
        <div style={styles.searchResults}>
          <div style={styles.searchResultsHeader}>
            <Icons.BarChart />
            <span style={styles.searchResultsTitle}>
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
            </span>
          </div>
          <div style={styles.searchResultsList}>
            {searchResults.map((result, idx) => (
              <div key={idx} style={styles.searchResultItem}>
                <div style={styles.searchResultTop}>
                  <span style={styles.searchResultName}>{result.name}</span>
                  <span
                    style={{
                      ...styles.searchResultCategory,
                      backgroundColor: getCategoryLightColor(result.category),
                      color: getCategoryDarkColor(result.category),
                    }}
                  >
                    {result.category}
                  </span>
                </div>
                <p style={styles.searchResultDesc}>{result.description}</p>
                <div style={styles.searchResultMeta}>
                  <span style={styles.searchResultConfidence}>
                    Confidence: {(result.confidence * 100).toFixed(0)}%
                  </span>
                  <span style={styles.searchResultProvenance}>
                    Source: {result.provenance}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Filter Bar ---
function FilterBar({
  selectedPhase,
  onPhaseChange,
  selectedAccess,
  onAccessChange,
  selectedDataType,
  onDataTypeChange,
  onClearFilters,
  hasActiveFilters,
}) {
  return (
    <div style={styles.filterBar}>
      <div style={styles.filterGroup}>
        <Icons.Filter />
        <select
          value={selectedPhase}
          onChange={(e) => onPhaseChange(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Phases</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={selectedAccess}
          onChange={(e) => onAccessChange(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Access Types</option>
          {ACCESS_TYPES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={selectedDataType}
          onChange={(e) => onDataTypeChange(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Data Types</option>
          {DATA_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      {hasActiveFilters && (
        <button onClick={onClearFilters} style={styles.clearFiltersBtn}>
          <Icons.X /> Clear Filters
        </button>
      )}
    </div>
  );
}

// --- Adapter Card ---
function AdapterCard({ adapter, onClick }) {
  const catColor = getCategoryColor(adapter.category);
  const catLight = getCategoryLightColor(adapter.category);
  const statusBadge = getStatusBadge(adapter.status);
  const phaseBadge = getPhaseBadge(adapter.phase);

  return (
    <div
      onClick={() => onClick(adapter)}
      style={{
        ...styles.adapterCard,
        borderLeftColor: catColor,
      }}
    >
      <div style={styles.adapterCardHeader}>
        <div style={{ ...styles.adapterCardIcon, backgroundColor: catLight, color: catColor }}>
          {getCategoryIcon(adapter.category)}
        </div>
        <div style={styles.adapterCardMeta}>
          <span style={{ ...styles.statusBadge, backgroundColor: statusBadge.bg, color: statusBadge.color }}>
            {statusBadge.label}
          </span>
          <span style={{ ...styles.phaseBadge, backgroundColor: phaseBadge.bg, color: phaseBadge.color }}>
            {phaseBadge.label}
          </span>
        </div>
      </div>

      <h3 style={styles.adapterCardName}>{adapter.name}</h3>
      <p style={styles.adapterCardDesc}>{adapter.description.substring(0, 100)}...</p>

      <div style={styles.adapterCardFooter}>
        <span style={{ ...styles.accessBadge, color: getAccessColor(adapter.access) }}>
          {getAccessIcon(adapter.access)}
          <span style={{ marginLeft: 4 }}>{adapter.access}</span>
        </span>
        <span style={styles.recordsText}>{adapter.records}</span>
      </div>

      <div style={styles.adapterCardDataTypes}>
        {adapter.dataTypes.map((dt) => (
          <span key={dt} style={styles.dataTypeTag}>{dt}</span>
        ))}
      </div>
    </div>
  );
}

// --- Adapter Grid ---
function AdapterGrid({ adapters, onCardClick }) {
  return (
    <div style={styles.adapterGrid}>
      {adapters.map((adapter) => (
        <AdapterCard key={adapter.id} adapter={adapter} onClick={onCardClick} />
      ))}
    </div>
  );
}

// --- Adapter Detail Modal ---
function AdapterDetailModal({ adapter, onClose }) {
  if (!adapter) return null;

  const catColor = getCategoryColor(adapter.category);
  const catLight = getCategoryLightColor(adapter.category);
  const statusBadge = getStatusBadge(adapter.status);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ ...styles.modalIcon, backgroundColor: catLight, color: catColor }}>
            {getCategoryIcon(adapter.category)}
          </div>
          <div style={styles.modalHeaderText}>
            <h2 style={styles.modalTitle}>{adapter.name}</h2>
            <div style={styles.modalHeaderMeta}>
              <span style={{ ...styles.statusBadge, backgroundColor: statusBadge.bg, color: statusBadge.color }}>
                {statusBadge.label}
              </span>
              <span
                style={{
                  ...styles.modalCategoryBadge,
                  backgroundColor: catLight,
                  color: getCategoryDarkColor(adapter.category),
                }}
              >
                {adapter.category}
              </span>
              <span style={{ ...styles.modalPhaseBadge, backgroundColor: getPhaseBadge(adapter.phase).bg, color: getPhaseBadge(adapter.phase).color }}>
                Phase {adapter.phase}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={styles.modalCloseBtn}>
            <Icons.Close />
          </button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>Description</h4>
            <p style={styles.modalText}>{adapter.description}</p>
          </div>

          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>Data Types</h4>
            <div style={styles.modalDataTypes}>
              {adapter.dataTypes.map((dt) => (
                <span key={dt} style={{ ...styles.dataTypeTag, fontSize: 13 }}>{dt}</span>
              ))}
            </div>
          </div>

          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>Access & Limits</h4>
            <div style={styles.modalInfoGrid}>
              <div style={styles.modalInfoItem}>
                <span style={styles.modalInfoLabel}>Access Type</span>
                <span style={{ ...styles.modalInfoValue, color: getAccessColor(adapter.access) }}>
                  {getAccessIcon(adapter.access)} {adapter.access}
                </span>
              </div>
              <div style={styles.modalInfoItem}>
                <span style={styles.modalInfoLabel}>Rate Limit</span>
                <span style={styles.modalInfoValue}>{adapter.rateLimit}</span>
              </div>
              <div style={styles.modalInfoItem}>
                <span style={styles.modalInfoLabel}>Records</span>
                <span style={styles.modalInfoValue}>{adapter.records}</span>
              </div>
              <div style={styles.modalInfoItem}>
                <span style={styles.modalInfoLabel}>Confidence Score</span>
                <span style={styles.modalInfoValue}>{(adapter.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>
              <Icons.Code style={{ marginRight: 6 }} /> Sample API Call
            </h4>
            <div style={styles.codeBlock}>
              <code style={styles.codeText}>{adapter.apiEndpoint}</code>
              <div style={styles.codeDivider} />
              <code style={{ ...styles.codeText, color: COLORS.genetics }}>{adapter.sampleQuery}</code>
            </div>
          </div>

          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>Provenance</h4>
            <p style={styles.modalText}>{adapter.provenance}</p>
          </div>

          <div style={styles.modalSection}>
            <h4 style={styles.modalSectionTitle}>Documentation</h4>
            <a
              href={adapter.documentation}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.docLink}
            >
              <Icons.ExternalLink /> {adapter.documentation}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Statistics Section ---
function StatisticsSection({ adapters }) {
  const stats = useMemo(() => {
    const accessCounts = {};
    ACCESS_TYPES.forEach((a) => (accessCounts[a] = 0));
    adapters.forEach((a) => { accessCounts[a.access] = (accessCounts[a.access] || 0) + 1; });

    const phaseCounts = { P1: 0, P2: 0, P3: 0 };
    adapters.forEach((a) => { phaseCounts[a.phase] = (phaseCounts[a.phase] || 0) + 1; });

    const catCounts = {};
    Object.keys(CATEGORIES).forEach((c) => (catCounts[c] = 0));
    adapters.forEach((a) => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });

    const activeCount = adapters.filter((a) => a.status === "active").length;
    return { accessCounts, phaseCounts, catCounts, total: adapters.length, activeCount };
  }, [adapters]);

  return (
    <div style={styles.statsSection}>
      <div style={styles.statsHeader}>
        <Icons.Activity />
        <h3 style={styles.statsTitle}>Adapter Statistics</h3>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{stats.total}</span>
          <span style={styles.statLabel}>Total Adapters</span>
          <span style={styles.statSublabel}>{stats.activeCount} active</span>
        </div>

        {ACCESS_TYPES.map((access) => (
          <div key={access} style={styles.statCard}>
            <span style={{ ...styles.statValue, color: getAccessColor(access) }}>
              {stats.accessCounts[access] || 0}
            </span>
            <span style={styles.statLabel}>{access}</span>
            <span style={styles.statSublabel}>
              {((stats.accessCounts[access] / stats.total) * 100).toFixed(0)}% of total
            </span>
          </div>
        ))}
      </div>

      <div style={styles.phaseSection}>
        <h4 style={styles.phaseSectionTitle}>By Integration Phase</h4>
        <div style={styles.phaseBarContainer}>
          {PHASES.map((phase) => {
            const pct = ((stats.phaseCounts[phase] || 0) / stats.total) * 100;
            const phaseStyle = getPhaseBadge(phase);
            return (
              <div key={phase} style={styles.phaseBarItem}>
                <div style={styles.phaseBarTrack}>
                  <div
                    style={{
                      ...styles.phaseBarFill,
                      width: `${pct}%`,
                      backgroundColor: phaseStyle.color,
                    }}
                  />
                </div>
                <div style={styles.phaseBarLabel}>
                  <span style={{ ...styles.phaseBarName, color: phaseStyle.color }}>{phase}</span>
                  <span style={styles.phaseBarCount}>{stats.phaseCounts[phase]}</span>
                  <span style={styles.phaseBarPct}>{pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  // Layout
  container: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "24px 20px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bg,
    minHeight: "100vh",
  },

  header: {
    marginBottom: 24,
  },

  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },

  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.accentLight,
    color: COLORS.accent,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 26,
    fontWeight: 600,
    margin: 0,
    color: COLORS.textPrimary,
    letterSpacing: "-0.01em",
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    margin: "4px 0 0 48px",
  },

  // Category Bar
  categoryBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
    padding: 12,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
  },

  categoryBarItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 20,
    border: "2px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    transition: "all 0.15s",
    backgroundColor: "transparent",
  },

  categoryBarName: {
    color: COLORS.textSecondary,
  },

  categoryBarCount: {
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 10,
    minWidth: 20,
    textAlign: "center",
  },

  // Search Panel
  searchPanel: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    padding: 16,
    marginBottom: 20,
  },

  searchHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    color: COLORS.textPrimary,
    fontWeight: 600,
    fontSize: 14,
  },

  searchTitle: {
    fontWeight: 600,
  },

  searchRow: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    padding: "10px 14px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    outline: "none",
    transition: "border-color 0.15s",
  },

  searchButton: {
    padding: "10px 22px",
    backgroundColor: COLORS.accent,
    color: COLORS.textInverse,
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background-color 0.15s",
  },

  adapterSelectSection: {
    position: "relative",
  },

  adapterSelectToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    color: COLORS.textSecondary,
    width: "100%",
  },

  adapterDropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.borderHover}`,
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    zIndex: 50,
    maxHeight: 320,
    overflow: "hidden",
  },

  adapterDropdownHeader: {
    padding: "8px 12px",
    borderBottom: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  selectAllBtn: {
    fontSize: 12,
    color: COLORS.accent,
    background: "none",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
  },

  adapterDropdownList: {
    maxHeight: 260,
    overflowY: "auto",
    padding: "4px 0",
  },

  adapterDropdownItem: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    transition: "background-color 0.1s",
  },

  checkbox: {
    marginRight: 8,
  },

  adapterDropdownName: {
    flex: 1,
    color: COLORS.textPrimary,
  },

  adapterDropdownCategory: {
    fontSize: 11,
    color: COLORS.textMuted,
    padding: "1px 6px",
    backgroundColor: COLORS.surface,
    borderRadius: 4,
  },

  // Search Results
  searchResults: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: `1px solid ${COLORS.border}`,
  },

  searchResultsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },

  searchResultsTitle: {
    fontWeight: 600,
  },

  searchResultsList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  searchResultItem: {
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
  },

  searchResultTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },

  searchResultName: {
    fontWeight: 600,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  searchResultCategory: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    fontWeight: 500,
  },

  searchResultDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    margin: "0 0 8px 0",
    lineHeight: 1.5,
  },

  searchResultMeta: {
    display: "flex",
    gap: 16,
    fontSize: 12,
  },

  searchResultConfidence: {
    color: COLORS.genetics,
    fontWeight: 500,
  },

  searchResultProvenance: {
    color: COLORS.textMuted,
  },

  // Filter Bar
  filterBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    padding: "10px 14px",
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    flexWrap: "wrap",
    gap: 10,
  },

  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  filterSelect: {
    padding: "7px 28px 7px 12px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 7,
    fontSize: 13,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    outline: "none",
    cursor: "pointer",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6560' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
  },

  clearFiltersBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    fontSize: 12,
    color: COLORS.adverse,
    backgroundColor: COLORS.adverseLight,
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  },

  // Adapter Grid
  adapterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },

  // Adapter Card
  adapterCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    borderLeftWidth: 4,
    padding: 16,
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    flexDirection: "column",
  },

  adapterCardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  adapterCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  adapterCardMeta: {
    display: "flex",
    gap: 6,
  },

  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },

  phaseBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },

  adapterCardName: {
    fontSize: 15,
    fontWeight: 600,
    margin: "0 0 6px 0",
    color: COLORS.textPrimary,
  },

  adapterCardDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 1.5,
    margin: "0 0 10px 0",
    flex: 1,
  },

  adapterCardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  accessBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 500,
  },

  recordsText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  adapterCardDataTypes: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },

  dataTypeTag: {
    fontSize: 10,
    padding: "2px 7px",
    borderRadius: 4,
    backgroundColor: COLORS.accentLight,
    color: COLORS.accentHover,
    fontWeight: 500,
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(45, 42, 38, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
    backdropFilter: "blur(4px)",
  },

  modalContent: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    maxWidth: 620,
    width: "100%",
    maxHeight: "85vh",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },

  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: 20,
    borderBottom: `1px solid ${COLORS.border}`,
  },

  modalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 8px 0",
    color: COLORS.textPrimary,
  },

  modalHeaderMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  modalCategoryBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 10,
  },

  modalPhaseBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 10,
  },

  modalCloseBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: COLORS.textMuted,
    padding: 4,
    display: "flex",
    transition: "color 0.15s",
  },

  modalBody: {
    padding: 20,
  },

  modalSection: {
    marginBottom: 20,
  },

  modalSectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    margin: "0 0 8px 0",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  modalText: {
    fontSize: 14,
    lineHeight: 1.7,
    color: COLORS.textPrimary,
    margin: 0,
  },

  modalDataTypes: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },

  modalInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 12,
  },

  modalInfoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  modalInfoLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },

  modalInfoValue: {
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.textPrimary,
  },

  codeBlock: {
    backgroundColor: "#f0edea",
    borderRadius: 8,
    padding: 14,
    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', monospace",
    fontSize: 12,
    overflowX: "auto",
  },

  codeText: {
    display: "block",
    color: COLORS.textPrimary,
    wordBreak: "break-all",
  },

  codeDivider: {
    height: 1,
    backgroundColor: COLORS.borderHover,
    margin: "8px 0",
  },

  docLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: COLORS.neuroimaging,
    fontSize: 13,
    textDecoration: "none",
    wordBreak: "break-all",
    transition: "color 0.15s",
  },

  // Statistics
  statsSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    padding: 20,
  },

  statsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },

  statsTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    color: COLORS.textPrimary,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 10,
    marginBottom: 20,
  },

  statCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },

  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.textPrimary,
    lineHeight: 1.2,
  },

  statLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  statSublabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  phaseSection: {
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 16,
  },

  phaseSectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    margin: "0 0 12px 0",
  },

  phaseBarContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  phaseBarItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  phaseBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.accentLight,
    borderRadius: 4,
    overflow: "hidden",
  },

  phaseBarFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.5s ease",
  },

  phaseBarLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 90,
    justifyContent: "flex-end",
  },

  phaseBarName: {
    fontSize: 12,
    fontWeight: 600,
    width: 20,
  },

  phaseBarCount: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textPrimary,
    width: 24,
    textAlign: "right",
  },

  phaseBarPct: {
    fontSize: 11,
    color: COLORS.textMuted,
    width: 36,
    textAlign: "right",
  },

  // Results Count
  resultsCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
    fontWeight: 500,
  },

  // Empty state
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: COLORS.textMuted,
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function KnowledgeExplorerPage() {
  // State
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("");
  const [selectedAccess, setSelectedAccess] = useState("");
  const [selectedDataType, setSelectedDataType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAdapters, setSelectedAdapters] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState(null);
  const [textFilter, setTextFilter] = useState("");

  // Filter adapters
  const filteredAdapters = useMemo(() => {
    return ADAPTERS.filter((a) => {
      if (selectedCategory && a.category !== selectedCategory) return false;
      if (selectedPhase && a.phase !== selectedPhase) return false;
      if (selectedAccess && a.access !== selectedAccess) return false;
      if (selectedDataType && !a.dataTypes.includes(selectedDataType)) return false;
      if (textFilter) {
        const q = textFilter.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedCategory, selectedPhase, selectedAccess, selectedDataType, textFilter]);

  const hasActiveFilters = selectedCategory || selectedPhase || selectedAccess || selectedDataType || textFilter;

  const clearAllFilters = () => {
    setSelectedCategory("");
    setSelectedPhase("");
    setSelectedAccess("");
    setSelectedDataType("");
    setTextFilter("");
  };

  const toggleAdapter = (id) => {
    setSelectedAdapters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Simulate cross-adapter search
  const executeSearch = () => {
    if (!searchQuery.trim() && selectedAdapters.length === 0) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setTimeout(() => {
      const targets = selectedAdapters.length > 0
        ? ADAPTERS.filter((a) => selectedAdapters.includes(a.id))
        : ADAPTERS;
      const q = searchQuery.toLowerCase();
      const results = targets
        .filter((a) => {
          if (!q) return true;
          return (
            a.name.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.dataTypes.some((dt) => dt.toLowerCase().includes(q))
          );
        })
        .map((a) => ({
          ...a,
          confidence: a.confidence * (0.85 + Math.random() * 0.15),
        }))
        .sort((a, b) => b.confidence - a.confidence);
      setSearchResults(results);
      setIsSearching(false);
    }, 600);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setSelectedAdapter(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.headerIcon}>
            <Icons.Database />
          </div>
          <h1 style={styles.title}>Knowledge Explorer</h1>
        </div>
        <p style={styles.subtitle}>
          Search, filter, and explore 67 clinical database adapters across neuroimaging,
          genetics, pharmacology, evidence, and adverse events
        </p>
      </header>

      {/* Category Summary Bar */}
      <CategorySummaryBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Search Panel */}
      <SearchPanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedAdapters={selectedAdapters}
        onToggleAdapter={toggleAdapter}
        onSearchExecute={executeSearch}
        searchResults={searchResults}
        isSearching={isSearching}
        filteredAdapters={filteredAdapters}
      />

      {/* Filter Bar */}
      <FilterBar
        selectedPhase={selectedPhase}
        onPhaseChange={setSelectedPhase}
        selectedAccess={selectedAccess}
        onAccessChange={setSelectedAccess}
        selectedDataType={selectedDataType}
        onDataTypeChange={setSelectedDataType}
        onClearFilters={clearAllFilters}
        hasActiveFilters={!!hasActiveFilters}
      />

      {/* Text search for grid */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Filter adapters by name or description..."
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          style={{ ...styles.searchInput, maxWidth: 400 }}
        />
      </div>

      {/* Results count */}
      <div style={styles.resultsCount}>
        Showing {filteredAdapters.length} of {ADAPTERS.length} adapters
        {selectedAdapters.length > 0 && ` · ${selectedAdapters.length} selected for search`}
      </div>

      {/* Adapter Grid */}
      {filteredAdapters.length > 0 ? (
        <AdapterGrid adapters={filteredAdapters} onCardClick={setSelectedAdapter} />
      ) : (
        <div style={styles.emptyState}>
          <Icons.Search />
          <p>No adapters match the current filters.</p>
          <button onClick={clearAllFilters} style={styles.clearFiltersBtn}>
            Clear all filters
          </button>
        </div>
      )}

      {/* Statistics */}
      <StatisticsSection adapters={ADAPTERS} />

      {/* Category 4 Neuroimaging — live registry (additive; curated catalog above is unchanged) */}
      <NeuroimagingLiveRegistry />

      {/* Detail Modal */}
      {selectedAdapter && (
        <AdapterDetailModal
          adapter={selectedAdapter}
          onClose={() => setSelectedAdapter(null)}
        />
      )}
    </div>
  );
}
