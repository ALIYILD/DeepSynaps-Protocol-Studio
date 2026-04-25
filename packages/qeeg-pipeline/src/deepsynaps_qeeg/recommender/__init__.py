"""Protocol recommender (decision support).

This package provides an auditable rules + evidence scoring recommender that
maps qEEG feature summaries to ranked protocol candidates from the existing
clinical protocol catalog.
"""

from .protocols import Protocol, ProtocolLibrary
from .features import FeatureVector, summarize_for_recommender
from .ranker import ProtocolRecommendation, recommend_protocols

__all__ = [
    "FeatureVector",
    "Protocol",
    "ProtocolLibrary",
    "ProtocolRecommendation",
    "recommend_protocols",
    "summarize_for_recommender",
]

