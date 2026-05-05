"""QEEG-105 routers package."""

from .qeeg_analysis_catalog_router import router as qeeg_analysis_catalog_router
from .qeeg_analysis_results_router import router as qeeg_analysis_results_router
from .qeeg_analysis_run_router import router as qeeg_analysis_run_router

__all__ = [
    "qeeg_analysis_catalog_router",
    "qeeg_analysis_results_router",
    "qeeg_analysis_run_router",
]

