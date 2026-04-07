from deepsynaps_core_schema import ProtocolPlan


def render_web_preview(protocol: ProtocolPlan) -> dict[str, object]:
    return {
        "title": protocol.title,
        "summary": protocol.summary,
        "checks": protocol.checks,
        "export_targets": ["web", "docx", "pdf"],
    }
