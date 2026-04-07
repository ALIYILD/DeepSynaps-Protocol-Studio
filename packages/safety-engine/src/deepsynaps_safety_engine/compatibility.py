from pydantic import BaseModel

from deepsynaps_core_schema import DeviceProfile, ModalityProfile


class CompatibilityResult(BaseModel):
    is_compatible: bool
    reasons: list[str]


def validate_modality_device(
    modality: ModalityProfile,
    device: DeviceProfile,
) -> CompatibilityResult:
    reasons: list[str] = []
    is_compatible = True

    if device.slug not in modality.supported_device_slugs:
        reasons.append(f"Modality '{modality.slug}' does not list device '{device.slug}'.")
        is_compatible = False

    if modality.slug not in device.supported_modality_slugs:
        reasons.append(f"Device '{device.slug}' does not support modality '{modality.slug}'.")
        is_compatible = False

    if is_compatible:
        reasons.append("Selected modality and device are compatible at the registry level.")

    return CompatibilityResult(is_compatible=is_compatible, reasons=reasons)
