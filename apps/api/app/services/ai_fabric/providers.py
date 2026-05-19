from __future__ import annotations

from importlib import import_module


class AIProviderFactory:
    _provider_map = {
        "me-llama-13b": (
            "app.services.ai_fabric.evidence.medrag",
            "MeLLaMAProvider",
        ),
        "pubmedbert": (
            "app.services.ai_fabric.evidence.pubmedbert",
            "PubMedBERTProvider",
        ),
        "medrag": (
            "app.services.ai_fabric.evidence.medrag",
            "MedRAGProvider",
        ),
        "eegnet-v1": (
            "app.services.ai_fabric.qeeg.eegnet",
            "EEGNetProvider",
        ),
        "biot-v1": (
            "app.services.ai_fabric.qeeg.biot",
            "BIOTProvider",
        ),
        "fastsurfer-v1": (
            "app.services.ai_fabric.imaging.fastsurfer",
            "FastSurferProvider",
        ),
        "simnibs-v4.6": (
            "app.services.ai_fabric.imaging.simnibs",
            "SimNIBSProvider",
        ),
        "brain-jepa-v1": (
            "app.services.ai_fabric.imaging.brain_jepa",
            "BrainJEPAProvider",
        ),
        "cbra-mod-v1": (
            "app.services.ai_fabric.qeeg.eegnet",
            "CBraModProvider",
        ),
        "brain-harmony-v1": (
            "app.services.ai_fabric.qeeg.biot",
            "BrainHarmonyProvider",
        ),
        "sgacc-connectivity-v1": (
            "app.services.ai_fabric.imaging.brain_jepa",
            "SGACCConnectivityProvider",
        ),
    }

    def create(self, model_id: str):
        if model_id not in self._provider_map:
            raise KeyError(model_id)
        module_name, class_name = self._provider_map[model_id]
        module = import_module(module_name)
        provider_cls = getattr(module, class_name)
        return provider_cls()

    def list_status(self) -> list[dict[str, str | bool]]:
        rows: list[dict[str, str | bool]] = []
        for model_id, (module_name, class_name) in self._provider_map.items():
            try:
                module = import_module(module_name)
                available = hasattr(module, class_name)
            except Exception:
                available = False
            rows.append(
                {
                    "model_id": model_id,
                    "module": module_name,
                    "provider_class": class_name,
                    "available": available,
                }
            )
        return rows
