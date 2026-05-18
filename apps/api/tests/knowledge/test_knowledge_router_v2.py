"""test_knowledge_router_v2.py -- Tests all 16 endpoints with mocked deps."""
from __future__ import annotations
import sys
from types import ModuleType
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

# Mock auth/errors BEFORE importing router
_auth=ModuleType("app.auth")
class _MockActor:
    def __init__(self,**kw):
        self.role=kw.get("role","patient")
        self.user_id=kw.get("user_id","user-001")
        self.clinic_id="clinic-001"
_auth.AuthenticatedActor=_MockActor
_auth.get_authenticated_actor=lambda:_MockActor(role="patient",user_id="user-001")
_auth.require_minimum_role=lambda actor,role:None
_auth.require_patient_owner=lambda *a,**kw:None
_err=ModuleType("app.errors")
class ApiServiceError(Exception):
    def __init__(self,code="",message="",status_code=400):
        self.code=code; self.message=message; self.status_code=status_code
        super().__init__(message)
_err.ApiServiceError=ApiServiceError
sys.modules["app.auth"]=_auth
sys.modules["app.errors"]=_err

from knowledge_router_v2 import router as knowledge_router_v2
import knowledge_router_v2 as _rm

app=FastAPI()
app.include_router(knowledge_router_v2)

@app.exception_handler(_rm.ApiServiceError)
async def eh(request,exc):
    return JSONResponse(status_code=exc.status_code,content={"code":exc.code,"detail":exc.message})

@pytest.fixture
def client(): return TestClient(app)

class TestAdapterDiscovery:
    def test_get_adapters_returns_66(self,client):
        """Case 1"""
        r=client.get("/api/v2/knowledge/adapters")
        assert r.status_code==200
        d=r.json()
        assert d["total_adapters"]==66
        assert len(d["adapters"])==66
        assert d["provenance"]["api_version"]=="2.0.0"
        names={a["name"] for a in d["adapters"]}
        assert {"pubmed","clinicaltrials_gov","rxnorm","faers"} <= names
    def test_get_adapter_categories_11(self,client):
        """Case 2"""
        r=client.get("/api/v2/knowledge/adapters/categories")
        assert r.status_code==200
        d=r.json()
        assert d["total_categories"]==11
        assert sum(c["adapter_count"] for c in d["categories"])==66
    def test_get_adapters_stats(self,client):
        """Case 3"""
        r=client.get("/api/v2/knowledge/adapters/stats")
        assert r.status_code==200
        d=r.json()
        assert d["total_adapters"]==66
        assert d["healthy_adapters"]==66
        assert sum(d["by_category"].values())==66
        assert sum(d["by_tier"].values())==66

class TestUnifiedSearch:
    def test_get_search_depression(self,client):
        """Case 4"""
        r=client.get("/api/v2/knowledge/search?q=depression")
        assert r.status_code==200
        d=r.json()
        assert d["query"]=="depression"
        assert d["total_results"]==2
        srcs={res["source"] for res in d["results"]}
        assert "PubMed" in srcs and "ClinicalTrials.gov" in srcs
    def test_post_search_complex(self,client):
        """Case 5"""
        r=client.post("/api/v2/knowledge/search",json={"query":"depression","sources":["PubMed"],"max_results":10,"confidence_min":0.5})
        assert r.status_code==200
        assert r.json()["confidence_tier"]=="research"

class TestAdapterSpecific:
    def test_get_pubmed_search(self,client):
        """Case 6"""
        r=client.get("/api/v2/knowledge/pubmed/search?q=depression")
        assert r.status_code==200
        assert r.json()["adapter"]=="pubmed"
    def test_get_pubmed_status(self,client):
        """Case 7"""
        r=client.get("/api/v2/knowledge/pubmed/status")
        assert r.status_code==200
        d=r.json()
        assert d["adapter"]=="pubmed"
        assert d["status"]=="healthy"
        assert d["latency_ms"]>=0

class TestAnalysis:
    def test_post_medication(self,client):
        """Case 8"""
        r=client.post("/api/v2/knowledge/medication-analysis",json={"medications":["sertraline","bupropion","lisinopril"],"include_pharmacogenomics":True,"genes":["CYP2D6","CYP2B6"]})
        assert r.status_code==200
        d=r.json()
        assert len(d["interactions"])==2
        assert len(d["pgx_alerts"])==2
        assert d["research_only"]==True
    def test_post_genetic(self,client):
        """Case 9"""
        r=client.post("/api/v2/knowledge/genetic-analysis",json={"variant":"rs121912617","gene":"BRCA1"})
        assert r.status_code==200
        d=r.json()
        assert d["variant"]=="rs121912617"
        assert d["interpretations"][0]["gene"]=="BRCA1"
    def test_post_qeeg(self,client):
        """Case 10"""
        r=client.post("/api/v2/knowledge/qeeg-analysis",json={"patient_id":"PT-001","recording_id":"REC-001","age":35.0,"sex":"M","features":["delta","theta","alpha"]})
        assert r.status_code==200
        d=r.json()
        assert d["patient_id"]=="PT-001"
        assert "global_z_scores" in d
    def test_post_mri(self,client):
        """Case 11"""
        r=client.post("/api/v2/knowledge/mri-analysis",json={"patient_id":"PT-001","scan_id":"SCAN-001","atlas":"AAL3","regions_of_interest":["prefrontal"]})
        assert r.status_code==200
        d=r.json()
        assert d["atlas"]=="AAL3"
        assert len(d["regional_volumes"])==1

class TestSynthesisDeepTwin:
    def test_post_synthesize(self,client):
        """Case 12"""
        r=client.post("/api/v2/knowledge/synthesize",json={"patient_id":"PT-001","modalities":["qeeg","mri"]})
        assert r.status_code==200
        d=r.json()
        assert len(d["results"])==2
        assert d["confidence_tier"]=="experimental"
    def test_get_deeptwin(self,client):
        """Case 13"""
        r=client.get("/api/v2/knowledge/deeptwin/PT-001")
        assert r.status_code==200
        d=r.json()
        assert d["patient_id"]=="PT-001"
        assert d["twin_status"]=="active"
    def test_post_deeptwin_synth(self,client):
        """Case 14"""
        r=client.post("/api/v2/knowledge/deeptwin/PT-001/synthesize",json={"patient_id":"PT-001"})
        assert r.status_code==202
        d=r.json()
        assert d["status"]=="queued"
        assert d["run_id"]=="RUN-2026-001"

class TestEvidenceStore:
    def test_get_evidence_stats(self,client):
        """Case 15"""
        r=client.get("/api/v2/knowledge/evidence/stats")
        assert r.status_code==200
        d=r.json()
        assert d["total_papers"]>0
        assert d["total_trials"]>0
    def test_get_evidence_search(self,client):
        """Case 16"""
        r=client.get("/api/v2/knowledge/evidence/search?q=depression")
        assert r.status_code==200
        d=r.json()
        assert d["query"]=="depression"
        assert "papers" in d and "trials" in d

class TestEdgeCases:
    def test_medication_empty_400(self,client):
        r=client.post("/api/v2/knowledge/medication-analysis",json={"medications":[]})
        assert r.status_code==400
    def test_genetic_missing_variant_400(self,client):
        r=client.post("/api/v2/knowledge/genetic-analysis",json={"gene":"BRCA1"})
        assert r.status_code==400
    def test_synthesize_empty_400(self,client):
        r=client.post("/api/v2/knowledge/synthesize",json={"patient_id":"PT-001","modalities":[]})
        assert r.status_code==400
    def test_adapter_search_404(self,client):
        r=client.get("/api/v2/knowledge/nonexistent/search?q=test")
        assert r.status_code==404
    def test_adapter_status_404(self,client):
        r=client.get("/api/v2/knowledge/nonexistent/status")
        assert r.status_code==404
    def test_qeeg_invalid_features_422(self,client):
        r=client.post("/api/v2/knowledge/qeeg-analysis",json={"patient_id":"PT-1","recording_id":"REC-1","age":30,"sex":"M","features":["bad"]})
        assert r.status_code==422
    def test_search_post_invalid_max_422(self,client):
        r=client.post("/api/v2/knowledge/search",json={"query":"x","max_results":200})
        assert r.status_code==422
    def test_evidence_search_max_over_422(self,client):
        r=client.get("/api/v2/knowledge/evidence/search?q=test&max_results=101")
        assert r.status_code==422
    def test_all_get_json(self,client):
        for ep in ["/api/v2/knowledge/adapters","/api/v2/knowledge/adapters/categories","/api/v2/knowledge/adapters/stats","/api/v2/knowledge/search?q=d","/api/v2/knowledge/pubmed/search?q=d","/api/v2/knowledge/pubmed/status","/api/v2/knowledge/deeptwin/PT-001","/api/v2/knowledge/evidence/stats","/api/v2/knowledge/evidence/search?q=d"]:
            r=client.get(ep)
            assert r.headers.get("content-type")=="application/json", ep
            assert isinstance(r.json(),dict), ep
    def test_all_post_json(self,client):
        for ep,payload in [("/api/v2/knowledge/search",{"query":"t"}),("/api/v2/knowledge/medication-analysis",{"medications":["aspirin"]}),("/api/v2/knowledge/genetic-analysis",{"variant":"rs123"}),("/api/v2/knowledge/qeeg-analysis",{"patient_id":"PT-1","recording_id":"REC-1","age":30,"sex":"M"}),("/api/v2/knowledge/mri-analysis",{"patient_id":"PT-1","scan_id":"S1","atlas":"AAL3"}),("/api/v2/knowledge/synthesize",{"patient_id":"PT-1","modalities":["qeeg"]}),("/api/v2/knowledge/deeptwin/PT-001/synthesize",{"patient_id":"PT-001"})]:
            r=client.post(ep,json=payload)
            assert r.headers.get("content-type")=="application/json", f"POST {ep}"
            assert isinstance(r.json(),dict), f"POST {ep}"
