"""qEEG capability/dependency reporting.

Decision-support only. Clinician review required.

This endpoint reports which qEEG features are available in the current
deployment, without importing heavy scientific stacks or running any
computations. It is intended for developers and clinicians to understand what
is active, fallback, unavailable, reference-only, or experimental.

Safety boundary:
- WinEEG is "reference-only workflow guidance" (no native compatibility).
- This endpoint never exposes secrets (values of env vars are not returned).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from importlib.util import find_spec
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/qeeg", tags=["qeeg"])

CapabilityStatus = Literal["active", "fallback", "unavailable", "reference_only", "experimental"]


class CapabilityFeature(BaseModel):
    id: str
    label: str
    status: CapabilityStatus
    required_packages: list[str] = Field(default_factory=list)
    missing_packages: list[str] = Field(default_factory=list)
    required_env: list[str] = Field(default_factory=list)
    missing_env: list[str] = Field(default_factory=list)
    clinical_caveat: str
    ui_surfaces: list[str] = Field(default_factory=list)
    notes: str = ""


class NormativeDatabaseStatus(BaseModel):
    status: Literal["toy", "configured", "unavailable"]
    version: str | None = None
    clinical_caveat: str


class WineegReferenceStatus(BaseModel):
    status: Literal["reference_only"] = "reference_only"
    native_file_ingestion: bool = False
    caveat: str = "No native WinEEG compatibility. Reference-only checklist and workflow guidance."


class QeegCapabilitiesResponse(BaseModel):
    status: Literal["ok"] = "ok"
    generated_at: str
    features: list[CapabilityFeature]
    normative_database: NormativeDatabaseStatus
    wineeg_reference: WineegReferenceStatus


def _has_pkg(mod: str) -> bool:
    return find_spec(mod) is not None


def _missing(required: list[str]) -> list[str]:
    return [m for m in required if not _has_pkg(m)]


def _env_present(name: str) -> bool:
    v = os.getenv(name)
    return bool(v and str(v).strip())


def _toy_norm_csv_present() -> bool:
    # Mirrors the default fixture location used by deepsynaps_qeeg.normative.zscore
    # without importing it.
    toy = (
        Path(__file__).resolve().parents[2]  # apps/api/app
        / ".."
        / ".."
        / "packages"
        / "qeeg-pipeline"
        / "tests"
        / "fixtures"
        / "toy_norms.csv"
    )
    try:
        return toy.resolve().exists()
    except Exception:
        return False


def _norm_db_status() -> NormativeDatabaseStatus:
    # If a deployment wants to point at a non-toy normative file, it can set
    # DEEPSYNAPS_QEEG_NORM_CSV_PATH to a readable path. We do not return the path.
    configured = _env_present("DEEPSYNAPS_QEEG_NORM_CSV_PATH")
    if configured:
        try:
            p = Path(os.environ["DEEPSYNAPS_QEEG_NORM_CSV_PATH"]).expanduser()
            if p.exists() and p.is_file():
                return NormativeDatabaseStatus(
                    status="configured",
                    version="configured",
                    clinical_caveat=(
                        "Decision-support only. Normative outputs depend on the configured "
                        "reference database and require clinician review."
                    ),
                )
        except Exception:
            # Treat misconfigured path as unavailable rather than pretending it's configured.
            pass
        return NormativeDatabaseStatus(
            status="unavailable",
            version=None,
            clinical_caveat=(
                "Decision-support only. A normative DB path is configured but not readable; "
                "normative z-score outputs may be unavailable."
            ),
        )

    if _toy_norm_csv_present():
        return NormativeDatabaseStatus(
            status="toy",
            version="toy-0.1",
            clinical_caveat=(
                "Toy normative database only. Decision-support only. Clinician review required. "
                "Do not treat toy norms as clinically validated reference values."
            ),
        )

    return NormativeDatabaseStatus(
        status="unavailable",
        version=None,
        clinical_caveat=(
            "No normative database detected. Decision-support only. Clinician review required."
        ),
    )


def _wineeg_status() -> WineegReferenceStatus:
    # Always reference-only. If the package isn't installed, keep the safety boundary
    # but note that the library isn't available in this deployment.
    if _has_pkg("deepsynaps_qeeg.knowledge.wineeg_reference"):
        return WineegReferenceStatus()
    return WineegReferenceStatus(
        caveat=(
            "WinEEG-style workflow reference is reference-only, but the reference library "
            "module is not installed on this server. No native WinEEG compatibility."
        )
    )


def _feature(
    *,
    feature_id: str,
    label: str,
    status: CapabilityStatus,
    required_packages: list[str],
    clinical_caveat: str,
    ui_surfaces: list[str],
    required_env: list[str] | None = None,
    notes: str = "",
) -> CapabilityFeature:
    required_env = required_env or []
    return CapabilityFeature(
        id=feature_id,
        label=label,
        status=status,
        required_packages=list(required_packages),
        missing_packages=_missing(list(required_packages)),
        required_env=list(required_env),
        missing_env=[e for e in required_env if not _env_present(e)],
        clinical_caveat=clinical_caveat,
        ui_surfaces=list(ui_surfaces),
        notes=notes,
    )


def _capabilities_payload() -> QeegCapabilitiesResponse:
    norm_db = _norm_db_status()
    wineeg = _wineeg_status()

    has_mne = _has_pkg("mne")
    has_numpy = _has_pkg("numpy")

    # Optional dependencies
    has_pyprep = _has_pkg("pyprep")
    has_iclabel = _has_pkg("mne_icalabel")
    has_autoreject = _has_pkg("autoreject")
    has_specparam = _has_pkg("specparam")
    has_mne_conn = _has_pkg("mne_connectivity")
    has_networkx = _has_pkg("networkx")
    has_matplotlib = _has_pkg("matplotlib")
    has_weasyprint = _has_pkg("weasyprint")
    has_pandas = _has_pkg("pandas")
    has_nibabel = _has_pkg("nibabel")
    has_psycopg = _has_pkg("psycopg")
    has_pcntk = _has_pkg("pcntk")
    has_pylsl = _has_pkg("pylsl")

    # Core pipeline package availability (helps distinguish "mne exists but qeeg package missing")
    has_qeeg_pkg = _has_pkg("deepsynaps_qeeg")

    # Live streaming is also feature-flagged; we report env presence but do not leak value.
    live_flag = "DEEPSYNAPS_FEATURE_LIVE_QEEG"
    live_enabled = _env_present(live_flag) and os.environ.get(live_flag, "").strip().lower() in {"1", "true", "yes"}

    # RAG relies on DB URL presence + psycopg. Never return the DSN.
    rag_env = "DEEPSYNAPS_DB_URL"
    rag_configured = _env_present(rag_env)

    features: list[CapabilityFeature] = []

    # --- Required core ---
    features.append(
        _feature(
            feature_id="mne_ingest",
            label="MNE EEG file ingest",
            status="active" if has_mne else "unavailable",
            required_packages=["mne"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer", "Raw Workbench"],
            notes="File I/O uses MNE readers (EDF/BDF/BrainVision/EEGLAB/FIF) in the qEEG pipeline.",
        )
    )

    # Preprocess
    preprocess_status: CapabilityStatus
    if not has_mne:
        preprocess_status = "unavailable"
    elif has_pyprep:
        preprocess_status = "active"
    else:
        preprocess_status = "fallback"
    features.append(
        _feature(
            feature_id="pyprep_preprocess",
            label="PyPREP robust reference preprocessing",
            status=preprocess_status,
            required_packages=["mne"],
            clinical_caveat="Decision-support only. Clinician review required. Fallback uses average reference.",
            ui_surfaces=["qEEG Analyzer", "Raw Workbench"],
            notes="Falls back gracefully when PyPREP is unavailable or fails on a recording.",
        )
    )

    # ICA core (in MNE)
    features.append(
        _feature(
            feature_id="ica",
            label="ICA artifact decomposition (MNE)",
            status="active" if has_mne else "unavailable",
            required_packages=["mne"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["Raw Workbench", "qEEG Analyzer"],
            notes="ICA fitting uses MNE (picard when available, with fallback to infomax).",
        )
    )

    # ICLabel
    iclabel_status: CapabilityStatus
    if not has_mne:
        iclabel_status = "unavailable"
    elif has_iclabel:
        iclabel_status = "active"
    else:
        iclabel_status = "unavailable"
    features.append(
        _feature(
            feature_id="iclabel",
            label="ICLabel-assisted component labeling",
            status=iclabel_status,
            required_packages=["mne", "mne_icalabel"],
            clinical_caveat="Decision-support only. Clinician review required. ICLabel may be unavailable in some deployments.",
            ui_surfaces=["Raw Workbench", "qEEG Analyzer"],
        )
    )

    # autoreject
    ar_status: CapabilityStatus
    if not has_mne:
        ar_status = "unavailable"
    elif has_autoreject:
        ar_status = "active"
    else:
        ar_status = "fallback"
    features.append(
        _feature(
            feature_id="autoreject",
            label="Epoch-level rejection (autoreject)",
            status=ar_status,
            required_packages=["mne"],
            clinical_caveat="Decision-support only. Clinician review required. When unavailable, epochs may be less robustly cleaned.",
            ui_surfaces=["qEEG Analyzer"],
            notes="When the package is missing, the pipeline retains epochs without autoreject refinement.",
        )
    )

    # Spectral bandpower is core to qEEG package; require mne+numpy.
    spectral_status: CapabilityStatus
    if has_mne and has_numpy and has_qeeg_pkg:
        spectral_status = "active"
    else:
        spectral_status = "unavailable"
    features.append(
        _feature(
            feature_id="spectral_bandpower",
            label="Spectral band power (absolute/relative)",
            status=spectral_status,
            required_packages=["mne", "numpy"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer"],
        )
    )

    # SpecParam
    specparam_status: CapabilityStatus
    if not (has_mne and has_numpy and has_qeeg_pkg):
        specparam_status = "unavailable"
    elif has_specparam:
        specparam_status = "active"
    else:
        specparam_status = "fallback"
    features.append(
        _feature(
            feature_id="specparam",
            label="SpecParam aperiodic slope/offset/R²",
            status=specparam_status,
            required_packages=["mne", "numpy"],
            clinical_caveat="Decision-support only. Clinician review required. When SpecParam is unavailable, aperiodic metrics are not computed.",
            ui_surfaces=["qEEG Analyzer"],
            notes="SpecParam is optional; the pipeline returns None values per channel when missing.",
        )
    )

    # PAF: computed either via SpecParam peaks or fallback PSD argmax.
    paf_status: CapabilityStatus
    if not (has_mne and has_numpy and has_qeeg_pkg):
        paf_status = "unavailable"
    elif has_specparam:
        paf_status = "active"
    else:
        paf_status = "fallback"
    features.append(
        _feature(
            feature_id="paf",
            label="Peak alpha frequency (PAF)",
            status=paf_status,
            required_packages=["mne", "numpy"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer"],
            notes="When SpecParam is missing, PAF falls back to PSD peak in 7–13 Hz.",
        )
    )

    # Connectivity: coherence & wPLI via mne-connectivity; fallback returns zeros.
    conn_status: CapabilityStatus
    if not (has_mne and has_numpy and has_qeeg_pkg):
        conn_status = "unavailable"
    elif has_mne_conn:
        conn_status = "active"
    else:
        conn_status = "fallback"
    for fid, lbl in (("coherence", "Coherence connectivity"), ("wpli", "wPLI connectivity")):
        features.append(
            _feature(
                feature_id=fid,
                label=lbl,
                status=conn_status,
                required_packages=["mne", "numpy"],
                clinical_caveat="Decision-support only. Clinician review required. Fallback may return zero matrices when mne-connectivity is unavailable.",
                ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
                notes="Connectivity uses mne-connectivity when available; otherwise matrices are zero-filled to preserve contract shape.",
            )
        )

    # Graph metrics: require networkx.
    graph_status: CapabilityStatus
    if not (has_numpy and has_qeeg_pkg):
        graph_status = "unavailable"
    elif has_networkx:
        graph_status = "active"
    else:
        graph_status = "unavailable"
    features.append(
        _feature(
            feature_id="graph_metrics",
            label="Graph metrics (small-worldness, clustering, path length)",
            status=graph_status,
            required_packages=["numpy", "networkx"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer"],
        )
    )

    # Source localization
    src_status: CapabilityStatus
    if not (has_mne and has_numpy and has_qeeg_pkg):
        src_status = "unavailable"
    elif has_pandas and has_nibabel:
        src_status = "experimental"
    else:
        src_status = "unavailable"
    features.append(
        _feature(
            feature_id="source_localization",
            label="Source localization (template fsaverage; MNE-based eLORETA/sLORETA)",
            status=src_status,
            required_packages=["mne", "numpy", "pandas", "nibabel"],
            clinical_caveat="Decision-support only. Clinician review required. Model-derived outputs require clinical correlation.",
            ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
            notes="Source localization is heavy and may be skipped by quality guards (channels/epochs).",
        )
    )
    features.append(
        _feature(
            feature_id="source_roi_bandpower",
            label="Source ROI band power (Desikan–Killiany)",
            status=src_status,
            required_packages=["mne", "numpy", "pandas", "nibabel"],
            clinical_caveat="Decision-support only. Clinician review required. Model-derived outputs require clinical correlation.",
            ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
        )
    )

    # Normative z-scores
    norm_status: CapabilityStatus
    if not has_qeeg_pkg:
        norm_status = "unavailable"
    elif norm_db.status == "toy":
        norm_status = "experimental"
    elif norm_db.status == "configured":
        norm_status = "active"
    else:
        norm_status = "unavailable"
    features.append(
        _feature(
            feature_id="normative_zscore",
            label="Normative z-score outputs",
            status=norm_status,
            required_packages=["deepsynaps_qeeg"],
            clinical_caveat=norm_db.clinical_caveat,
            ui_surfaces=["qEEG Analyzer"],
            notes="Requires age/sex inputs. Toy norms are clearly labeled and must not be treated as clinically validated reference values.",
        )
    )

    # GAMLSS norms
    gamlss_status: CapabilityStatus
    if not has_qeeg_pkg:
        gamlss_status = "unavailable"
    elif has_pcntk:
        gamlss_status = "experimental"
    else:
        gamlss_status = "unavailable"
    features.append(
        _feature(
            feature_id="gamlss_norms",
            label="GAMLSS centiles / z-scores (optional)",
            status=gamlss_status,
            required_packages=["pcntk"],
            clinical_caveat="Decision-support only. Clinician review required. Experimental until validated against a clinical normative dataset.",
            ui_surfaces=["qEEG Analyzer"],
        )
    )

    # Report HTML/PDF
    html_status: CapabilityStatus
    if not has_qeeg_pkg:
        html_status = "unavailable"
    else:
        # HTML generation has a fallback even when templating libs are missing.
        html_status = "active"
    features.append(
        _feature(
            feature_id="report_html",
            label="Report HTML rendering",
            status=html_status,
            required_packages=["deepsynaps_qeeg"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
        )
    )
    pdf_status: CapabilityStatus
    if not has_qeeg_pkg:
        pdf_status = "unavailable"
    elif has_weasyprint:
        pdf_status = "active"
    else:
        pdf_status = "unavailable"
    features.append(
        _feature(
            feature_id="report_pdf",
            label="Report PDF rendering (WeasyPrint)",
            status=pdf_status,
            required_packages=["weasyprint"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
        )
    )

    # Visual topomaps depend on matplotlib+mne.
    topo_status: CapabilityStatus
    if has_mne and has_matplotlib and has_qeeg_pkg:
        topo_status = "active"
    elif has_mne and has_qeeg_pkg:
        topo_status = "unavailable"
    else:
        topo_status = "unavailable"
    features.append(
        _feature(
            feature_id="visual_topomaps",
            label="Topomap visualizations (server-rendered)",
            status=topo_status,
            required_packages=["mne", "matplotlib"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer", "qEEG Viz"],
        )
    )

    # Live streaming / LSL
    live_status: CapabilityStatus
    if not (has_qeeg_pkg and has_numpy):
        live_status = "unavailable"
    elif live_enabled and has_pylsl:
        live_status = "experimental"
    elif live_enabled and not has_pylsl:
        live_status = "unavailable"
    else:
        live_status = "unavailable"
    features.append(
        _feature(
            feature_id="live_streaming_lsl",
            label="Live streaming (LSL) monitoring",
            status=live_status,
            required_packages=["numpy", "pylsl"],
            required_env=[live_flag],
            clinical_caveat="Monitoring only — not diagnostic. Clinician review required.",
            ui_surfaces=["Live qEEG panel"],
            notes="Also gated by plan entitlements and feature flag; this endpoint reports only server-side dependency/flag presence.",
        )
    )

    # RAG literature
    rag_status: CapabilityStatus
    if not has_qeeg_pkg:
        rag_status = "unavailable"
    elif rag_configured and has_psycopg:
        rag_status = "active"
    elif has_qeeg_pkg:
        rag_status = "fallback"
    else:
        rag_status = "unavailable"
    features.append(
        _feature(
            feature_id="rag_literature",
            label="Literature retrieval (RAG)",
            status=rag_status,
            required_packages=["deepsynaps_qeeg"],
            required_env=[rag_env],
            clinical_caveat="Decision-support only. Clinician review required. Citations must be checked.",
            ui_surfaces=["qEEG Analyzer", "Reports"],
            notes="When DB is not configured/available, the pipeline may fall back to a small toy fixture for tests/offline use.",
        )
    )

    # Recommender
    rec_status: CapabilityStatus
    if _has_pkg("deepsynaps_qeeg.recommender"):
        rec_status = "experimental"
    else:
        rec_status = "unavailable"
    features.append(
        _feature(
            feature_id="recommender",
            label="Protocol recommender (rules/ranker scaffold)",
            status=rec_status,
            required_packages=["deepsynaps_qeeg"],
            clinical_caveat="Decision-support only. Clinician review required. Not a treatment recommendation.",
            ui_surfaces=["qEEG Analyzer"],
        )
    )

    # AI adjacents (risk scores, similar cases, explainability, copilot)
    ai_status: CapabilityStatus
    if _has_pkg("deepsynaps_qeeg.ai"):
        ai_status = "experimental"
    else:
        ai_status = "unavailable"
    features.append(
        _feature(
            feature_id="ai_adjacents",
            label="AI adjuncts (copilot/risk/similarity/explainability scaffolds)",
            status=ai_status,
            required_packages=["deepsynaps_qeeg"],
            clinical_caveat="Decision-support only. Clinician review required.",
            ui_surfaces=["qEEG Analyzer", "Copilot"],
            notes="Availability depends on model weights/backends; this endpoint does not load models.",
        )
    )

    # WinEEG reference library (reference-only)
    features.append(
        _feature(
            feature_id="wineeg_reference_library",
            label="WinEEG-style workflow reference library",
            status="reference_only",
            required_packages=[],
            clinical_caveat="Reference-only checklist. Decision-support only. Clinician review required. No native WinEEG compatibility.",
            ui_surfaces=["Raw Workbench", "Copilot"],
            notes="Workflow guidance only (no proprietary integration).",
        )
    )

    # Ensure deterministic ordering for UI/tests.
    features.sort(key=lambda f: f.id)

    return QeegCapabilitiesResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        features=features,
        normative_database=norm_db,
        wineeg_reference=wineeg,
    )


@router.get("/capabilities", response_model=QeegCapabilitiesResponse)
def get_qeeg_capabilities() -> Any:
    """Report qEEG feature/dependency availability.

    This endpoint performs only lightweight dependency/config checks. It does
    not import heavy scientific stacks beyond spec lookups and does not run
    computations.
    """

    return _capabilities_payload().model_dump()

