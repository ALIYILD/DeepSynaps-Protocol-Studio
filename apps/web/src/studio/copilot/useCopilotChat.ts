import { useCallback, useState } from "react";

import { useAiStore, type AiMessage, type AiCitation } from "../stores/ai";

interface UseCopilotChatReturn {
  messages: AiMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  clearChat: () => void;
  copyToReport: (messageId: string) => Promise<void>;
}

const AI_RESPONSES: Record<string, string> = {
  default:
    "I've analyzed the current EEG context. Based on the available data, I can help you interpret findings, suggest protocols, or review clinical evidence. What would you like to explore?",
  "generate protocol":
    "Based on the current EEG assessment, I recommend the following protocol:\n\n**1. Assessment Phase**\n- Review raw EEG for artifacts and overall quality\n- Apply appropriate montage and filters\n- Identify dominant frequencies and any asymmetries\n\n**2. Analysis Phase**\n- Compute spectral power (Welch periodogram)\n- Review event-related potentials if paradigm data exists\n- Check for epileptiform activity (spikes, sharp waves)\n\n**3. Reporting Phase**\n- Document findings with quantitative backing\n- Compare to normative database where available\n- Provide clinical recommendations\n\nWould you like me to elaborate on any specific phase?",
  "search evidence":
    "Here are relevant evidence sources for EEG interpretation:\n\n**Key Guidelines:**\n- ACNS Guideline for QEEG (2019)\n- IFCN Standards for Digital EEG (2017)\n- ILAE Classification of EEG Patterns (2022)\n\n**Spectral Analysis:**\n- Normative databases: Neurometrics, NeuroGuide, BESA Statistics\n- Age-adjusted power spectra for clinical populations\n\n**ERP Standards:**\n- P300 latency norms by age group\n- MMN in clinical assessment (Duncan et al., 2009)\n\nClick 'View all evidence' to see the full citation list.",
  "interpret findings":
    "To interpret the current EEG findings, I'll look at several key aspects:\n\n**Background Activity:**\n- Check for appropriate posterior dominant rhythm\n- Assess frequency, amplitude, and reactivity\n\n**Asymmetries:**\n- Compare homologous regions for amplitude/frequency differences\n- >50% asymmetry may be clinically significant\n\n**Sleep Architecture:**\n- If sleep recorded, evaluate stages and transitions\n\n**Epileptiform Activity:**\n- Review for spikes, sharp waves, spike-and-wave complexes\n- Note distribution (focal vs. generalized)\n\nWould you like me to focus on a specific finding?",
  "interpret spectral findings":
    "**Spectral Analysis Interpretation:**\n\n**Delta (0.5-4 Hz):**\n- Increased delta suggests focal dysfunction (if localized) or encephalopathy (if diffuse)\n- Check for frontal intermittent rhythmic delta activity (FIRDA)\n\n**Theta (4-8 Hz):**\n- Excess theta may indicate drowsiness, mild dysfunction, or encephalopathy\n\n**Alpha (8-13 Hz):**\n- Evaluate peak frequency (should be ≥8 Hz in adults)\n- Asymmetry >1 Hz between sides is significant\n\n**Beta (>13 Hz):**\n- Excess beta can indicate medication effect (benzodiazepines)\n- Low beta may suggest cortical underarousal\n\n**Gamma (>30 Hz):**\n- Review with caution due to muscle artifact contamination",
  "compare to normative":
    "**Normative Comparison Approach:**\n\nI'll compare the current spectral data against age-matched norms:\n\n**Database Options:**\n- Neurometrics (NCI) - 2-82 years\n- NeuroGuide - 5-90 years\n- BESA Statistics - customized bands\n\n**Key Metrics to Compare:**\n- Absolute power per band\n- Relative power ratios\n- Peak frequency and amplitude\n- Coherence between regions\n\n**Interpretation Thresholds:**\n- >2 SD from mean = statistically significant\n- Consider clinical context alongside statistical deviations\n\nWould you like me to suggest specific normative comparisons for this recording?",
  "suggest targets":
    "**Potential Neurofeedback/Neuromodulation Targets:**\n\nBased on spectral analysis, common targets include:\n\n**SMR (12-15 Hz) Enhancement:**\n- Target: Central regions (C3, C4, Cz)\n- Indication: Sleep onset issues, hyperactivity\n\n**Theta/Beta Ratio:**\n- Target: Frontal regions (Fz, F3, F4)\n- Indication: Attention, executive function\n\n**Alpha Enhancement:**\n- Target: Posterior regions (O1, O2, Pz)\n- Indication: Anxiety, relaxation training\n\n**Slow Wave Inhibition:**\n- Target: Focal regions showing excess delta/theta\n- Indication: Focal dysfunction, post-injury\n\nEach target should be individualized based on the full clinical picture.",
  "explain p300":
    "**P300 ERP Explanation:**\n\nThe P300 (P3) is a positive-going ERP component peaking around 300-600 ms post-stimulus. It reflects attentional resource allocation and working memory updating.\n\n**Paradigm:**\nTypically elicited using oddball tasks (rare target among frequent standards).\n\n**Key Measures:**\n- **Latency:** 300-500 ms (young adults); increases with age (~1-2 ms/year)\n- **Amplitude:** 10-20 µV (varies by task and electrode site)\n- **Scalp Distribution:** Centro-parietal maximum (Cz, Pz)\n\n**Clinical Significance:**\n- Prolonged latency: Cognitive impairment, dementia risk\n- Reduced amplitude: Attention deficits, depression\n- Delayed P300 is a known biomarker for MCI/Alzheimer's progression",
  "clinical significance":
    "**Clinical Significance of ERP Findings:**\n\nERP components provide objective measures of cognitive processing:\n\n**P300:**\n- Delayed: MCI, Alzheimer's, Parkinson's, TBI\n- Reduced amplitude: ADHD, depression, schizophrenia\n\n**N200:**\n- Related to conflict monitoring and inhibitory control\n- Abnormal in ADHD, OCD, addiction\n\n**MMN (Mismatch Negativity):**\n- Pre-attentive discrimination\n- Reduced in schizophrenia, coma prognosis, dyslexia\n\n**ERN (Error Negativity):**\n- Performance monitoring\n- Altered in anxiety disorders, OCD\n\nThese biomarkers complement behavioral assessment and can track treatment response.",
  "compare to controls":
    "**Comparison to Control Groups:**\n\nWhen comparing ERP data to controls, consider:\n\n**Demographic Matching:**\n- Age (P300 latency increases ~1-2 ms/year after age 20)\n- Education level\n- Sex/gender where norms are stratified\n\n**Methodological Factors:**\n- Same paradigm parameters (ISI, stimulus probability)\n- Same recording and filter settings\n- Same analysis window and peak detection\n\n**Statistical Approach:**\n- Compare to published normative data (standard score transformation)\n- Or use local control group with appropriate statistical tests\n\n**Clinical Interpretation:**\n- >2 SD from norm = likely clinically significant\n- Consider pre-morbid functioning and concurrent medications",
  "classify spike type":
    "**Spike Classification:**\n\nBased on the detected events, here's the classification framework:\n\n**By Morphology:**\n- **Spike:** Duration 20-70 ms, sharp pointed peak\n- **Sharp Wave:** Duration 70-200 ms, broader peak\n- **Spike-and-Wave Complex:** Spike followed by slow wave\n- **Polyspike:** Multiple spikes in succession\n\n**By Distribution:**\n- **Focal:** Restricted to one region (suggestive of partial epilepsy)\n- **Multi-focal:** Independent foci in multiple regions\n- **Generalized:** Bilateral synchronous (suggestive of generalized epilepsy)\n\n**Clinical Significance:**\n- Interictal spikes localize seizure onset zone in ~80% of cases\n- Periodic patterns may indicate acute brain injury",
  "suggest follow-up":
    "**Recommended Follow-Up for Detected Spikes:**\n\n**Immediate Actions:**\n- Review raw EEG around spike times for confirmation\n- Assess if spikes are consistent with patient's clinical presentation\n- Correlate with MRI findings if available\n\n**Further Evaluation:**\n- If new-onset spikes: consider prolonged EEG or ambulatory monitoring\n- If epileptiform: neurology referral recommended\n- Sleep-deprived EEG may increase yield if initial recording was normal\n\n**Documentation:**\n- Note spike frequency, localization, and activating procedures\n- Include in clinical report with representative samples\n\n**Patient Counseling:**\n- Single spike does not equal epilepsy diagnosis\n- Clinical correlation is essential",
  "assess risk":
    "**Risk Assessment for Epileptiform Activity:**\n\n**Factors Increasing Seizure Risk:**\n\n**EEG Factors:**\n- Frequent spikes (>1/hour)\n- Multi-focal independent spikes\n- Generalized spike-and-wave\n- Periodic lateralized epileptiform discharges (PLEDs)\n\n**Clinical Factors:**\n- Prior seizure history\n- Abnormal MRI (hippocampal sclerosis, cortical dysplasia)\n- Genetic predisposition\n- Sleep deprivation or photic stimulation triggers\n\n**Risk Stratification:**\n- Low: Rare spikes, no clinical seizures, normal MRI\n- Moderate: Spikes withpartial clinical correlation\n- High: Frequent spikes + seizure semiology + MRI lesion\n\nThis assessment should guide treatment and monitoring decisions.",
  "review history":
    "**Patient History Review Framework:**\n\nWhen reviewing the patient's clinical history alongside EEG data:\n\n**Key Information:**\n- Chief complaint and referral question\n- Prior EEG results and dates\n- Medication history (especially AEDs, benzodiazepines)\n- Medical history (TBI, CVA, infections, metabolic disorders)\n- Family history of epilepsy or neurological conditions\n\n**Correlation Points:**\n- Match EEG findings to reported symptoms\n- Consider medication effects on EEG patterns\n- Evaluate if current findings are new or chronic\n\n**Clinical Questions to Address:**\n- Do EEG findings explain the clinical presentation?\n- Are there any urgent findings requiring immediate action?\n- What additional testing might be beneficial?",
  "check contraindications":
    "**Contraindication Check:**\n\nBefore proceeding with neurofeedback or neuromodulation:\n\n**Absolute Contraindications:**\n- Active implanted medical devices (pacemakers, VNS, DBS) for certain modalities\n- Acute psychiatric crisis or active suicidal ideation\n- Current substance abuse (may affect EEG reliability)\n\n**Relative Contraindications:**\n- Pregnancy (for some neuromodulation techniques)\n- History of seizures (protocol modification needed)\n- Skin conditions affecting electrode placement\n- Severe cognitive impairment limiting task engagement\n\n**Medication Considerations:**\n- Benzodiazepines increase beta, decrease alpha\n- Stimulants increase beta, decrease theta\n- AEDs may suppress epileptiform activity\n\nAlways correlate with full clinical picture.",
  "explain loreta results":
    "**LORETA Source Localization Results:**\n\nLORETA (Low Resolution Electromagnetic Tomography) estimates the 3D distribution of neural generators underlying scalp EEG:\n\n**Key Concepts:**\n- LORETA has spatial resolution of ~7-10 mm (voxel-based)\n- It assumes smoothness of current density (neighboring voxels have similar activity)\n- Best for deep subcortical sources and distributed networks\n\n**Interpretation:**\n- High current density regions indicate likely neural generators\n- Cross-reference with anatomical MRI when available\n- Consider the reference electrode used (averaged reference recommended)\n\n**Limitations:**\n- Spatial resolution is limited compared to fMRI\n- Deep sources are better localized than superficial ones\n- Requires sufficient SNR in the scalp data",
  "target regions":
    "**Target Regions from Source Analysis:**\n\nBased on the LORETA results, here are the key regions of interest:\n\n**Common Target Regions:**\n- **Prefrontal Cortex (BA 9, 10, 46):** Executive function, attention\n- **Anterior Cingulate (BA 24, 32):** Error monitoring, motivation\n- **Sensorimotor Cortex (BA 1-4):** SMR training, motor function\n- **Temporal Regions:** Memory, language, emotional processing\n\n**For Clinical Applications:**\n- Match target regions to patient's clinical presentation\n- Consider connectivity between regions (not just focal activity)\n- Use in conjunction with symptom-based assessment\n\n**Validation:**\n- Compare with fMRI or PET when available\n- Use multiple source localization methods for convergence",
  "evidence for targets":
    "**Evidence Base for Source-Guided Targets:**\n\n**LORETA in Clinical Research:**\n\n**Depression:**\n- Increased alpha in left prefrontal regions (Davidson et al.)\n- Target: Enhance right frontal alpha or bilateral coordination\n\n**ADHD:**\n- Reduced activation in anterior cingulate and dorsolateral prefrontal cortex\n- Target: Enhance theta/beta ratio or SMR at specific sources\n\n**Anxiety:**\n- Excess beta in right hemisphere regions\n- Target: Enhance alpha asymmetry toward left hemisphere\n\n**Epilepsy:**\n- LORETA can localize seizure foci pre-surgically\n- Target: Inhibit activity at spike generator locations\n\n**Key References:**\n- Pascual-Marqui et al. (1994, 2002) - LORETA methodology\n- Cannon et al. (2009) - LORETA neurofeedback studies",
};

function findMatchingResponse(content: string): string {
  const lower = content.toLowerCase();
  for (const [key, response] of Object.entries(AI_RESPONSES)) {
    if (key === "default") continue;
    if (lower.includes(key)) return response;
  }
  return AI_RESPONSES.default;
}

function generateCitationsForMessage(
  content: string
): AiCitation[] {
  const lower = content.toLowerCase();
  const citations: AiCitation[] = [];

  if (lower.includes("spectral") || lower.includes("p300") || lower.includes("erp")) {
    citations.push({
      id: crypto.randomUUID(),
      label: "IFCN Standards for Digital EEG (2017)",
      href: "https://www.ifcn.info/standards",
    });
  }
  if (lower.includes("spike") || lower.includes("epileptiform")) {
    citations.push({
      id: crypto.randomUUID(),
      label: "ILAE Classification of EEG Patterns (2022)",
      href: "https://www.ilae.org/guidelines",
    });
  }
  if (lower.includes("protocol") || lower.includes("target")) {
    citations.push({
      id: crypto.randomUUID(),
      label: "ISNR Comprehensive Neurofeedback Bibliography",
      href: "https://www.isnr.org/bibliography",
    });
  }
  if (lower.includes("loreta") || lower.includes("source")) {
    citations.push({
      id: crypto.randomUUID(),
      label: "Pascual-Marqui et al. (2002) - LORETA Methodology",
      href: "https://www.uzh.ch/keyinst/loreta.htm",
    });
  }
  if (citations.length === 0) {
    citations.push({
      id: crypto.randomUUID(),
      label: "ACNS Guideline for QEEG (2019)",
      href: "https://www.acns.org/guidelines",
    });
  }

  return citations;
}

export function useCopilotChat(): UseCopilotChatReturn {
  const messages = useAiStore((s) => s.messages);
  const addMessage = useAiStore((s) => s.addMessage);
  const clearThread = useAiStore((s) => s.clearThread);
  const setCitations = useAiStore((s) => s.setCitations);
  const setPendingSuggestions = useAiStore((s) => s.setPendingSuggestions);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      setError(null);
      setIsLoading(true);

      // Add user message
      addMessage({ role: "user", content: content.trim() });

      // Simulate AI response after delay
      setTimeout(() => {
        const responseContent = findMatchingResponse(content);
        addMessage({ role: "assistant", content: responseContent });

        const citations = generateCitationsForMessage(responseContent);
        setCitations(citations);

        // Generate contextual suggestions based on content
        const suggestions: string[] = [];
        if (content.toLowerCase().includes("protocol")) {
          suggestions.push("Customize protocol", "View evidence");
        } else if (content.toLowerCase().includes("spike")) {
          suggestions.push("View spike map", "Generate report");
        } else if (content.toLowerCase().includes("spectr")) {
          suggestions.push("Export spectra", "Compare norms");
        } else {
          suggestions.push("Tell me more", "Generate protocol", "Search evidence");
        }
        setPendingSuggestions(suggestions);

        setIsLoading(false);
      }, 1200);
    },
    [addMessage, setCitations, setPendingSuggestions]
  );

  const clearChat = useCallback(() => {
    clearThread();
    setError(null);
    setIsLoading(false);
  }, [clearThread]);

  const copyToReport = useCallback(
    async (messageId: string): Promise<void> => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      try {
        await navigator.clipboard.writeText(message.content);
      } catch {
        // Fallback: create temporary textarea
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    },
    [messages]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    copyToReport,
  };
}
