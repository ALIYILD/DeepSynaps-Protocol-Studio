"""Professional ethics and conduct guide derived from IQCB and ISNR standards.

Encodes the International QEEG Certification Board Professional Standards
and Ethical Principles (PSEP) and ISNR definitions for neurofeedback,
biofeedback, and neuromodulation. This is advisory reference material for
governance-aware clinical decision support — it does not replace legal
counsel or jurisdiction-specific licensing requirements.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class EthicalStandard:
    """A single ethical principle or standard with domain and rationale."""

    standard_id: str
    domain: str
    principle: str
    guidance: str
    key_references: tuple[str, ...]


_STANDARDS: tuple[EthicalStandard, ...] = (
    # ── Scope and Competence ──────────────────────────────────────────────────
    EthicalStandard(
        standard_id="scope_01",
        domain="scope_of_practice",
        principle="IQCB certification is not a license to practice independently.",
        guidance=(
            "Certificants must operate within applicable local, state, and national laws. "
            "IQCB certification becomes invalid if a professional license is suspended, revoked, or not renewed. "
            "Unlicensed providers treating medical or psychological conditions must acquire appropriate supervision."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
            "Hammond et al. (2011). Standards of practice for neurofeedback and neurotherapy. ISNR.",
        ),
    ),
    EthicalStandard(
        standard_id="competence_01",
        domain="competence",
        principle="Recognize the boundaries of training and competence.",
        guidance=(
            "Only provide QEEG assessment and treatment services in which you have expertise. "
            "Recognize the proper limitations of current technology. Inform all parties about clinical utility, "
            "possible negative effects, and whether procedures are experimental or clinically verified. "
            "Maintain current knowledge through continuing education."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Informed Consent ──────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="consent_01",
        domain="informed_consent",
        principle="Obtain written informed consent for all assessment and treatment procedures.",
        guidance=(
            "Consent must cover the purpose and nature of procedures, billing and fee collections, "
            "procedures to protect confidentiality, and conditions that limit confidentiality. "
            "For experimental applications, additional written consent is required. "
            "Distinguishing experimental from clinically validated procedures requires familiarity with published studies."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Confidentiality ───────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="confidentiality_01",
        domain="confidentiality",
        principle="Protect the confidentiality of client data.",
        guidance=(
            "Information may only be released with written consent of the client or legal representative, "
            "or when nondisclosure would endanger the client or others. Specify legal limits of confidentiality in advance, "
            "particularly regarding mandated reporting of abuse or neglect. Store and destroy records in ways that maintain confidentiality."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
            "APA (n.d.). How to monitor patients' medications.",
        ),
    ),
    # ── Client Welfare ────────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="welfare_01",
        domain="client_welfare",
        principle="Protect the welfare, rights, and dignity of clients.",
        guidance=(
            "Sexual intimacy with current clients, trainees, supervisees, and research subjects is prohibited. "
            "Adhere to infection mitigation standards for sensors and office environments. "
            "Respect client privacy and sensitivity during physical contact (e.g., sensor attachment). "
            "Special care must be taken to protect the rights of children. Do not discriminate or refuse services."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Professional Relationships ────────────────────────────────────────────
    EthicalStandard(
        standard_id="relationships_01",
        domain="professional_relationships",
        principle="Respect interdisciplinary colleagues and avoid exploitative relationships.",
        guidance=(
            "Only treat medical disorders if clients have first received a medical evaluation and/or are under physician care. "
            "Avoid multiple relationships that could impair professional judgment or increase risk of exploitation. "
            "Strive to be objective in judgment of colleagues. Maintain good professional relationships even when opinions differ."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Public Statements ─────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="public_01",
        domain="public_statements",
        principle="Public statements must be scientifically verifiable and not misleading.",
        guidance=(
            "Accurately represent the efficacy of QEEG assessments and neurofeedback for all disorders or conditions treated. "
            "Recognize limits and uncertainties of data. Accurately represent qualifications, affiliations, and positions. "
            "Personal interests must be superseded by professional objectivity and concern for client welfare. "
            "Directory listings, business cards, and websites must be professional and accurate."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Research Ethics ───────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="research_01",
        domain="research_ethics",
        principle="Protect the welfare of research participants and report results accurately.",
        guidance=(
            "Adhere to IRB and state/national regulations. Obtain informed consent with explanation of confidentiality protections. "
            "Protect participants from physical and psychological harm. Respect freedom to decline or discontinue participation. "
            "Debrief participants after data collection. State limitations (sampling bias, small samples, limited follow-up) explicitly."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Supervision ───────────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="supervision_01",
        domain="supervision",
        principle="Unlicensed providers must work under appropriate supervision.",
        guidance=(
            "Supervisors must be on-site for full-time face-to-face supervision when unlicensed providers treat diagnostic conditions. "
            "Written agreements must detail duties, responsibilities, limits of independent action, and reporting of adverse reactions. "
            "The licensed supervisor retains ultimate ethical responsibility and accountability. "
            "Supervisor name and contact information must be provided to patients when services are provided under supervision."
        ),
        key_references=(
            "Hammond et al. (2011). Standards of practice for neurofeedback and neurotherapy. ISNR.",
        ),
    ),
    # ── Multiculturalism ──────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="multicultural_01",
        domain="multiculturalism",
        principle="Apply culturally appropriate skills and engage in ongoing diversity education.",
        guidance=(
            "Recognize that personal attitudes and beliefs can detrimentally influence perceptions of individuals from different backgrounds. "
            "Apply culturally appropriate skills in QEEG assessments and related clinical services. "
            "Regularly engage in professional reading and education on multiculturalism and diversity."
        ),
        key_references=(
            "International QEEG Certification Board (2021). PSEP.",
        ),
    ),
    # ── Mandated Reporting ────────────────────────────────────────────────────
    EthicalStandard(
        standard_id="mandated_01",
        domain="mandated_reporting",
        principle="Report suspected or known abuse or neglect of children, dependents, or vulnerable adults.",
        guidance=(
            "Many QEEG practitioners are in mental health or medical fields with legal mandated reporting obligations. "
            "A licensee must submit a written report to the board within 30 days. "
            "Consequences of not reporting include disciplinary action, lawsuits, and legal ramifications. "
            "When in doubt, contact the state's reporting hotline. If you have reason to suspect abuse, report it."
        ),
        key_references=(
            "APA (2017). Legal Corner: Mandatory abuse reporting.",
            "Texas State Board of Examiners of Professional Counselors (2016).",
        ),
    ),
    # ── Medication Monitoring ─────────────────────────────────────────────────
    EthicalStandard(
        standard_id="medication_01",
        domain="medication_monitoring",
        principle="Know what drugs clients are taking, why, and whether they experience side effects.",
        guidance=(
            "APA recommends practicing psychologists know what drugs their clients are taking. "
            "1 in 6 American adults takes at least one psychiatric drug. "
            "Stay in your lane — if not qualified to provide feedback about psychiatric medications, defer to the prescribing physician. "
            "Tips: make a medication list, rely on proven tools, discuss purposes and side effects, help with adherence, check in regularly."
        ),
        key_references=(
            "APA (n.d.). How to monitor patients' medications.",
            "Moore & Mattison (2017). Adult Utilization of Psychiatric Drugs. JAMA Intern Med.",
        ),
    ),
    # ── Neurofeedback Side Effects ────────────────────────────────────────────
    EthicalStandard(
        standard_id="side_effects_01",
        domain="side_effects",
        principle="Inform clients of potential neurofeedback side effects and monitor for adverse reactions.",
        guidance=(
            "Neurofeedback is less likely to result in side effects than medication, but they can occur. "
            "Occasional side effects include: fatigue, feeling spacey, anxiousness, headaches, difficulty falling asleep, agitation or irritability. "
            "Most side effects pass shortly after the training session. Long training sessions increase risk. "
            "Practitioners should document and report side effects to supervisors when applicable."
        ),
        key_references=(
            "Hammond (2011). What is neurofeedback: An update. Journal of Neurotherapy.",
            "Gunkelman & Johnstone (2005). Neurofeedback and the brain. Journal of Adult Development.",
            "Matthews (2007). Neurofeedback overtraining and the vulnerable patient.",
        ),
    ),
)

# ── Domain definitions (from ISNR / IQCB) ───────────────────────────────────

_DOMAIN_DEFINITIONS: dict[str, dict[str, str]] = {
    "neurofeedback": {
        "name": "Neurofeedback Training (NFT)",
        "definition": (
            "A self-regulation technique that uses monitoring devices to provide moment-to-moment "
            "information to individuals on the state of their physiological functioning. The distinguishing "
            "characteristic is a focus on the central nervous system and the brain. NFT has foundations in "
            "basic and applied neuroscience as well as data-based clinical practice."
        ),
        "scope_note": (
            "NFT does not involve surgery or medication and is neither painful nor embarrassing. "
            "When provided by a licensed professional with appropriate training, trainees generally do not "
            "experience negative side-effects. NFT operates at a brain functional level and transcends "
            "the need to classify using existing diagnostic categories."
        ),
    },
    "neuroregulation": {
        "name": "Neuroregulation",
        "definition": (
            "The process by which neuronal mechanisms self-regulate (either instinctively or through a learned response) "
            "with the purpose to adjust bodily activities according to the needs of the organism and environmental changes. "
            "Neuroregulation techniques may include NFT, BFT, or as a consequence of NMT techniques."
        ),
        "scope_note": "Modulates structural, functional, and biochemical properties of cells and organs.",
    },
    "biofeedback": {
        "name": "Biofeedback Training (BFT)",
        "definition": (
            "A process that enables an individual to learn how to change physiological activity for the purposes of "
            "improving health and performance. Precise instruments measure physiological activity such as brainwaves, "
            "heart function, breathing, muscle activity, and skin temperature."
        ),
        "scope_note": (
            "The presentation of feedback information — often in conjunction with changes in thinking, emotions, and behavior — "
            "supports desired physiological changes. Over time, these changes can endure without continued use of an instrument."
        ),
    },
    "neuromodulation": {
        "name": "Neuromodulation Training (NMT)",
        "definition": (
            "A technology whose goal is to modulate (enhance or suppress) target neuronal activity by applying a stimulus "
            "such as electrical stimulation, chemical agent, or other agent. NMT can be defined as the alteration of nerve activity "
            "through targeted delivery of a stimulus to specific neurological sites in the body."
        ),
        "scope_note": (
            "Common in-office NMT procedures include transcranial magnetic stimulation (TMS), transcranial direct or alternating "
            "current stimulation (tDCS/tACS), pulsed electromagnetic field (pEMF), and photobiomodulation. Audio-visual entrainment (AVE) "
            "and repetitive transcranial magnetic stimulation (rTMS) provoke automatic brain responses rather than teaching self-regulation."
        ),
    },
}

_STANDARD_INDEX: dict[str, EthicalStandard] = {}
for _entry in _STANDARDS:
    _STANDARD_INDEX[_entry.standard_id] = _entry

_DOMAIN_INDEX: dict[str, list[EthicalStandard]] = {}
for _entry in _STANDARDS:
    _DOMAIN_INDEX.setdefault(_entry.domain, []).append(_entry)


class EthicsAtlas:
    """Read-only accessor for QEEG/neurofeedback ethical standards."""

    @staticmethod
    def lookup(standard_id: str) -> EthicalStandard | None:
        return _STANDARD_INDEX.get(standard_id)

    @staticmethod
    def by_domain(domain: str) -> list[EthicalStandard]:
        return list(_DOMAIN_INDEX.get(domain, []))

    @staticmethod
    def all_standards() -> tuple[EthicalStandard, ...]:
        return _STANDARDS

    @staticmethod
    def domain_definition(domain: str) -> dict[str, str] | None:
        return _DOMAIN_DEFINITIONS.get(domain)


def explain_ethical_standard(standard_id: str) -> dict[str, str] | None:
    """Return a dict describing *standard_id*, or None if unknown."""
    standard = EthicsAtlas.lookup(standard_id)
    if standard is None:
        return None
    return {
        "standard_id": standard.standard_id,
        "domain": standard.domain,
        "principle": standard.principle,
        "guidance": standard.guidance,
        "key_references": "; ".join(standard.key_references),
    }


def check_practice_compliance(
    role: str,
    licensed: bool,
    treats_diagnostic_conditions: bool,
    has_supervision: bool,
    has_written_consent: bool,
) -> dict[str, list[str]]:
    """Return advisory compliance flags for a practice configuration.

    Parameters
    ----------
    role : str
        e.g. ``"technician"``, ``"diplomate"``, ``"neurologist"``.
    licensed : bool
        Whether the practitioner holds a relevant professional license.
    treats_diagnostic_conditions : bool
        Whether the practice treats medical or psychological conditions.
    has_supervision : bool
        Whether unlicensed practice is supervised by a licensed provider.
    has_written_consent : bool
        Whether written informed consent is obtained.

    Returns
    -------
    dict
        Keys ``compliant`` (list of affirmations) and ``flags`` (list of advisory warnings).
    """
    compliant: list[str] = []
    flags: list[str] = []

    if has_written_consent:
        compliant.append("Written informed consent is documented.")
    else:
        flags.append("Written informed consent is required for all assessment and treatment procedures.")

    if licensed:
        compliant.append("Practitioner holds a relevant professional license.")
    else:
        if treats_diagnostic_conditions:
            if has_supervision:
                compliant.append("Unlicensed practice is under appropriate supervision for diagnostic conditions.")
            else:
                flags.append(
                    "Unlicensed providers treating diagnostic conditions must work under the supervision "
                    "of a licensed provider."
                )
        else:
            compliant.append("Unlicensed practice for non-diagnostic purposes does not require supervision.")

    if treats_diagnostic_conditions:
        flags.append(
            "Ensure clients have received a medical evaluation and/or are under the care of a physician "
            "before treating medical disorders."
        )

    return {"compliant": compliant, "flags": flags}
