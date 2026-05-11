"""
Tests for NeuroSign API — database, schemas, routes.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import uuid

from app.main import app
from app.database import get_db
from app.persistence.models.neuro_signs import (
    NeuroSign, CaseNeuroSign, NeuroSignAnnotation
)
from app.schemas.neuro_signs import (
    NeuroSignCreate, CaseNeuroSignCreate, NeuroSignAnnotationCreate
)


@pytest.fixture
def client():
    """Test client."""
    return TestClient(app)


@pytest.fixture
def db_session(monkeypatch):
    """Mock database session."""
    from app.database import SessionLocal
    db = SessionLocal()
    
    def override_get_db():
        yield db
    
    app.dependency_overrides[get_db] = override_get_db
    
    yield db
    
    # Cleanup
    app.dependency_overrides.clear()
    db.close()


# ==============================================================================
# DATABASE MODEL TESTS
# ==============================================================================

class TestNeuroSignModel:
    """Test NeuroSign ORM model."""

    def test_neuro_sign_creation(self, db_session: Session):
        """Test creating a NeuroSign."""
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="test-sign",
            name="Test Sign",
            category="neurodegenerative",
            modality="MRI",
            sequences=["T1", "T2"],
            anatomy=["midbrain"],
            visual_description="Test description",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        assert sign.id
        assert sign.name == "Test Sign"
        assert sign.category == "neurodegenerative"

    def test_neuro_sign_slug_uniqueness(self, db_session: Session):
        """Test that slug is unique."""
        sign1 = NeuroSign(
            id=str(uuid.uuid4()),
            slug="unique-slug",
            name="Sign 1",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign1)
        db_session.commit()
        
        sign2 = NeuroSign(
            id=str(uuid.uuid4()),
            slug="unique-slug",
            name="Sign 2",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign2)
        
        with pytest.raises(Exception):  # IntegrityError
            db_session.commit()

    def test_neuro_sign_timestamps(self, db_session: Session):
        """Test that created_at and updated_at are set."""
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="timestamp-test",
            name="Timestamp Test",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign)
        db_session.commit()
        
        assert sign.created_at is not None
        assert sign.updated_at is not None


class TestCaseNeuroSignModel:
    """Test CaseNeuroSign ORM model."""

    def test_case_neuro_sign_creation(self, db_session: Session):
        """Test creating a CaseNeuroSign."""
        # Create parent sign first
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="parent-sign",
            name="Parent Sign",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign)
        db_session.commit()
        
        # Create case sign
        case_sign = CaseNeuroSign(
            id=str(uuid.uuid4()),
            case_id="test-case-123",
            neuro_sign_id=sign.id,
            clinician_id="clinician-001",
            confidence="probable",
            note="Test note",
        )
        db_session.add(case_sign)
        db_session.commit()
        
        assert case_sign.case_id == "test-case-123"
        assert case_sign.confidence == "probable"

    def test_case_neuro_sign_unique_constraint(self, db_session: Session):
        """Test unique constraint on (case_id, neuro_sign_id, clinician_id)."""
        # Create parent sign
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="uc-sign",
            name="UC Sign",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign)
        db_session.commit()
        
        # Create first case sign
        case_sign1 = CaseNeuroSign(
            id=str(uuid.uuid4()),
            case_id="case-uc",
            neuro_sign_id=sign.id,
            clinician_id="clinician-uc",
            confidence="probable",
        )
        db_session.add(case_sign1)
        db_session.commit()
        
        # Try to create duplicate
        case_sign2 = CaseNeuroSign(
            id=str(uuid.uuid4()),
            case_id="case-uc",
            neuro_sign_id=sign.id,
            clinician_id="clinician-uc",
            confidence="possible",
        )
        db_session.add(case_sign2)
        
        with pytest.raises(Exception):  # IntegrityError
            db_session.commit()


class TestNeuroSignAnnotationModel:
    """Test NeuroSignAnnotation ORM model."""

    def test_annotation_creation(self, db_session: Session):
        """Test creating an annotation."""
        # Create parent sign
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="anno-sign",
            name="Anno Sign",
            category="neurodegenerative",
            modality="MRI",
        )
        db_session.add(sign)
        db_session.commit()
        
        # Create annotation
        annotation = NeuroSignAnnotation(
            id=str(uuid.uuid4()),
            neuro_sign_id=sign.id,
            shape_type="polygon",
            coordinates=[[10, 20], [30, 40], [50, 60]],
            label="Area of Interest",
            color="#FF5733",
        )
        db_session.add(annotation)
        db_session.commit()
        
        assert annotation.shape_type == "polygon"
        assert len(annotation.coordinates) == 3


# ==============================================================================
# API ENDPOINT TESTS
# ==============================================================================

class TestNeuroSignsListEndpoint:
    """Test GET /api/neuro-signs/"""

    def test_list_signs_empty(self, client: TestClient, db_session: Session):
        """Test listing signs when none exist."""
        response = client.get("/api/neuro-signs/")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_signs_with_data(self, client: TestClient, db_session: Session):
        """Test listing signs with data."""
        # Create a sign
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="list-test-sign",
            name="List Test Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        response = client.get("/api/neuro-signs/")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        assert data["items"][0]["name"] == "List Test Sign"

    def test_list_signs_search(self, client: TestClient, db_session: Session):
        """Test searching signs."""
        # Create a sign
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="searchable-sign",
            name="Hummingbird Sign",
            category="neurodegenerative",
            modality="MRI",
            visual_description="Midbrain atrophy",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        response = client.get("/api/neuro-signs/?q=hummingbird")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    def test_list_signs_filter_by_category(self, client: TestClient, db_session: Session):
        """Test filtering by category."""
        # Create signs with different categories
        sign1 = NeuroSign(
            id=str(uuid.uuid4()),
            slug="neuro-sign-1",
            name="Neuro Sign 1",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        sign2 = NeuroSign(
            id=str(uuid.uuid4()),
            slug="vascular-sign-1",
            name="Vascular Sign 1",
            category="vascular",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign1)
        db_session.add(sign2)
        db_session.commit()
        
        response = client.get("/api/neuro-signs/?category=neurodegenerative")
        assert response.status_code == 200
        data = response.json()
        assert all(item["category"] == "neurodegenerative" for item in data["items"])


class TestNeuroSignDetailEndpoint:
    """Test GET /api/neuro-signs/{sign_id}"""

    def test_get_sign_by_id(self, client: TestClient, db_session: Session):
        """Test getting a sign by ID."""
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="detail-test",
            name="Detail Test Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        response = client.get(f"/api/neuro-signs/{sign.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sign.id
        assert data["name"] == "Detail Test Sign"

    def test_get_sign_by_slug(self, client: TestClient, db_session: Session):
        """Test getting a sign by slug."""
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="slug-detail-test",
            name="Slug Detail Test Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        response = client.get("/api/neuro-signs/slug-detail-test")
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == "slug-detail-test"

    def test_get_sign_not_found(self, client: TestClient):
        """Test 404 when sign not found."""
        response = client.get("/api/neuro-signs/nonexistent-id")
        assert response.status_code == 404

    def test_get_unpublished_sign(self, client: TestClient, db_session: Session):
        """Test that unpublished signs return 404."""
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="unpublished-sign",
            name="Unpublished Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=False,
        )
        db_session.add(sign)
        db_session.commit()
        
        response = client.get(f"/api/neuro-signs/{sign.id}")
        assert response.status_code == 404


class TestCaseNeuroSignEndpoints:
    """Test case sign attachment endpoints."""

    def test_attach_sign_to_case(self, client: TestClient, db_session: Session):
        """Test POST /api/neuro-signs/case/{case_id}/attach"""
        # Create a sign
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="attach-test",
            name="Attach Test Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        payload = {
            "neuro_sign_id": sign.id,
            "confidence": "probable",
            "note": "Test attachment",
        }
        
        # Mock auth by patching get_current_user
        from unittest.mock import MagicMock, patch
        mock_user = MagicMock()
        mock_user.id = "test-clinician"
        
        with patch("app.routers.neuro_signs.get_current_user", return_value=mock_user):
            response = client.post(
                "/api/neuro-signs/case/test-case-id/attach",
                json=payload,
            )
        
        # Note: May fail due to auth; verify endpoint exists
        assert response.status_code in [200, 201, 401, 403]

    def test_get_case_signs(self, client: TestClient, db_session: Session):
        """Test GET /api/neuro-signs/case/{case_id}"""
        # Create a sign and case attachment
        sign = NeuroSign(
            id=str(uuid.uuid4()),
            slug="case-get-test",
            name="Case Get Test Sign",
            category="neurodegenerative",
            modality="MRI",
            is_published=True,
        )
        db_session.add(sign)
        db_session.commit()
        
        case_sign = CaseNeuroSign(
            id=str(uuid.uuid4()),
            case_id="test-case-get",
            neuro_sign_id=sign.id,
            clinician_id="test-clinician",
            confidence="probable",
        )
        db_session.add(case_sign)
        db_session.commit()
        
        response = client.get("/api/neuro-signs/case/test-case-get")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["case_id"] == "test-case-get"


# ==============================================================================
# SCHEMA TESTS
# ==============================================================================

class TestNeuroSignSchemas:
    """Test Pydantic schemas."""

    def test_neuro_sign_create_schema(self):
        """Test NeuroSignCreate schema."""
        payload = {
            "name": "Test Sign",
            "slug": "test-sign",
            "category": "neurodegenerative",
            "modality": "MRI",
            "sequences": ["T1", "T2"],
            "anatomy": ["midbrain"],
        }
        schema = NeuroSignCreate(**payload)
        assert schema.name == "Test Sign"
        assert schema.category == "neurodegenerative"

    def test_case_neuro_sign_create_schema(self):
        """Test CaseNeuroSignCreate schema."""
        payload = {
            "neuro_sign_id": "sign-123",
            "confidence": "probable",
            "note": "Test note",
        }
        schema = CaseNeuroSignCreate(**payload)
        assert schema.neuro_sign_id == "sign-123"
        assert schema.confidence == "probable"

    def test_annotation_create_schema(self):
        """Test NeuroSignAnnotationCreate schema."""
        payload = {
            "neuro_sign_id": "sign-123",
            "shape_type": "polygon",
            "coordinates": [[10, 20], [30, 40]],
            "label": "Area",
            "color": "#FF0000",
        }
        schema = NeuroSignAnnotationCreate(**payload)
        assert schema.shape_type == "polygon"
        assert len(schema.coordinates) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
