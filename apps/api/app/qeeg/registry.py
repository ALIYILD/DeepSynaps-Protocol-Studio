from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from app.qeeg.schemas import (
    AnalysisDefinition,
    AnalysisStatus,
    AnalysisTier,
    ComputeBackend,
    InputRequirements,
)


@dataclass(frozen=True)
class RegistryBuildResult:
    analyses: list[AnalysisDefinition]
    by_code: dict[str, AnalysisDefinition]


def _minimal_definition(
    *,
    code: str,
    name_en: str,
    name_tr: str,
    category: int,
    tier: AnalysisTier,
    status: AnalysisStatus,
) -> AnalysisDefinition:
    # Registry-first: Phase 0 ships a catalog. Rich per-analysis content is
    # filled in by category engineers without changing the stable code keys.
    return AnalysisDefinition(
        code=code,
        name={"en": name_en, "tr": name_tr},
        category=category,
        tier=tier,
        status=status,
        shortDescription={"en": "", "tr": ""},
        clinicalUse={"en": "", "tr": ""},
        inputRequirements=InputRequirements(minDurationSec=0, minChannels=0),
        parameters=[],
        outputs=[],
        visualizations=[],
        computeBackend=ComputeBackend(
            routerPath=f"/api/v1/qeeg/analyses/{code}/run",
            estimatedRuntimeSec=30 if tier == AnalysisTier.T1 else (90 if tier == AnalysisTier.T2 else 10),
            requiresGPU=False,
        ),
        references=[],
        contraindications=[],
        hedgeLanguage=(
            "These findings are consistent with / suggestive of {finding}. "
            "This is not a clinical diagnosis. Clinical correlation by a licensed clinician is required."
        ),
        validatedConditions=[],
        lastReviewed="",
        reviewedBy="",
    )


def build_registry() -> RegistryBuildResult:
    analyses: list[AnalysisDefinition] = []

    def add(defn: AnalysisDefinition) -> None:
        analyses.append(defn)

    # Phase 0 registry seed — ships the full 105-analysis catalog with honest
    # statuses. Category engineers will enrich definitions + flip statuses in
    # follow-on PRs without changing stable `code` keys.
    #
    # NOTE: Turkish strings here are MT drafts; human clinician review gates
    # promotion to implemented* statuses.
    seed: list[tuple[str, str, str, int, AnalysisTier]] = [
        # Category 1
        ("simnibs-simulation", "SimNIBS Simulations", "SimNIBS Simülasyonları", 1, AnalysisTier.T2),
        ("source-loc-sloreta", "Source Localization (sLORETA/eLORETA)", "Kaynak Lokalizasyonu (sLORETA/eLORETA)", 1, AnalysisTier.T1),
        ("beamforming-dipole", "Spatial Filtering (Beamforming) & ECD", "Uzamsal Filtreleme (Beamforming) ve ECD", 1, AnalysisTier.T1),
        ("eeg-source-imaging-mri", "ESI with Individual MRI Head Modeling", "Bireysel MRI Baş Modeli ile ESI", 1, AnalysisTier.T2),
        # Category 2
        ("relative-spectral-power", "Relative Spectral Power & Theta/Beta", "Göreli Spektral Güç ve Theta/Beta", 2, AnalysisTier.T1),
        ("band-peak-freq-regional", "Band Peak Frequency Distribution & Regional Power", "Bant Tepe Frekans Dağılımı ve Bölgesel Güç", 2, AnalysisTier.T1),
        ("frontal-gamma-cognition", "Frontal Gamma Power & Cognitive Processing", "Frontal Gama Gücü ve Bilişsel İşleme", 2, AnalysisTier.T1),
        ("delta-dominance-regional", "Delta Dominance Power & Regional Activity", "Delta Baskınlığı Gücü ve Bölgesel Aktivite", 2, AnalysisTier.T1),
        ("u-shape-alpha-peak", "U-Shape Profile & Alpha Peak", "U-Şekli Profil ve Alfa Tepe", 2, AnalysisTier.T1),
        ("iapf-distribution", "Individual Alpha Peak Frequency", "Bireysel Alfa Tepe Frekansı", 2, AnalysisTier.T1),
        ("fooof-aperiodic-periodic", "FOOOF Aperiodic & Periodic", "FOOOF Aperiyodik ve Periyodik", 2, AnalysisTier.T1),
        ("periodic-aperiodic-params", "Periodic/Aperiodic Parameters", "Periyodik/Aperiyodik Parametreler", 2, AnalysisTier.T1),
        ("aperiodic-adjusted-spectrum", "Aperiodic-Adjusted Spectrum", "Aperiyodik Düzeltilmiş Spektrum", 2, AnalysisTier.T1),
        ("spectral-edge-frequency", "Spectral Edge Frequency (SEF95/SEF50)", "Spektral Kenar Frekansı (SEF95/SEF50)", 2, AnalysisTier.T1),
        # Category 3
        ("high-coherence-overconnectivity", "High Coherence Regions ≥0.8", "Yüksek Koherens Bölgeleri ≥0.8", 3, AnalysisTier.T1),
        ("disconnection-problems", "Disconnection Problems", "Bağlantı Kopukluğu Problemleri", 3, AnalysisTier.T1),
        ("pli-imaginary-coherence", "PLI & Imaginary Coherence", "PLI ve İmajiner Koherens", 3, AnalysisTier.T1),
        ("fcd", "Functional Connectivity Density", "Fonksiyonel Bağlantısallık Yoğunluğu", 3, AnalysisTier.T2),
        ("wpli", "Weighted Phase Lag Index", "Ağırlıklı Faz Gecikme İndeksi", 3, AnalysisTier.T1),
        ("ercc", "Event-Related Cross-Correlation", "Olay-İlişkili Çapraz Korelasyon", 3, AnalysisTier.T2),
        ("connectivity-parcellation", "Connectivity-based Parcellation", "Bağlantısallık Tabanlı Parselasyon", 3, AnalysisTier.T2),
        ("time-varying-phase-coherence", "Time-Varying Phase Coherence", "Zamana Bağlı Faz Koherensi", 3, AnalysisTier.T2),
        ("cfc-pac", "Cross-Frequency Interactions (CFC/PAC)", "Çapraz Frekans Etkileşimleri (CFC/PAC)", 3, AnalysisTier.T1),
        ("opac", "Oscillatory PAC", "Osilatuvar PAC", 3, AnalysisTier.T2),
        ("cross-freq-directionality", "Cross-Frequency Directionality", "Çapraz Frekans Yönlülüğü", 3, AnalysisTier.T2),
        ("mfncsa", "Multi-Frequency Network Coupling Stability", "Çok Frekanslı Ağ Bağlaşım Kararlılığı", 3, AnalysisTier.T3),
        ("acme", "Alpha Connectivity Modulation Efficiency", "Alfa Bağlantısallık Modülasyon Verimliliği", 3, AnalysisTier.T3),
        ("cmsia", "Cross-modal Sensory Integration", "Çapraz-Mod Duyusal Entegrasyon", 3, AnalysisTier.T3),
        # Category 4
        ("graph-theoretic-indices", "Graph Theoretic Indices", "Graf Teorik İndeksler", 4, AnalysisTier.T1),
        ("hubs-small-world", "Hubs & Small-World", "Merkezler ve Küçük-Dünya", 4, AnalysisTier.T1),
        ("dynamic-connectivity-sliding", "Dynamic Connectivity (Sliding Window)", "Dinamik Bağlantısallık (Kayan Pencere)", 4, AnalysisTier.T1),
        ("bos", "Brain Oscillatory Network", "Beyin Osilatuvar Ağı", 4, AnalysisTier.T2),
        ("dcm", "Dynamic Causal Modelling", "Dinamik Nedensel Modellemesi", 4, AnalysisTier.T3),
        ("multiscale-functional-connectivity", "Multiscale Functional Connectivity", "Çok Ölçekli Fonksiyonel Bağlantısallık", 4, AnalysisTier.T2),
        ("evc", "Eigenvector Centrality", "Özvektör Merkeziliği", 4, AnalysisTier.T1),
        ("graph-laplacian", "Graph Laplacian Analysis", "Graf Laplasyen Analizi", 4, AnalysisTier.T1),
        ("dcsi", "Dynamic Cortical Stability Index", "Dinamik Kortikal Stabilite İndeksi", 4, AnalysisTier.T3),
        ("rnrm", "Rapid Network Reorganization Mapping", "Hızlı Ağ Yeniden Organizasyon Haritalama", 4, AnalysisTier.T3),
        ("ihtea", "Inter-Hemispheric Transfer Efficiency", "İnter-Hemisferik Transfer Verimliliği", 4, AnalysisTier.T3),
        # Category 5
        ("effective-connectivity", "Effective Connectivity", "Etkili Bağlantısallık", 5, AnalysisTier.T1),
        ("individual-targeting-plasticity", "Individual Targeting by Plasticity", "Plastisiteye Göre Bireysel Hedefleme", 5, AnalysisTier.T3),
        ("microstate-neural-adaptation", "Microstate & Neural Adaptation", "Mikrodurum ve Nöral Adaptasyon", 5, AnalysisTier.T2),
        ("repetition-suppression-habituation", "Repetition Suppression", "Tekrara Bağlı Baskılanma", 5, AnalysisTier.T2),
        ("mpsta", "Multi-region Plasticity Saturation Threshold", "Çok Bölge Plastisite Doyum Eşiği", 5, AnalysisTier.T3),
        ("onta", "Oscillatory Neuroplasticity Threshold", "Osilatuvar Nöroplastisite Eşiği", 5, AnalysisTier.T3),
        ("figm", "Functional Inhibition Gradient Mapping", "Fonksiyonel İnhibisyon Gradyan Haritalama", 5, AnalysisTier.T3),
        ("ei-balance", "Excitation-Inhibition Balance", "Uyarılma-İnhibisyon Dengesi", 5, AnalysisTier.T2),
        # Category 6
        ("microstate-durations-transitions", "Microstate Durations & Transitions", "Mikrodurum Süreleri ve Geçişleri", 6, AnalysisTier.T1),
        ("microstate-transition-dynamics", "Microstate Transition Dynamics", "Mikrodurum Geçiş Dinamikleri", 6, AnalysisTier.T1),
        ("microstate-syntax", "Microstate Syntax Analysis", "Mikrodurum Sözdizimi Analizi", 6, AnalysisTier.T2),
        # Category 7
        ("dcr", "Differential Cortical Responsiveness", "Diferansiyel Kortikal Yanıtlılık", 7, AnalysisTier.T2),
        ("ersp", "Event-Related Spectral Perturbation", "Olay-İlişkili Spektral Pertürbasyon", 7, AnalysisTier.T1),
        ("erd-ers", "ERD/ERS", "ERD/ERS", 7, AnalysisTier.T1),
        ("erp-components", "ERP Components (P300/MMN/ERN/N400/P50/P3a/CNV)", "ERP Bileşenleri (P300/MMN/ERN/N400/P50/P3a/CNV)", 7, AnalysisTier.T1),
        ("phase-resetting", "Phase Resetting", "Faz Sıfırlama", 7, AnalysisTier.T2),
        ("icnda", "Impulse-Control Neural Dynamics", "Dürtü Kontrol Nöral Dinamikleri", 7, AnalysisTier.T3),
        # Category 8
        ("epileptiform-spike-count", "Spike & Sharp Wave Count + AED control", "Spike ve Keskin Dalga Sayımı + AED kontrolü", 8, AnalysisTier.T1),
        ("epilepsy-risk-protocol-impact", "Epilepsy Risk Calculation & Protocol Impact", "Epilepsi Risk Hesabı ve Protokol Etkisi", 8, AnalysisTier.T1),
        ("paroxysmal-grda", "Paroxysmal & GRDA", "Paroksismal ve GRDA", 8, AnalysisTier.T2),
        ("firda-oirda", "FIRDA & OIRDA", "FIRDA ve OIRDA", 8, AnalysisTier.T2),
        ("nhra", "Network-Level Hyperexcitability Reduction", "Ağ Düzeyi Hiper-eksitabilite Azaltımı", 8, AnalysisTier.T3),
        # Category 9
        ("dfa-dtf", "DFA & DTF", "DFA ve DTF", 9, AnalysisTier.T1),
        ("wavelet", "Wavelet Analysis", "Dalgacık Analizi", 9, AnalysisTier.T1),
        ("aac", "Amplitude-Amplitude Coupling", "Genlik-Genlik Bağlaşımı", 9, AnalysisTier.T2),
        ("transfer-entropy", "Transfer Entropy", "Transfer Entropisi", 9, AnalysisTier.T1),
        ("entropy-measures", "Entropy-Based Measurements", "Entropi Tabanlı Ölçümler", 9, AnalysisTier.T1),
        ("fractal-lz-complexity", "Fractal Dimension + Lempel-Ziv", "Fraktal Boyut + Lempel-Ziv", 9, AnalysisTier.T1),
        ("mse", "Multiscale Entropy", "Çok Ölçekli Entropi", 9, AnalysisTier.T1),
        ("higuchi-fd", "Higuchi Fractal Dimension", "Higuchi Fraktal Boyutu", 9, AnalysisTier.T1),
        ("permutation-entropy", "Permutation Entropy", "Permütasyon Entropisi", 9, AnalysisTier.T1),
        ("rqa", "Recurrence Quantification Analysis", "Yineleme Nicel Analizi", 9, AnalysisTier.T2),
        ("bispectrum-bicoherence", "Bispectrum & Bicoherence", "Bispektrum ve Bikoherens", 9, AnalysisTier.T1),
        ("complexity-biomarker", "Complexity-Based Biomarker Extraction", "Karmaşıklık Tabanlı Biyobelirteç Çıkarımı", 9, AnalysisTier.T2),
        ("spectral-entropy", "Spectral Entropy", "Spektral Entropi", 9, AnalysisTier.T1),
        ("lrtc", "Long-Range Temporal Correlations", "Uzun Menzilli Zamansal Korelasyonlar", 9, AnalysisTier.T1),
        ("nonlinear-interdependence", "Nonlinear Interdependence", "Doğrusal Olmayan Karşılıklı Bağımlılık", 9, AnalysisTier.T2),
        ("mutual-information-connectivity", "Mutual Information Connectivity", "Karşılıklı Bilgi Bağlantısallığı", 9, AnalysisTier.T1),
        # Category 10
        ("eeg-asymmetry", "Hemispheric Asymmetry", "Hemisferik Asimetri", 10, AnalysisTier.T1),
        ("regional-asymmetry-height", "Regional Asymmetry Height Classification", "Bölgesel Asimetri Yükseklik Sınıflaması", 10, AnalysisTier.T1),
        ("anterior-posterior-connectivity", "Anterior-Posterior Functional Connection", "Anterior-Posterior Fonksiyonel Bağlantı", 10, AnalysisTier.T1),
        ("limbic-frontal-sync", "Limbic-Frontal Synchronization", "Limbik-Frontal Senkronizasyon", 10, AnalysisTier.T2),
        ("frontal-dominance-activation", "Frontal Dominance & Activation", "Frontal Baskınlık ve Aktivasyon", 10, AnalysisTier.T1),
        ("regional-global-network-power", "Regional & Global Network Power Distribution", "Bölgesel ve Global Ağ Güç Dağılımı", 10, AnalysisTier.T1),
        ("temporal-parietal-language-loop", "Temporal-Parietal Language Loop Connectivity", "Temporal-Parietal Dil Döngüsü Bağlantısallığı", 10, AnalysisTier.T2),
        # Category 11
        ("cross-reference-clinical-modeling", "Cross-reference & Clinical Modeling", "Çapraz Referans ve Klinik Modelleme", 11, AnalysisTier.T1),
        ("symptom-flow", "SYMPTOM-FLOW Neurophysiological Diagram", "SYMPTOM-FLOW Nörofizyolojik Diyagramı", 11, AnalysisTier.T2),
        ("granger-symptom", "GRANGER-Based Symptom Analysis", "GRANGER Tabanlı Semptom Analizi", 11, AnalysisTier.T2),
        ("qeeg-personalized-protocols", "QEEG-Guided Personalized Protocols", "QEEG Rehberli Kişiselleştirilmiş Protokoller", 11, AnalysisTier.T1),
        ("eeg-machine-learning-models", "EEG-Based ML Models", "EEG Tabanlı ML Modelleri", 11, AnalysisTier.T2),
        ("additional-protocol-needs", "Checking Additional Protocol Needs", "Ek Protokol İhtiyaçlarını Kontrol", 11, AnalysisTier.T1),
        ("pfrp", "Personalized Frequency-Response Profiling", "Kişiselleştirilmiş Frekans-Yanıt Profillemesi", 11, AnalysisTier.T3),
        # Category 12
        ("ica-artifact-eog", "ICA Artifact & Eye-Movement Removal", "ICA Artefakt ve Göz Hareketi Giderimi", 12, AnalysisTier.T1),
        ("emd-hilbert", "Empirical Mode Decomposition + Hilbert", "Ampirik Mod Ayrışımı + Hilbert", 12, AnalysisTier.T1),
        ("aperiodic-deep-inhibition", "Aperiodic Component Deep + Neural Inhibition", "Aperiyodik Bileşen Derin + Nöral İnhibisyon", 12, AnalysisTier.T2),
        ("lcesa", "Longitudinal Cross-Session EEG Stability", "Seanslar Arası Uzunlamasına EEG Stabilitesi", 12, AnalysisTier.T2),
        # Extras (C-Misc)
        ("multivariate-pattern-analysis", "EEG MVPA", "EEG MVPA", 11, AnalysisTier.T3),
        ("phase-slope-index", "Phase Slope Index (PSI)", "Faz Eğim İndeksi (PSI)", 3, AnalysisTier.T2),
        ("functional-segregation", "Functional Segregation", "Fonksiyonel Ayrışma", 4, AnalysisTier.T3),
        ("event-related-complexity", "Event-Related Complexity", "Olay-İlişkili Karmaşıklık", 9, AnalysisTier.T3),
        ("co-modulation", "EEG Co-modulation Analysis", "EEG Ko-modülasyon Analizi", 3, AnalysisTier.T3),
        ("dcm-eeg", "Dynamic Causal Modelling (EEG-specific)", "Dinamik Nedensel Modellemesi (EEG-özel)", 4, AnalysisTier.T3),
        ("phase-resetting-extended", "Phase Resetting (extended)", "Faz Sıfırlama (genişletilmiş)", 7, AnalysisTier.T3),
        ("info-theoretic-connectivity", "Information-Theoretic Connectivity (extended MI)", "Bilgi-Teorik Bağlantısallık (genişletilmiş MI)", 3, AnalysisTier.T2),
        ("regional-asymmetry-extended", "Regional Asymmetry (extended classification)", "Bölgesel Asimetri (genişletilmiş sınıflama)", 10, AnalysisTier.T2),
        ("network-hyperexcitability-detail", "Network Hyperexcitability (detail)", "Ağ Hiper-eksitabilitesi (detay)", 8, AnalysisTier.T3),
    ]

    for code, name_en, name_tr, category, tier in seed:
        status = (
            AnalysisStatus.research_stub_not_validated
            if tier == AnalysisTier.T3
            else AnalysisStatus.library_mapped_validation_pending
        )
        add(
            _minimal_definition(
                code=code,
                name_en=name_en,
                name_tr=name_tr,
                category=category,
                tier=tier,
                status=status,
            )
        )

    by_code: dict[str, AnalysisDefinition] = {}
    for a in analyses:
        if a.code in by_code:
            raise ValueError(f"Duplicate analysis code in registry: {a.code}")
        by_code[a.code] = a
    return RegistryBuildResult(analyses=analyses, by_code=by_code)


def list_analyses() -> list[AnalysisDefinition]:
    return build_registry().analyses


def get_analysis(code: str) -> AnalysisDefinition | None:
    return build_registry().by_code.get(code)


def ensure_codes_exist(codes: Iterable[str]) -> None:
    reg = build_registry().by_code
    missing = [c for c in codes if c not in reg]
    if missing:
        raise ValueError(f"Missing analyses in registry: {missing[:10]}")

