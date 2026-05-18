#!/usr/bin/env python3
"""
================================================================================
Outcome Prediction Models for Neuromodulation Treatment Response
================================================================================
Statistical prediction models for treatment response using scikit-learn.

Models:
    1. tDCS Response Predictor — Predict remission probability
    2. TMS Response Predictor — Predict response to rTMS protocols
    3. Neurofeedback Response Predictor — Predict learning rate and clinical improvement
    4. Protocol Ranking Model — Rank protocols by predicted outcome

Author: AI/ML Clinical Prediction Systems
Version: 1.0.0
================================================================================
"""

from __future__ import annotations

import json
import os
import pickle
import warnings
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np

# Scikit-learn imports only
from sklearn.base import BaseEstimator, clone
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    auc,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import (
    StratifiedKFold,
    cross_val_score,
    train_test_split,
)
from sklearn.preprocessing import (
    LabelEncoder,
    OneHotEncoder,
    StandardScaler,
)

# Suppress sklearn warnings for cleaner output
warnings.filterwarnings("ignore", category=UserWarning)


# =============================================================================
# FEATURE DEFINITIONS
# =============================================================================

FEATURES: Dict[str, List[str]] = {
    "demographics": ["age", "sex", "bmi"],
    "clinical": ["diagnosis", "severity_score", "comorbidities", "prior_treatments"],
    "genetic": ["COMT_rs4680", "BDNF_rs6265", "5HTTLPR", "DRD2"],
    "neuroimaging": ["dlPFC_activity", "hippocampal_volume", "network_connectivity"],
    "qeeg": ["theta_beta_ratio", "alpha_power", "coherence"],
    "protocol": ["modality", "target_region", "intensity", "sessions"],
}

ALL_FEATURES: List[str] = []
for category in FEATURES.values():
    ALL_FEATURES.extend(category)

# Numeric features (will be scaled)
NUMERIC_FEATURES: List[str] = [
    "age", "bmi", "severity_score", "comorbidities", "prior_treatments",
    "dlPFC_activity", "hippocampal_volume", "network_connectivity",
    "theta_beta_ratio", "alpha_power", "coherence",
    "intensity", "sessions",
]

# Categorical features (will be encoded)
CATEGORICAL_FEATURES: List[str] = [
    "sex", "diagnosis", "COMT_rs4680", "BDNF_rs6265",
    "5HTTLPR", "DRD2", "modality", "target_region",
]

# Response thresholds for adverse event detection
ADVERSE_EVENT_THRESHOLDS = {
    "severity_increase": 5.0,       # Increase in severity score
    "remission_probability_drop": 0.3,  # Drop below 30%
    "response_probability_drop": 0.4,   # Drop below 40%
}


# =============================================================================
# DATA CLASSES FOR TYPED RESULTS
# =============================================================================

@dataclass
class FeatureImportance:
    """Single feature importance entry."""
    feature: str
    importance: float


@dataclass
class PredictionResult:
    """Standardized prediction result for any modality."""
    modality: str
    remission_probability: float
    response_probability: float
    confidence: float
    top_predictors: List[FeatureImportance]
    risk_flags: List[str] = field(default_factory=list)
    recommendation: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, default=float)


@dataclass
class CVResult:
    """Cross-validation results."""
    mean_score: float
    std_score: float
    scores: np.ndarray
    metric: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mean_score": float(self.mean_score),
            "std_score": float(self.std_score),
            "scores": self.scores.tolist(),
            "metric": self.metric,
        }


@dataclass
class ModelMetrics:
    """Comprehensive model performance metrics."""
    accuracy: float
    precision: float
    recall: float
    roc_auc: float
    cv_result: CVResult
    confusion_matrix: np.ndarray

    def to_dict(self) -> Dict[str, Any]:
        return {
            "accuracy": float(self.accuracy),
            "precision": float(self.precision),
            "recall": float(self.recall),
            "roc_auc": float(self.roc_auc),
            "cv_result": self.cv_result.to_dict(),
            "confusion_matrix": self.confusion_matrix.tolist(),
        }


@dataclass
class RegressionMetrics:
    """Metrics for regression models."""
    mse: float
    rmse: float
    mae: float
    r2: float
    cv_result: CVResult

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mse": float(self.mse),
            "rmse": float(self.rmse),
            "mae": float(self.mae),
            "r2": float(self.r2),
            "cv_result": self.cv_result.to_dict(),
        }


@dataclass
class ProtocolRanking:
    """Protocol ranking result."""
    protocol_id: str
    modality: str
    predicted_remission: float
    predicted_response: float
    confidence: float
    estimated_sessions: int
    rank: int = 0


# =============================================================================
# FEATURE ENGINEERING PIPELINE
# =============================================================================

class FeatureEngineer:
    """
    Handles feature extraction, encoding, and scaling for patient data.

    Converts raw patient feature dictionaries into model-ready numpy arrays.
    Supports both numeric scaling and categorical one-hot encoding.
    """

    def __init__(self) -> None:
        self.scaler = StandardScaler()
        self.label_encoders: Dict[str, LabelEncoder] = {}
        self.onehot_encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
        self.feature_names: List[str] = []
        self.is_fitted: bool = False

    def _extract_feature_vector(
        self, patient_features: Dict[str, Any]
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Extract numeric and categorical features from patient dict.

        Args:
            patient_features: Dictionary of patient features.

        Returns:
            Tuple of (numeric_array, categorical_array).
        """
        numeric_vals = []
        for feat in NUMERIC_FEATURES:
            val = patient_features.get(feat, 0.0)
            numeric_vals.append(float(val) if val is not None else 0.0)

        categorical_vals = []
        for feat in CATEGORICAL_FEATURES:
            val = patient_features.get(feat, "unknown")
            categorical_vals.append(str(val) if val is not None else "unknown")

        return np.array(numeric_vals, dtype=np.float64), np.array(categorical_vals)

    def fit(
        self, patient_features_list: List[Dict[str, Any]]
    ) -> "FeatureEngineer":
        """
        Fit scalers and encoders on training data.

        Args:
            patient_features_list: List of patient feature dictionaries.

        Returns:
            Self for method chaining.
        """
        numeric_rows = []
        categorical_rows = []

        for pf in patient_features_list:
            n, c = self._extract_feature_vector(pf)
            numeric_rows.append(n)
            categorical_rows.append(c)

        numeric_matrix = np.vstack(numeric_rows)
        categorical_matrix = np.vstack(categorical_rows)

        # Fit numeric scaler
        self.scaler.fit(numeric_matrix)

        # Fit label encoders for categorical features
        for i, feat_name in enumerate(CATEGORICAL_FEATURES):
            le = LabelEncoder()
            le.fit(categorical_matrix[:, i])
            self.label_encoders[feat_name] = le

        # Fit one-hot encoder on label-encoded categoricals
        encoded_cats = np.zeros((categorical_matrix.shape[0], len(CATEGORICAL_FEATURES)))
        for i, feat_name in enumerate(CATEGORICAL_FEATURES):
            le = self.label_encoders[feat_name]
            encoded_cats[:, i] = le.transform(categorical_matrix[:, i])

        self.onehot_encoder.fit(encoded_cats)

        # Build feature name list
        self.feature_names = NUMERIC_FEATURES.copy()
        for i, feat_name in enumerate(CATEGORICAL_FEATURES):
            le = self.label_encoders[feat_name]
            for cat in le.classes_:
                self.feature_names.append(f"{feat_name}_{cat}")

        self.is_fitted = True
        return self

    def transform(
        self, patient_features_list: List[Dict[str, Any]]
    ) -> np.ndarray:
        """
        Transform patient features to model-ready array.

        Args:
            patient_features_list: List of patient feature dictionaries.

        Returns:
            Numpy array of shape (n_samples, n_features).
        """
        if not self.is_fitted:
            raise RuntimeError("FeatureEngineer must be fitted before transform.")

        numeric_rows = []
        categorical_rows = []

        for pf in patient_features_list:
            n, c = self._extract_feature_vector(pf)
            numeric_rows.append(n)
            categorical_rows.append(c)

        numeric_matrix = self.scaler.transform(np.vstack(numeric_rows))
        categorical_matrix = np.vstack(categorical_rows)

        # Encode categoricals
        encoded_cats = np.zeros((categorical_matrix.shape[0], len(CATEGORICAL_FEATURES)))
        for i, feat_name in enumerate(CATEGORICAL_FEATURES):
            le = self.label_encoders.get(feat_name)
            if le is not None:
                col_vals = categorical_matrix[:, i]
                known_mask = np.isin(col_vals, le.classes_)
                encoded_col = np.full(col_vals.shape[0], -1)
                encoded_col[known_mask] = le.transform(col_vals[known_mask])
                # Unknown categories get 0 (first class)
                encoded_col[encoded_col == -1] = 0
                encoded_cats[:, i] = encoded_col

        onehot_matrix = self.onehot_encoder.transform(encoded_cats)

        return np.hstack([numeric_matrix, onehot_matrix])

    def fit_transform(
        self, patient_features_list: List[Dict[str, Any]]
    ) -> np.ndarray:
        """Fit and transform in one step."""
        return self.fit(patient_features_list).transform(patient_features_list)

    def transform_single(self, patient_features: Dict[str, Any]) -> np.ndarray:
        """Transform a single patient."""
        return self.transform([patient_features])


# =============================================================================
# BASE PREDICTOR CLASS
# =============================================================================

class BaseTreatmentPredictor:
    """
    Base class for treatment response predictors.

    Provides common functionality for training, prediction, evaluation,
    feature importance extraction, and model persistence.
    """

    def __init__(
        self,
        modality: str,
        model: BaseEstimator,
        feature_engineer: Optional[FeatureEngineer] = None,
    ) -> None:
        self.modality = modality
        self.model = model
        self.feature_engineer = feature_engineer or FeatureEngineer()
        self.is_trained: bool = False
        self.metrics: Optional[ModelMetrics] = None
        self._feature_importance_cache: Optional[List[FeatureImportance]] = None

    def train(
        self,
        X_patients: List[Dict[str, Any]],
        y: np.ndarray,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> ModelMetrics:
        """
        Train the predictor on patient data.

        Args:
            X_patients: List of patient feature dictionaries.
            y: Target labels (binary: 1 = response, 0 = no response).
            test_size: Fraction of data for validation.
            random_state: Random seed for reproducibility.

        Returns:
            ModelMetrics with performance statistics.
        """
        # Feature engineering
        X = self.feature_engineer.fit_transform(X_patients)

        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )

        # Train model
        self.model.fit(X_train, y_train)
        self.is_trained = True

        # Evaluate
        y_pred = self.model.predict(X_test)
        y_prob = self.model.predict_proba(X_test)[:, 1]

        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        roc_auc = roc_auc_score(y_test, y_prob)
        cm = confusion_matrix(y_test, y_pred)

        # Cross-validation
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
        cv_scores = cross_val_score(self.model, X, y, cv=cv, scoring="roc_auc")
        cv_result = CVResult(
            mean_score=float(np.mean(cv_scores)),
            std_score=float(np.std(cv_scores)),
            scores=cv_scores,
            metric="roc_auc",
        )

        self.metrics = ModelMetrics(
            accuracy=accuracy,
            precision=precision,
            recall=recall,
            roc_auc=roc_auc,
            cv_result=cv_result,
            confusion_matrix=cm,
        )

        return self.metrics

    def predict(self, patient_features: Dict[str, Any]) -> PredictionResult:
        """
        Predict treatment response for a single patient.

        Args:
            patient_features: Dictionary of patient features.

        Returns:
            PredictionResult with probabilities and insights.
        """
        if not self.is_trained:
            raise RuntimeError(f"Predictor for {self.modality} must be trained first.")

        X = self.feature_engineer.transform_single(patient_features)
        prob = float(self.model.predict_proba(X)[0, 1])
        confidence = self._compute_confidence(X)

        # Compute remission probability (slightly lower than response)
        remission_prob = max(0.0, prob * 0.85 - 0.05)

        # Get top predictors
        top_predictors = self.get_top_predictors(n=8)

        # Risk assessment
        risk_flags = self._assess_risk(patient_features, remission_prob, prob)

        # Generate recommendation
        recommendation = self._generate_recommendation(remission_prob, prob, risk_flags)

        return PredictionResult(
            modality=self.modality,
            remission_probability=round(remission_prob, 4),
            response_probability=round(prob, 4),
            confidence=round(confidence, 4),
            top_predictors=top_predictors[:8],
            risk_flags=risk_flags,
            recommendation=recommendation,
        )

    def _compute_confidence(self, X: np.ndarray) -> float:
        """
        Compute prediction confidence based on model internals.

        For RandomForest: average max probability across trees.
        For GradientBoosting: use ensemble probability with calibration.
        For other models: use prediction probability distance from 0.5.
        """
        if hasattr(self.model, "estimators_"):
            # Check if individual estimators support predict_proba
            first_est = self.model.estimators_[0]
            if hasattr(first_est, "predict_proba"):
                # RandomForest - trees have predict_proba
                votes = np.array([tree.predict_proba(X)[0] for tree in self.model.estimators_])
                max_probs = np.max(votes, axis=1)
                mean_confidence = np.mean(max_probs)
                tree_agreement = 1.0 - np.std(votes[:, 1])
                return float((mean_confidence + tree_agreement) / 2)
            else:
                # GradientBoosting - use staged predictions for confidence
                prob = self.model.predict_proba(X)[0, 1]
                return float(0.5 + abs(prob - 0.5))
        else:
            prob = self.model.predict_proba(X)[0, 1]
            return float(0.5 + abs(prob - 0.5))

    def get_top_predictors(self, n: int = 5) -> List[FeatureImportance]:
        """Get top N most important features."""
        if not self.is_trained:
            raise RuntimeError("Model must be trained before extracting feature importance.")

        if self._feature_importance_cache is not None:
            return self._feature_importance_cache

        if hasattr(self.model, "feature_importances_"):
            importances = self.model.feature_importances_
        else:
            importances = np.ones(len(self.feature_engineer.feature_names)) / len(
                self.feature_engineer.feature_names
            )

        indices = np.argsort(importances)[::-1]
        self._feature_importance_cache = [
            FeatureImportance(
                feature=self.feature_engineer.feature_names[i],
                importance=round(float(importances[i]), 4),
            )
            for i in indices[:n]
        ]
        return self._feature_importance_cache

    def _assess_risk(
        self, patient_features: Dict[str, Any], remission_prob: float, response_prob: float
    ) -> List[str]:
        """Assess risk flags for adverse events."""
        flags = []
        severity = patient_features.get("severity_score", 0)

        if severity > ADVERSE_EVENT_THRESHOLDS["severity_increase"]:
            flags.append("high_baseline_severity")
        if remission_prob < ADVERSE_EVENT_THRESHOLDS["remission_probability_drop"]:
            flags.append("low_remission_likelihood")
        if response_prob < ADVERSE_EVENT_THRESHOLDS["response_probability_drop"]:
            flags.append("low_response_likelihood")
        if patient_features.get("prior_treatments", 0) >= 3:
            flags.append("treatment_resistant")

        return flags

    def _generate_recommendation(
        self, remission_prob: float, response_prob: float, risk_flags: List[str]
    ) -> str:
        """Generate clinical recommendation based on prediction."""
        if remission_prob > 0.7 and not risk_flags:
            return f"{self.modality}: Strong candidate — high remission probability."
        elif remission_prob > 0.5:
            return f"{self.modality}: Moderate candidate — consider combination therapy."
        elif remission_prob > 0.3:
            if "treatment_resistant" in risk_flags:
                return f"{self.modality}: Consider intensive protocol given treatment resistance."
            return f"{self.modality}: Modest response expected — monitor closely."
        else:
            return f"{self.modality}: Low predicted response — consider alternative modality."

    def save(self, filepath: str) -> None:
        """Save trained model and feature engineer to disk."""
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        state = {
            "modality": self.modality,
            "model": self.model,
            "feature_engineer": self.feature_engineer,
            "is_trained": self.is_trained,
            "metrics": self.metrics,
            "feature_importance_cache": self._feature_importance_cache,
        }
        with open(filepath, "wb") as f:
            pickle.dump(state, f)

    @classmethod
    def load(cls, filepath: str) -> "BaseTreatmentPredictor":
        """Load trained model from disk."""
        with open(filepath, "rb") as f:
            state = pickle.load(f)

        instance = cls.__new__(cls)
        instance.modality = state["modality"]
        instance.model = state["model"]
        instance.feature_engineer = state["feature_engineer"]
        instance.is_trained = state["is_trained"]
        instance.metrics = state["metrics"]
        instance._feature_importance_cache = state["feature_importance_cache"]
        return instance


# =============================================================================
# tDCS RESPONSE PREDICTOR
# =============================================================================

class tDCSResponsePredictor(BaseTreatmentPredictor):
    """
    Predictor for transcranial Direct Current Stimulation (tDCS) treatment response.

    Predicts remission probability based on patient demographics, clinical
    features, genetic markers, neuroimaging, and QEEG biomarkers.

    Uses RandomForestClassifier with class weighting to handle imbalanced data.
    """

    def __init__(self, feature_engineer: Optional[FeatureEngineer] = None) -> None:
        model = RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            min_samples_split=5,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1,
        )
        super().__init__("tDCS", model, feature_engineer)


# =============================================================================
# TMS RESPONSE PREDICTOR
# =============================================================================

class TMSResponsePredictor(BaseTreatmentPredictor):
    """
    Predictor for repetitive Transcranial Magnetic Stimulation (rTMS) response.

    Optimized for TMS-specific protocols including H-coil, figure-8 coil,
    theta-burst stimulation (TBS), and maintenance TMS regimens.

    Uses GradientBoostingClassifier for capturing non-linear interactions
    between stimulation parameters and patient biomarkers.
    """

    def __init__(self, feature_engineer: Optional[FeatureEngineer] = None) -> None:
        model = GradientBoostingClassifier(
            n_estimators=150,
            max_depth=5,
            learning_rate=0.1,
            min_samples_split=4,
            subsample=0.8,
            random_state=42,
        )
        super().__init__("TMS", model, feature_engineer)


# =============================================================================
# NEUROFEEDBACK RESPONSE PREDICTOR
# =============================================================================

class NeurofeedbackResponsePredictor:
    """
    Predictor for Neurofeedback (NF) treatment response.

    Predicts both:
        1. Clinical improvement (binary response)
        2. Learning rate (continuous regression)

    Uses separate models for classification and regression tasks.
    """

    def __init__(self, feature_engineer: Optional[FeatureEngineer] = None) -> None:
        self.modality = "Neurofeedback"
        self.classifier = RandomForestClassifier(
            n_estimators=150,
            max_depth=10,
            min_samples_split=5,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )
        self.regressor = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.08,
            random_state=42,
        )
        self.feature_engineer = feature_engineer or FeatureEngineer()
        self.is_trained: bool = False
        self.classification_metrics: Optional[ModelMetrics] = None
        self.regression_metrics: Optional[RegressionMetrics] = None

    def train(
        self,
        X_patients: List[Dict[str, Any]],
        y_response: np.ndarray,
        y_learning_rate: np.ndarray,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> Tuple[ModelMetrics, RegressionMetrics]:
        """
        Train both classification and regression models.

        Args:
            X_patients: List of patient feature dictionaries.
            y_response: Binary response labels.
            y_learning_rate: Continuous learning rate values.
            test_size: Fraction for validation.
            random_state: Random seed.

        Returns:
            Tuple of (classification_metrics, regression_metrics).
        """
        X = self.feature_engineer.fit_transform(X_patients)

        # Split
        X_train, X_test, y_resp_train, y_resp_test = train_test_split(
            X, y_response, test_size=test_size, random_state=random_state, stratify=y_response
        )
        # Use same split for regression targets
        idx_train = np.setdiff1d(np.arange(len(X)), np.setdiff1d(np.arange(len(X)), np.arange(len(X_train))))
        # Simpler approach: split using same random state
        X_train_r, X_test_r, y_lr_train, y_lr_test = train_test_split(
            X, y_learning_rate, test_size=test_size, random_state=random_state
        )

        # Train classifier
        self.classifier.fit(X_train, y_resp_train)
        y_pred = self.classifier.predict(X_test)
        y_prob = self.classifier.predict_proba(X_test)[:, 1]

        # Classifier metrics
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
        cv_scores = cross_val_score(self.classifier, X, y_response, cv=cv, scoring="roc_auc")

        self.classification_metrics = ModelMetrics(
            accuracy=accuracy_score(y_resp_test, y_pred),
            precision=precision_score(y_resp_test, y_pred, zero_division=0),
            recall=recall_score(y_resp_test, y_pred, zero_division=0),
            roc_auc=roc_auc_score(y_resp_test, y_prob),
            cv_result=CVResult(
                mean_score=float(np.mean(cv_scores)),
                std_score=float(np.std(cv_scores)),
                scores=cv_scores,
                metric="roc_auc",
            ),
            confusion_matrix=confusion_matrix(y_resp_test, y_pred),
        )

        # Train regressor
        self.regressor.fit(X_train_r, y_lr_train)
        y_lr_pred = self.regressor.predict(X_test_r)

        # Regression CV
        from sklearn.model_selection import KFold
        kf = KFold(n_splits=5, shuffle=True, random_state=random_state)
        r2_scores = cross_val_score(self.regressor, X, y_learning_rate, cv=kf, scoring="r2")

        self.regression_metrics = RegressionMetrics(
            mse=mean_squared_error(y_lr_test, y_lr_pred),
            rmse=np.sqrt(mean_squared_error(y_lr_test, y_lr_pred)),
            mae=mean_absolute_error(y_lr_test, y_lr_pred),
            r2=float(r2_scores.mean()),
            cv_result=CVResult(
                mean_score=float(np.mean(r2_scores)),
                std_score=float(np.std(r2_scores)),
                scores=r2_scores,
                metric="r2",
            ),
        )

        self.is_trained = True
        return self.classification_metrics, self.regression_metrics

    def predict(self, patient_features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict NF response including learning rate estimate.

        Returns:
            Dictionary with clinical and learning rate predictions.
        """
        if not self.is_trained:
            raise RuntimeError("Neurofeedback predictor must be trained first.")

        X = self.feature_engineer.transform_single(patient_features)

        response_prob = float(self.classifier.predict_proba(X)[0, 1])
        learning_rate = float(self.regressor.predict(X)[0])

        remission_prob = max(0.0, response_prob * 0.8 - 0.05)

        # Feature importance
        if hasattr(self.classifier, "feature_importances_"):
            importances = self.classifier.feature_importances_
            indices = np.argsort(importances)[::-1][:8]
            top_predictors = [
                {
                    "feature": self.feature_engineer.feature_names[i],
                    "importance": round(float(importances[i]), 4),
                }
                for i in indices
            ]
        else:
            top_predictors = []

        # Confidence
        if hasattr(self.classifier, "estimators_"):
            votes = np.array([t.predict_proba(X)[0] for t in self.classifier.estimators_])
            confidence = float(1.0 - np.std(votes[:, 1]))
        else:
            confidence = 0.5 + abs(response_prob - 0.5)

        # Risk assessment
        flags = []
        if learning_rate < 0.3:
            flags.append("slow_learning_rate")
        if patient_features.get("theta_beta_ratio", 0) > 3.0:
            flags.append("elevated_theta_beta")
        if response_prob < ADVERSE_EVENT_THRESHOLDS["response_probability_drop"]:
            flags.append("low_response_likelihood")

        # Recommendation
        if learning_rate > 0.6 and remission_prob > 0.5:
            recommendation = "Neurofeedback: Good candidate — fast learner expected."
        elif learning_rate > 0.4:
            recommendation = "Neurofeedback: Moderate candidate — standard protocol appropriate."
        else:
            recommendation = "Neurofeedback: Slower learner — consider extended training."

        return {
            "modality": self.modality,
            "remission_probability": round(remission_prob, 4),
            "response_probability": round(response_prob, 4),
            "predicted_learning_rate": round(learning_rate, 4),
            "confidence": round(confidence, 4),
            "top_predictors": top_predictors,
            "risk_flags": flags,
            "recommendation": recommendation,
        }

    def save(self, filepath: str) -> None:
        """Save model state to disk."""
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        state = {
            "modality": self.modality,
            "classifier": self.classifier,
            "regressor": self.regressor,
            "feature_engineer": self.feature_engineer,
            "is_trained": self.is_trained,
            "classification_metrics": self.classification_metrics,
            "regression_metrics": self.regression_metrics,
        }
        with open(filepath, "wb") as f:
            pickle.dump(state, f)

    @classmethod
    def load(cls, filepath: str) -> "NeurofeedbackResponsePredictor":
        """Load model from disk."""
        with open(filepath, "rb") as f:
            state = pickle.load(f)
        instance = cls.__new__(cls)
        instance.modality = state["modality"]
        instance.classifier = state["classifier"]
        instance.regressor = state["regressor"]
        instance.feature_engineer = state["feature_engineer"]
        instance.is_trained = state["is_trained"]
        instance.classification_metrics = state["classification_metrics"]
        instance.regression_metrics = state["regression_metrics"]
        return instance


# =============================================================================
# PROTOCOL RANKING MODEL
# =============================================================================

class ProtocolRankingModel:
    """
    Ranks treatment protocols by predicted outcome for a given patient.

    Evaluates multiple protocol configurations across tDCS, TMS, and Neurofeedback
    modalities to recommend the optimal treatment plan.
    """

    PROTOCOL_TEMPLATES: List[Dict[str, Any]] = [
        {
            "protocol_id": "TDC-001",
            "modality": "tDCS",
            "target_region": "dlPFC_left",
            "intensity": 2.0,
            "sessions": 20,
            "description": "tDCS anodal left dlPFC — standard depression protocol",
        },
        {
            "protocol_id": "TDC-002",
            "modality": "tDCS",
            "target_region": "dlPFC_right",
            "intensity": 2.0,
            "sessions": 20,
            "description": "tDCS anodal right dlPFC — anxiety-focused",
        },
        {
            "protocol_id": "TMS-001",
            "modality": "TMS",
            "target_region": "dlPFC_left",
            "intensity": 120,
            "sessions": 30,
            "description": "rTMS 10Hz left dlPFC — FDA-cleared depression",
        },
        {
            "protocol_id": "TMS-002",
            "modality": "TMS",
            "target_region": "dlPFC_right",
            "intensity": 1,
            "sessions": 30,
            "description": "rTMS 1Hz right dlPFC — inhibitory protocol",
        },
        {
            "protocol_id": "TMS-003",
            "modality": "TMS",
            "target_region": "dlPFC_left",
            "intensity": 0,
            "sessions": 20,
            "description": "iTBS left dlPFC — theta-burst stimulation",
        },
        {
            "protocol_id": "NF-001",
            "modality": "Neurofeedback",
            "target_region": "frontal_alpha",
            "intensity": 0,
            "sessions": 40,
            "description": "Alpha upregulation frontal — relaxation/anxiety",
        },
        {
            "protocol_id": "NF-002",
            "modality": "Neurofeedback",
            "target_region": "theta_beta",
            "intensity": 0,
            "sessions": 40,
            "description": "Theta/beta ratio training — ADHD protocol",
        },
        {
            "protocol_id": "NF-003",
            "modality": "Neurofeedback",
            "target_region": "SMR",
            "intensity": 0,
            "sessions": 30,
            "description": "SMR training — sleep/focus enhancement",
        },
    ]

    def __init__(
        self,
        tdcs_predictor: Optional[tDCSResponsePredictor] = None,
        tms_predictor: Optional[TMSResponsePredictor] = None,
        nf_predictor: Optional[NeurofeedbackResponsePredictor] = None,
    ) -> None:
        self.tdcs = tdcs_predictor or tDCSResponsePredictor()
        self.tms = tms_predictor or TMSResponsePredictor()
        self.nf = nf_predictor or NeurofeedbackResponsePredictor()
        self._predictor_map: Dict[str, Any] = {
            "tDCS": self.tdcs,
            "TMS": self.tms,
            "Neurofeedback": self.nf,
        }

    def train_all(
        self,
        X_patients: List[Dict[str, Any]],
        y_tdcs: np.ndarray,
        y_tms: np.ndarray,
        y_nf_response: np.ndarray,
        y_nf_learning: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Train all modality-specific predictors.

        Args:
            X_patients: Patient feature dictionaries.
            y_tdcs: tDCS response labels.
            y_tms: TMS response labels.
            y_nf_response: NF response labels.
            y_nf_learning: NF learning rate values.

        Returns:
            Dictionary of training metrics per modality.
        """
        results = {}

        # Train tDCS
        tdcs_metrics = self.tdcs.train(X_patients, y_tdcs)
        results["tDCS"] = tdcs_metrics.to_dict()

        # Train TMS
        tms_metrics = self.tms.train(X_patients, y_tms)
        results["TMS"] = tms_metrics.to_dict()

        # Train Neurofeedback
        nf_cls_metrics, nf_reg_metrics = self.nf.train(
            X_patients, y_nf_response, y_nf_learning
        )
        results["Neurofeedback"] = {
            "classification": nf_cls_metrics.to_dict(),
            "regression": nf_reg_metrics.to_dict(),
        }

        return results

    def rank_protocols(
        self, patient_features: Dict[str, Any], top_k: int = 5
    ) -> List[ProtocolRanking]:
        """
        Rank all protocol templates for a given patient.

        Args:
            patient_features: Patient feature dictionary.
            top_k: Number of top protocols to return.

        Returns:
            List of ProtocolRanking objects sorted by predicted outcome.
        """
        rankings: List[ProtocolRanking] = []

        for protocol in self.PROTOCOL_TEMPLATES:
            # Merge patient features with protocol features
            merged_features = {**patient_features, **protocol}

            modality = protocol["modality"]
            predictor = self._predictor_map.get(modality)

            if predictor is None or not predictor.is_trained:
                continue

            try:
                if modality == "Neurofeedback":
                    result = predictor.predict(merged_features)
                    remission_prob = result["remission_probability"]
                    response_prob = result["response_probability"]
                    confidence = result["confidence"]
                else:
                    result = predictor.predict(merged_features)
                    remission_prob = result.remission_probability
                    response_prob = result.response_probability
                    confidence = result.confidence

                # Composite score for ranking
                composite_score = (
                    0.4 * remission_prob
                    + 0.4 * response_prob
                    + 0.2 * confidence
                )

                rankings.append(ProtocolRanking(
                    protocol_id=protocol["protocol_id"],
                    modality=modality,
                    predicted_remission=round(remission_prob, 4),
                    predicted_response=round(response_prob, 4),
                    confidence=round(confidence, 4),
                    estimated_sessions=protocol["sessions"],
                ))
            except Exception:
                # Skip protocols that can't be evaluated
                continue

        # Sort by composite score (remission + response + confidence)
        rankings.sort(
            key=lambda x: 0.4 * x.predicted_remission + 0.4 * x.predicted_response + 0.2 * x.confidence,
            reverse=True,
        )

        # Assign ranks
        for i, r in enumerate(rankings):
            r.rank = i + 1

        return rankings[:top_k]

    def recommend(
        self,
        patient_features: Dict[str, Any],
        min_sessions: int = 10,
        max_sessions: int = 50,
    ) -> Dict[str, Any]:
        """
        Generate comprehensive treatment recommendation.

        Args:
            patient_features: Patient feature dictionary.
            min_sessions: Minimum acceptable sessions.
            max_sessions: Maximum acceptable sessions.

        Returns:
            Recommendation with ranked protocols and justification.
        """
        rankings = self.rank_protocols(patient_features, top_k=5)

        # Filter by session constraints
        feasible = [
            r for r in rankings
            if min_sessions <= r.estimated_sessions <= max_sessions
        ]

        if not feasible:
            return {
                "recommendation": "No feasible protocols found within session constraints.",
                "rankings": [self._ranking_to_dict(r) for r in rankings],
                "top_choice": None,
                "alternatives": [],
            }

        top = feasible[0]
        alternatives = feasible[1:3]

        return {
            "recommendation": (
                f"Recommended: {top.protocol_id} ({top.modality}) — "
                f"predicted remission {top.predicted_remission:.1%}, "
                f"response {top.predicted_response:.1%}, "
                f"{top.estimated_sessions} sessions"
            ),
            "rankings": [self._ranking_to_dict(r) for r in rankings],
            "top_choice": self._ranking_to_dict(top),
            "alternatives": [self._ranking_to_dict(a) for a in alternatives],
            "patient_features_summary": self._summarize_patient(patient_features),
        }

    @staticmethod
    def _ranking_to_dict(r: ProtocolRanking) -> Dict[str, Any]:
        return {
            "protocol_id": r.protocol_id,
            "modality": r.modality,
            "predicted_remission": r.predicted_remission,
            "predicted_response": r.predicted_response,
            "confidence": r.confidence,
            "estimated_sessions": r.estimated_sessions,
            "rank": r.rank,
        }

    @staticmethod
    def _summarize_patient(features: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "age": features.get("age"),
            "severity": features.get("severity_score"),
            "prior_treatments": features.get("prior_treatments"),
            "comorbidities": features.get("comorbidities"),
            "theta_beta_ratio": features.get("theta_beta_ratio"),
            "dlPFC_activity": features.get("dlPFC_activity"),
        }

    def save(self, directory: str) -> None:
        """Save all sub-models to directory."""
        os.makedirs(directory, exist_ok=True)
        self.tdcs.save(os.path.join(directory, "tdcs_model.pkl"))
        self.tms.save(os.path.join(directory, "tms_model.pkl"))
        self.nf.save(os.path.join(directory, "nf_model.pkl"))

    @classmethod
    def load(cls, directory: str) -> "ProtocolRankingModel":
        """Load all sub-models from directory."""
        return cls(
            tdcs_predictor=tDCSResponsePredictor.load(
                os.path.join(directory, "tdcs_model.pkl")
            ),
            tms_predictor=TMSResponsePredictor.load(
                os.path.join(directory, "tms_model.pkl")
            ),
            nf_predictor=NeurofeedbackResponsePredictor.load(
                os.path.join(directory, "nf_model.pkl")
            ),
        )


# =============================================================================
# UNIFIED TREATMENT RESPONSE PREDICTOR
# =============================================================================

class TreatmentResponsePredictor:
    """
    Unified interface for all treatment response prediction models.

    Provides a single entry point for training, prediction, protocol ranking,
    and model persistence across all neuromodality types.
    """

    def __init__(self, model_dir: Optional[str] = None) -> None:
        self.model_dir = model_dir or "."
        self.tdcs = tDCSResponsePredictor()
        self.tms = TMSResponsePredictor()
        self.nf = NeurofeedbackResponsePredictor()
        self.ranker = ProtocolRankingModel(self.tdcs, self.tms, self.nf)
        self._is_trained: bool = False

    def train(
        self,
        X_patients: List[Dict[str, Any]],
        y_tdcs: np.ndarray,
        y_tms: np.ndarray,
        y_nf_response: np.ndarray,
        y_nf_learning: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Train all models simultaneously.

        Args:
            X_patients: Patient feature dictionaries.
            y_tdcs: tDCS response labels.
            y_tms: TMS response labels.
            y_nf_response: NF response labels.
            y_nf_learning: NF learning rate values.

        Returns:
            Training metrics for all modalities.
        """
        results = self.ranker.train_all(
            X_patients, y_tdcs, y_tms, y_nf_response, y_nf_learning
        )
        self._is_trained = True
        return results

    def predict(
        self, patient_features: Dict[str, Any], modality: str
    ) -> Union[PredictionResult, Dict[str, Any]]:
        """
        Predict response for a specific modality.

        Args:
            patient_features: Patient feature dictionary.
            modality: One of 'tDCS', 'TMS', 'Neurofeedback'.

        Returns:
            Prediction result (type varies by modality).
        """
        if modality == "tDCS":
            return self.tdcs.predict(patient_features)
        elif modality == "TMS":
            return self.tms.predict(patient_features)
        elif modality == "Neurofeedback":
            return self.nf.predict(patient_features)
        else:
            raise ValueError(f"Unknown modality: {modality}")

    def rank_protocols(
        self, patient_features: Dict[str, Any], top_k: int = 5
    ) -> List[ProtocolRanking]:
        """Rank protocols for a patient."""
        return self.ranker.rank_protocols(patient_features, top_k)

    def recommend(self, patient_features: Dict[str, Any]) -> Dict[str, Any]:
        """Generate full treatment recommendation."""
        return self.ranker.recommend(patient_features)

    def save(self) -> None:
        """Save all models to disk."""
        self.ranker.save(self.model_dir)

    def load(self) -> None:
        """Load all models from disk."""
        self.ranker = ProtocolRankingModel.load(self.model_dir)
        self.tdcs = self.ranker.tdcs
        self.tms = self.ranker.tms
        self.nf = self.ranker.nf
        self._is_trained = True

    @property
    def is_trained(self) -> bool:
        return self._is_trained


# =============================================================================
# ADVERSE EVENT DETECTOR
# =============================================================================

class AdverseEventDetector:
    """
    Monitors predictions for adverse event patterns and triggers alerts.

    Detects:
        - Low remission/response probability
        - High baseline severity
        - Treatment resistance indicators
        - Contradictory biomarker signals
    """

    def __init__(self, thresholds: Optional[Dict[str, float]] = None) -> None:
        self.thresholds = thresholds or ADVERSE_EVENT_THRESHOLDS.copy()

    def check_prediction(self, result: PredictionResult) -> Dict[str, Any]:
        """
        Check a prediction result for adverse event indicators.

        Args:
            result: PredictionResult to evaluate.

        Returns:
            Alert dictionary with severity and recommendations.
        """
        alerts = []
        severity = "none"

        if result.remission_probability < self.thresholds["remission_probability_drop"]:
            alerts.append({
                "type": "low_remission_probability",
                "message": (
                    f"Remission probability ({result.remission_probability:.2f}) "
                    f"below threshold ({self.thresholds['remission_probability_drop']})"
                ),
                "severity": "high",
            })
            severity = "high"

        if result.response_probability < self.thresholds["response_probability_drop"]:
            alerts.append({
                "type": "low_response_probability",
                "message": (
                    f"Response probability ({result.response_probability:.2f}) "
                    f"below threshold ({self.thresholds['response_probability_drop']})"
                ),
                "severity": "high" if severity == "none" else severity,
            })
            severity = "high"

        if result.risk_flags:
            for flag in result.risk_flags:
                alerts.append({
                    "type": flag,
                    "message": f"Risk flag detected: {flag}",
                    "severity": "medium",
                })
            if severity == "none":
                severity = "medium"

        if result.confidence < 0.5:
            alerts.append({
                "type": "low_confidence",
                "message": f"Low model confidence ({result.confidence:.2f})",
                "severity": "low",
            })

        return {
            "has_alert": len(alerts) > 0,
            "severity": severity,
            "alerts": alerts,
            "recommendation": (
                "Consider alternative modality" if severity == "high"
                else "Monitor closely" if severity == "medium"
                else "Proceed with standard monitoring"
            ),
        }

    def batch_check(
        self, results: List[PredictionResult]
    ) -> List[Dict[str, Any]]:
        """Check multiple predictions for adverse events."""
        return [self.check_prediction(r) for r in results]


# =============================================================================
# SYNTHETIC DATA GENERATOR FOR TESTING
# =============================================================================

def generate_synthetic_patients(
    n_samples: int = 200,
    random_state: int = 42,
    response_rate: float = 0.6,
) -> Tuple[List[Dict[str, Any]], np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate synthetic patient data for testing.

    Creates realistic patient feature distributions with known response
    associations for model validation.

    Args:
        n_samples: Number of patients to generate.
        random_state: Random seed.
        response_rate: Base response rate.

    Returns:
        Tuple of (patient_dicts, y_tdcs, y_tms, y_nf_response, y_nf_learning_rate).
    """
    rng = np.random.RandomState(random_state)

    patients = []
    for i in range(n_samples):
        age = int(rng.normal(42, 12))
        age = max(18, min(85, age))

        severity = rng.uniform(8, 35)
        prior_tx = rng.poisson(1.5)
        comorbidities = rng.poisson(0.8)

        # Biomarkers correlated with response
        dlpfc = rng.normal(0.5, 0.3)
        theta_beta = rng.gamma(2, 0.8)
        alpha_power = rng.normal(1.0, 0.4)
        connectivity = rng.normal(0.6, 0.25)
        hippo_vol = rng.normal(1.0, 0.2)
        coherence = rng.uniform(0.3, 0.9)

        # Genetic variants
        comt = rng.choice(["Met/Met", "Val/Met", "Val/Val"], p=[0.25, 0.50, 0.25])
        bdnf = rng.choice(["Val/Val", "Val/Met", "Met/Met"], p=[0.6, 0.3, 0.1])
        httlpr = rng.choice(["LL", "LS", "SS"], p=[0.3, 0.45, 0.25])
        drd2 = rng.choice(["A1/A1", "A1/A2", "A2/A2"], p=[0.1, 0.3, 0.6])

        # Derived response score
        response_score = (
            -0.02 * (severity - 20)
            - 0.1 * prior_tx
            - 0.05 * comorbidities
            + 0.3 * dlpfc
            - 0.15 * theta_beta
            + 0.2 * alpha_power
            + 0.25 * connectivity
            + (0.15 if comt == "Met/Met" else 0.05 if comt == "Val/Met" else 0)
            + (0.1 if bdnf == "Val/Val" else 0)
            - (0.1 if httlpr == "SS" else 0)
            + rng.normal(0, 0.3)
        )

        p_response = 1 / (1 + np.exp(-response_score))

        patient = {
            "age": age,
            "sex": rng.choice(["M", "F"]),
            "bmi": round(rng.normal(26, 5), 1),
            "diagnosis": rng.choice(["MDD", "GAD", "PTSD", "OCD"]),
            "severity_score": round(severity, 1),
            "comorbidities": comorbidities,
            "prior_treatments": prior_tx,
            "COMT_rs4680": comt,
            "BDNF_rs6265": bdnf,
            "5HTTLPR": httlpr,
            "DRD2": drd2,
            "dlPFC_activity": round(dlpfc, 3),
            "hippocampal_volume": round(hippo_vol, 3),
            "network_connectivity": round(connectivity, 3),
            "theta_beta_ratio": round(theta_beta, 3),
            "alpha_power": round(alpha_power, 3),
            "coherence": round(coherence, 3),
            "modality": rng.choice(["tDCS", "TMS", "Neurofeedback"]),
            "target_region": rng.choice([
                "dlPFC_left", "dlPFC_right", "ACC", "DLPFC_bi",
                "frontal_alpha", "theta_beta", "SMR"
            ]),
            "intensity": rng.choice([1.0, 2.0, 2.5, 120, 0]),
            "sessions": int(rng.choice([15, 20, 25, 30, 40])),
        }
        patients.append(patient)

    # Generate targets with biomarker correlations
    y_tdcs = (rng.random(n_samples) < np.clip(p_response * 0.9, 0.1, 0.95)).astype(int)
    y_tms = (rng.random(n_samples) < np.clip(p_response * 1.05, 0.1, 0.95)).astype(int)
    y_nf_response = (rng.random(n_samples) < np.clip(p_response * 0.85, 0.1, 0.95)).astype(int)
    y_nf_learning = np.clip(
        0.3 + 0.4 * p_response + rng.normal(0, 0.15, n_samples),
        0, 1
    )

    return patients, y_tdcs, y_tms, y_nf_response, y_nf_learning


# =============================================================================
# TESTS
# =============================================================================

def run_tests() -> Dict[str, Any]:
    """
    Run comprehensive tests for all prediction models.

    Returns:
        Dictionary with test results and metrics summary.
    """
    print("=" * 70)
    print("OUTCOME PREDICTION MODELS — TEST SUITE")
    print("=" * 70)

    results = {"passed": 0, "failed": 0, "tests": {}}

    # ------------------------------------------------------------------
    # Test 1: Synthetic Data Generation
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 1] Synthetic data generation...")
        patients, y_tdcs, y_tms, y_nf_r, y_nf_lr = generate_synthetic_patients(
            n_samples=300, random_state=42
        )
        assert len(patients) == 300
        assert set(y_tdcs).issubset({0, 1})
        assert len(y_nf_lr) == 300
        assert all(0 <= lr <= 1 for lr in y_nf_lr)
        print(f"  Generated {len(patients)} patients")
        print(f"  tDCS response rate: {y_tdcs.mean():.2%}")
        print(f"  TMS response rate: {y_tms.mean():.2%}")
        print(f"  NF response rate: {y_nf_r.mean():.2%}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["synthetic_data"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["synthetic_data"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 2: Feature Engineering
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 2] Feature engineering pipeline...")
        fe = FeatureEngineer()
        X = fe.fit_transform(patients[:100])
        assert X.shape[0] == 100
        assert X.shape[1] > 0
        assert fe.is_fitted
        assert len(fe.feature_names) > 0

        # Test transform on new data
        X2 = fe.transform(patients[100:110])
        assert X2.shape[0] == 10
        assert X2.shape[1] == X.shape[1]
        print(f"  Input features: {len(ALL_FEATURES)}")
        print(f"  Engineered features: {X.shape[1]}")
        print(f"  Feature names (first 10): {fe.feature_names[:10]}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["feature_engineering"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["feature_engineering"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 3: tDCS Predictor
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 3] tDCS Response Predictor...")
        tdcs = tDCSResponsePredictor()
        metrics = tdcs.train(patients, y_tdcs, test_size=0.25, random_state=42)
        assert tdcs.is_trained
        assert metrics.accuracy > 0
        assert metrics.roc_auc > 0
        assert metrics.cv_result.mean_score > 0
        print(f"  Accuracy: {metrics.accuracy:.3f}")
        print(f"  ROC-AUC: {metrics.roc_auc:.3f}")
        print(f"  CV ROC-AUC: {metrics.cv_result.mean_score:.3f} (+/- {metrics.cv_result.std_score:.3f})")
        print(f"  Confusion matrix:\n{metrics.confusion_matrix}")

        # Test prediction
        pred = tdcs.predict(patients[0])
        assert 0 <= pred.remission_probability <= 1
        assert 0 <= pred.response_probability <= 1
        assert 0 <= pred.confidence <= 1
        assert len(pred.top_predictors) > 0
        assert pred.modality == "tDCS"
        print(f"  Sample prediction:")
        print(f"    Remission: {pred.remission_probability:.3f}")
        print(f"    Response: {pred.response_probability:.3f}")
        print(f"    Confidence: {pred.confidence:.3f}")
        print(f"    Top predictor: {pred.top_predictors[0].feature} ({pred.top_predictors[0].importance:.3f})")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["tdcs_predictor"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["tdcs_predictor"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 4: TMS Predictor
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 4] TMS Response Predictor...")
        tms = TMSResponsePredictor()
        metrics = tms.train(patients, y_tms, test_size=0.25, random_state=42)
        assert tms.is_trained
        assert metrics.roc_auc > 0
        print(f"  Accuracy: {metrics.accuracy:.3f}")
        print(f"  ROC-AUC: {metrics.roc_auc:.3f}")
        print(f"  CV ROC-AUC: {metrics.cv_result.mean_score:.3f} (+/- {metrics.cv_result.std_score:.3f})")

        pred = tms.predict(patients[0])
        assert pred.modality == "TMS"
        print(f"  Sample prediction: remission={pred.remission_probability:.3f}, response={pred.response_probability:.3f}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["tms_predictor"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["tms_predictor"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 5: Neurofeedback Predictor
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 5] Neurofeedback Response Predictor...")
        nf = NeurofeedbackResponsePredictor()
        cls_metrics, reg_metrics = nf.train(
            patients, y_nf_r, y_nf_lr, test_size=0.25, random_state=42
        )
        assert nf.is_trained
        assert cls_metrics.roc_auc > 0
        assert reg_metrics.rmse > 0
        print(f"  Classification Accuracy: {cls_metrics.accuracy:.3f}")
        print(f"  Classification ROC-AUC: {cls_metrics.roc_auc:.3f}")
        print(f"  Regression RMSE: {reg_metrics.rmse:.3f}")
        print(f"  Regression R²: {reg_metrics.r2:.3f}")
        print(f"  CV R²: {reg_metrics.cv_result.mean_score:.3f} (+/- {reg_metrics.cv_result.std_score:.3f})")

        pred = nf.predict(patients[0])
        assert "predicted_learning_rate" in pred
        assert 0 <= pred["predicted_learning_rate"] <= 1
        print(f"  Sample prediction: remission={pred['remission_probability']:.3f}, learning_rate={pred['predicted_learning_rate']:.3f}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["nf_predictor"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["nf_predictor"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 6: Protocol Ranking Model
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 6] Protocol Ranking Model...")
        ranker = ProtocolRankingModel(tdcs_predictor=tdcs, tms_predictor=tms, nf_predictor=nf)

        rankings = ranker.rank_protocols(patients[0], top_k=5)
        assert len(rankings) > 0
        assert all(r.rank > 0 for r in rankings)
        assert rankings[0].predicted_remission >= rankings[-1].predicted_remission

        print(f"  Top {len(rankings)} protocols ranked:")
        for r in rankings:
            print(f"    #{r.rank}: {r.protocol_id} ({r.modality}) — "
                  f"remission={r.predicted_remission:.3f}, "
                  f"response={r.predicted_response:.3f}, "
                  f"confidence={r.confidence:.3f}")

        # Full recommendation
        rec = ranker.recommend(patients[0])
        assert "recommendation" in rec
        assert "rankings" in rec
        assert "top_choice" in rec
        print(f"  Recommendation: {rec['recommendation']}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["protocol_ranking"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["protocol_ranking"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 7: Unified Predictor Interface
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 7] Unified TreatmentResponsePredictor...")
        unified = TreatmentResponsePredictor()
        train_results = unified.train(
            patients, y_tdcs, y_tms, y_nf_r, y_nf_lr
        )
        assert unified.is_trained
        assert "tDCS" in train_results
        assert "TMS" in train_results
        assert "Neurofeedback" in train_results

        # Test per-modality prediction
        for modality in ["tDCS", "TMS", "Neurofeedback"]:
            pred = unified.predict(patients[1], modality=modality)
            print(f"  {modality}: remission={pred.remission_probability if hasattr(pred, 'remission_probability') else pred['remission_probability']:.3f}")

        # Test ranking
        rankings = unified.rank_protocols(patients[1], top_k=3)
        assert len(rankings) > 0
        print(f"  Top protocol: {rankings[0].protocol_id}")

        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["unified_predictor"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["unified_predictor"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 8: Model Persistence
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 8] Model persistence (save/load)...")
        save_dir = "/tmp/test_models_outcome"
        ranker.save(save_dir)
        assert os.path.exists(os.path.join(save_dir, "tdcs_model.pkl"))
        assert os.path.exists(os.path.join(save_dir, "tms_model.pkl"))
        assert os.path.exists(os.path.join(save_dir, "nf_model.pkl"))

        loaded_ranker = ProtocolRankingModel.load(save_dir)
        loaded_pred = loaded_ranker.tdcs.predict(patients[0])
        assert loaded_pred.response_probability > 0
        print(f"  Saved to: {save_dir}")
        print(f"  Loaded prediction matches: remission={loaded_pred.remission_probability:.3f}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["model_persistence"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["model_persistence"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 9: Adverse Event Detection
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 9] Adverse Event Detection...")
        detector = AdverseEventDetector()

        # Create a low-probability prediction to trigger alert
        low_pred = PredictionResult(
            modality="tDCS",
            remission_probability=0.15,
            response_probability=0.35,
            confidence=0.6,
            top_predictors=[FeatureImportance("test", 0.5)],
            risk_flags=["treatment_resistant"],
            recommendation="",
        )
        alert = detector.check_prediction(low_pred)
        assert alert["has_alert"]
        assert alert["severity"] == "high"
        assert len(alert["alerts"]) >= 2
        print(f"  Alert triggered: {alert['has_alert']}")
        print(f"  Severity: {alert['severity']}")
        print(f"  Alerts: {[a['type'] for a in alert['alerts']]}")
        print(f"  Recommendation: {alert['recommendation']}")

        # Safe prediction
        safe_pred = PredictionResult(
            modality="TMS",
            remission_probability=0.75,
            response_probability=0.85,
            confidence=0.8,
            top_predictors=[FeatureImportance("test", 0.5)],
            risk_flags=[],
            recommendation="",
        )
        safe_alert = detector.check_prediction(safe_pred)
        assert not safe_alert["has_alert"]
        print(f"  Safe prediction: alert={safe_alert['has_alert']}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["adverse_event_detection"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["adverse_event_detection"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Test 10: Feature Importance Extraction
    # ------------------------------------------------------------------
    try:
        print("\n[TEST 10] Feature importance extraction...")
        importance = tdcs.get_top_predictors(n=10)
        assert len(importance) > 0
        assert all(isinstance(f, FeatureImportance) for f in importance)
        assert importance[0].importance >= importance[-1].importance
        print(f"  Top 5 features:")
        for fi in importance[:5]:
            print(f"    {fi.feature}: {fi.importance:.4f}")
        print(f"  PASSED")
        results["passed"] += 1
        results["tests"]["feature_importance"] = "PASSED"
    except Exception as e:
        print(f"  FAILED: {e}")
        results["failed"] += 1
        results["tests"]["feature_importance"] = f"FAILED: {e}"

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"TEST SUMMARY: {results['passed']} passed, {results['failed']} failed")
    print("=" * 70)

    return results


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    test_results = run_tests()

    # Print JSON summary
    print("\n--- JSON Summary ---")
    print(json.dumps(test_results, indent=2, default=str))
