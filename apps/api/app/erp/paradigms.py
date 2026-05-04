"""WinEEG-style parameter presets (drop-in names; values are starting points)."""

from __future__ import annotations

from typing import Any

# Keys align with ErpDialog / API: preStimMs, postStimMs, baselineFromMs, baselineToMs, minTrials, classes

P300_PAR: dict[str, Any] = {
    "name": "P300 (Oddball)",
    "stimulusClasses": ["Target", "NonTarget", "Non-target", "Deviant", "Standard"],
    "preStimMs": -200,
    "postStimMs": 1000,
    "baselineFromMs": -200,
    "baselineToMs": 0,
    "minTrials": 30,
    "description": "Classic oddball P300",
}

GO_NOGO_RAP: dict[str, Any] = {
    "name": "Go / No-Go",
    "stimulusClasses": ["Go", "NoGo", "No-go"],
    "preStimMs": -200,
    "postStimMs": 800,
    "baselineFromMs": -200,
    "baselineToMs": 0,
    "minTrials": 20,
}

TOVA_PAR: dict[str, Any] = {
    "name": "TOVA",
    "stimulusClasses": ["Target", "NonTarget", "Non-target", "Standard"],
    "preStimMs": -200,
    "postStimMs": 1000,
    "baselineFromMs": -200,
    "baselineToMs": 0,
    "minTrials": 30,
}

PAT_H_PAR: dict[str, Any] = {
    "name": "Pattern reversal (H)",
    "stimulusClasses": ["Target", "NonTarget"],
    "preStimMs": -100,
    "postStimMs": 500,
    "baselineFromMs": -100,
    "baselineToMs": 0,
    "minTrials": 20,
}

PAT_HLR_PAR: dict[str, Any] = {
    "name": "Pattern reversal (HLR)",
    "stimulusClasses": ["Target", "NonTarget", "Standard"],
    "preStimMs": -100,
    "postStimMs": 500,
    "baselineFromMs": -100,
    "baselineToMs": 0,
    "minTrials": 20,
}

PAT_LR_PAR: dict[str, Any] = {
    "name": "Pattern reversal (LR)",
    "stimulusClasses": ["Target", "NonTarget"],
    "preStimMs": -100,
    "postStimMs": 500,
    "baselineFromMs": -100,
    "baselineToMs": 0,
    "minTrials": 20,
}

PRESET_BY_ID: dict[str, dict[str, Any]] = {
    "P300.PAR": P300_PAR,
    "Go_NoGo.RAP": GO_NOGO_RAP,
    "TOVA.PAR": TOVA_PAR,
    "PAT_H.PAR": PAT_H_PAR,
    "PAT_HLR.PAR": PAT_HLR_PAR,
    "PAT_LR.PAR": PAT_LR_PAR,
}


def list_paradigms() -> list[dict[str, Any]]:
    return [{"id": k, **v} for k, v in PRESET_BY_ID.items()]
