"""Reporting layer: structured features → JSON + HTML + PDF + MedRAG citations."""

from .generate import generate_report
from .rag import medrag_evidence

__all__ = ["generate_report", "medrag_evidence"]
