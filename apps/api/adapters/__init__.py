#!/usr/bin/env python3
"""
Phase 4 - Batch C: Pharma + Evidence Adapters
==============================================
FDA Orange Book, NDC Directory, UNII, OTseeker, PEDro

All adapters follow the BaseAdapter pattern with consistent:
- fetch() → raw data acquisition
- transform() → canonical model conversion
- validate() → data quality checks
- Confidence tier annotation (A=authoritative, B=filtered evidence)
"""

from .orange_book_adapter import OrangeBookAdapter
from .ndc_directory_adapter import NdcDirectoryAdapter
from .unii_adapter import UniiAdapter
from .otseeker_adapter import OtseekerAdapter
from .pedro_adapter import PedroAdapter

__all__ = [
    "OrangeBookAdapter",
    "NdcDirectoryAdapter",
    "UniiAdapter",
    "OtseekerAdapter",
    "PedroAdapter",
]
