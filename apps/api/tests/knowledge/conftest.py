#!/usr/bin/env python3
"""
Shared fixtures for Batch C adapter tests.
"""

from __future__ import annotations

import io
import logging
import os
import zipfile
from datetime import date
from typing import Any, Dict, List

import pytest

# Ensure adapters package is importable
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")


# ---------------------------------------------------------------------------
# Mock data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_cache_dir(tmp_path):
    """Provide a temporary cache directory."""
    return str(tmp_path / "cache")


@pytest.fixture
def mock_orange_book_zip():
    """Build an in-memory ZIP file mimicking the Orange Book data files."""
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)

    products_tsv = (
        "Ingredient\tDF;Route\tTrade_Name\tApplicant_Full_Name\t"
        "Strength\tAppl_Type\tAppl_No\tProduct_No\tTE_Code\t"
        "Approval_Date\tRLD\tRS\tType\tApplicant\n"
        "IBUPROFEN\tTABLET;ORAL\tADVIL\tPfizer Inc\t200 MG\t"
        "ANDA\t077900\t001\tAB\tJan 15, 2008\t\tY\t\tPfizer\n"
        "ACETAMINOPHEN\tCAPSULE;ORAL\tTYLENOL\tJohnson & Johnson\t"
        "500 MG\tNDA\t021123\t001\tAA\tMar 22, 2001\tY\tY\t\tJ&J\n"
        "METFORMIN HYDROCHLORIDE\tTABLET;ORAL\tGLUCOPHAGE\t"
        "Bristol-Myers Squibb\t500 MG\tANDA\t078123\t001\tAB\t"
        "Aug 03, 2004\t\t\t\tBMS\n"
    )
    zf.writestr("products.txt", products_tsv)

    patents_tsv = (
        "Appl_Type\tAppl_No\tProduct_No\tPatent_No\t"
        "Patent_Expire_Date_Text\tDrug_Substance_Flag\t"
        "Drug_Product_Flag\tPatent_Use_Code\t"
        "Delist_Requested\tSubmission_Date\n"
        "NDA\t021123\t001\t5678901\tMar 22, 2021\tY\tY\t\t\t\n"
    )
    zf.writestr("patents.txt", patents_tsv)

    exclusivity_tsv = (
        "Appl_Type\tAppl_No\tProduct_No\tExclusivity_Code\tExclusivity_Date\n"
        "NDA\t021123\t001\tNCE\tMar 22, 2006\n"
    )
    zf.writestr("exclusivity.txt", exclusivity_tsv)

    zf.close()
    buf.seek(0)
    return buf.read()


@pytest.fixture
def mock_orange_book_raw():
    """Parsed Orange Book dict (post-fetch, pre-transform)."""
    return {
        "products": [
            {
                "ingredient": "IBUPROFEN",
                "df;route": "TABLET;ORAL",
                "trade_name": "ADVIL",
                "applicant_full_name": "Pfizer Inc",
                "strength": "200 MG",
                "appl_type": "ANDA",
                "appl_no": "077900",
                "product_no": "001",
                "te_code": "AB",
                "approval_date": "Jan 15, 2008",
                "rld": "",
                "rs": "Y",
                "type": "",
                "applicant": "Pfizer",
            },
            {
                "ingredient": "ACETAMINOPHEN",
                "df;route": "CAPSULE;ORAL",
                "trade_name": "TYLENOL",
                "applicant_full_name": "Johnson & Johnson",
                "strength": "500 MG",
                "appl_type": "NDA",
                "appl_no": "021123",
                "product_no": "001",
                "te_code": "AA",
                "approval_date": "Mar 22, 2001",
                "rld": "Y",
                "rs": "Y",
                "type": "",
                "applicant": "J&J",
            },
        ],
        "patents": [
            {
                "appl_type": "NDA", "appl_no": "021123", "product_no": "001",
                "patent_no": "5678901", "patent_expire_date_text": "Mar 22, 2021",
                "drug_substance_flag": "Y", "drug_product_flag": "Y",
                "patent_use_code": "", "delist_requested": "", "submission_date": "",
            },
        ],
        "exclusivity": [
            {
                "appl_type": "NDA", "appl_no": "021123", "product_no": "001",
                "exclusivity_code": "NCE", "exclusivity_date": "Mar 22, 2006",
            },
        ],
    }


@pytest.fixture
def mock_ndc_zip():
    """Build an in-memory ZIP file mimicking the NDC Directory data files."""
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)

    product_csv = (
        "PRODUCTID,PRODUCTNDC,PRODUCTTYPENAME,PROPRIETARYNAME,"
        "PROPRIETARYNAMESUFFIX,NONPROPRIETARYNAME,DOSAGEFORMNAME,"
        "ROUTENAME,STARTMARKETINGDATE,ENDMARKETINGDATE,"
        "MARKETINGCATEGORYNAME,APPLICATIONNUMBER,"
        "LABELERNAME,SUBSTANCENAME,ACTIVE_NUMERATOR_STRENGTH,"
        "ACTIVE_INGRED_UNIT,PHARM_CLASSES,DEASCHEDULE,"
        "NDC_EXCLUDE_FLAG,LISTING_RECORD_CERTIFIED_THROUGH\n"
        "00143-9508_8e465279-8367-43e2-829c-54722f412ab5,"
        "00143-9508,HUMAN PRESCRIPTION DRUG,LIPITOR,,"
        "ATORVASTATIN CALCIUM,TABLET,ORAL,19970101,,"
        "NDA,NDA020702,Pfizer Inc,ATORVASTATIN CALCIUM,10,"
        "mg/kg,HMG-CoA Reductase Inhibitors [MoA],,"
        "YES,20241231\n"
        "00169-5901_3c7e30f4-9c8a-4b9e-8d2f-1a3b5c7d9e0f,"
        "00169-5901,HUMAN OTC DRUG,MOTRIN IB,,"
        "IBUPROFEN,TABLET,ORAL,19890501,,"
        "NDA,NDA019012,Johnson & Johnson,IBUPROFEN,200,"
        "mg,Anti-Inflammatory Agents,,"
        "YES,20241231\n"
    )
    zf.writestr("product.txt", product_csv)

    package_csv = (
        "PRODUCTID,PRODUCTNDC,NDCPACKAGECODE,PACKAGEDESCRIPTION,"
        "STARTMARKETINGDATE,ENDMARKETINGDATE,NDC_EXCLUDE_FLAG,"
        "SAMPLE_PACKAGE\n"
        "00143-9508_8e465279-8367-43e2-829c-54722f412ab5,"
        "00143-9508,00143-9508-01,100 TABLET IN 1 BOTTLE,"
        "19970101,,YES,\n"
        "00143-9508_8e465279-8367-43e2-829c-54722f412ab5,"
        "00143-9508,00143-9508-02,500 TABLET IN 1 BOTTLE,"
        "19970101,,YES,\n"
    )
    zf.writestr("package.txt", package_csv)

    zf.close()
    buf.seek(0)
    return buf.read()


@pytest.fixture
def mock_unii_zip():
    """Build an in-memory ZIP file mimicking the UNII data."""
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)

    unii_csv = (
        "NAME,TYPE,UNII,DISPLAY_NAME,INCHIKEY,SMILES,"
        "INCHI,IUPAC_NAME,CAS_NUMBER\n"
        '"IBUPROFEN","INGREDIENT","WK2XYI10QM","Ibuprofen",'
        '"HEFNNWSXXWATRW-UHFFFAOYSA-N","CC(C)Cc1ccc(cc1)C(C)C(=O)O",'
        '"InChI=1S/C13H18O2/c1-9(2)8-11-4-6-12(7-5-11)10(3)13(14)15/h4-7,9-10H,8H2,1-3H3,(H,14,15)",'
        '"2-(4-isobutylphenyl)propanoic acid","15687-27-1"\n'
        '"ACETAMINOPHEN","INGREDIENT","362O9ITL9D","Acetaminophen",'
        '"RZVAJINKPMORJF-UHFFFAOYSA-N","CC(=O)Nc1ccc(O)cc1",'
        '"InChI=1S/C8H9NO2/c1-6(10)9-7-2-4-8(11)5-3-7/h2-5,11H,1H3,(H,9,10)",'
        '"paracetamol","103-90-2"\n'
        '"WATER","INGREDIENT","059QF0KO0R","Water",'
        '"XLYOFNOQVPJJNP-UHFFFAOYSA-N","O","InChI=1S/H2O/h1H2",'
        '"oxidane","7732-18-5"\n'
    )
    zf.writestr("UNII_Data.csv", unii_csv)

    zf.close()
    buf.seek(0)
    return buf.read()


@pytest.fixture
def mock_http_response():
    """Factory for creating mock requests.Response objects."""
    class MockResponse:
        def __init__(self, content: bytes = b"", text: str = "", status_code: int = 200):
            self.content = content
            self.text = text
            self.status_code = status_code
            self.headers = {"content-type": "application/zip"}

        def raise_for_status(self):
            if self.status_code >= 400:
                from requests import HTTPError
                raise HTTPError(f"{self.status_code}")

    return MockResponse
