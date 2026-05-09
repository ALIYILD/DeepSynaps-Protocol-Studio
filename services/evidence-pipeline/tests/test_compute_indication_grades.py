from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import db
from compute_indication_grades import _compute_grade, compute_grades


MIGRATION_PATH = ROOT / "migrations" / "011_indications_computed_grade.sql"


def _bootstrap(tmp_path):
    db_path = tmp_path / "evidence.db"
    db.init(db_path)
    conn = db.connect(db_path)
    with open(MIGRATION_PATH) as f:
        conn.executescript(f.read())
    slugs = [
        ("high_evidence",   "High Evidence",   "rTMS", "Depression"),
        ("mid_evidence",    "Mid Evidence",    "tDCS", "Pain"),
        ("active_research", "Active Research", "PBM",  "TBI"),
        ("emerging",        "Emerging",        "ESWT", "CRPS"),
        ("speculative",     "Speculative",     "NFB",  "Anxiety"),
    ]
    for slug, label, modality, condition in slugs:
        db.upsert_indication(conn, slug, label, modality, condition, grade=None)
    for i in range(450):
        conn.execute(
            "INSERT INTO papers(doi, title, last_ingested) VALUES (?,?,?)",
            ("10.1000/p%04d" % i, "Paper %d" % i, "2026-01-01"),
        )
    def ind_id(slug):
        return conn.execute("SELECT id FROM indications WHERE slug=?", (slug,)).fetchone()[0]
    def paper_id(doi):
        return conn.execute("SELECT id FROM papers WHERE doi=?", (doi,)).fetchone()[0]
    for i in range(250):
        conn.execute(
            "INSERT INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
            (paper_id("10.1000/p%04d" % i), ind_id("high_evidence")),
        )
    for i in range(110):
        conn.execute(
            "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
            (paper_id("10.1000/p%04d" % (260 + i)), ind_id("mid_evidence")),
        )
    for i in range(40):
        conn.execute(
            "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
            (paper_id("10.1000/p%04d" % (370 + i)), ind_id("active_research")),
        )
    for i in range(7):
        conn.execute(
            "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
            (paper_id("10.1000/p%04d" % (200 + i)), ind_id("emerging")),
        )
    for i in range(2):
        conn.execute(
            "INSERT OR IGNORE INTO paper_indications(paper_id, indication_id) VALUES (?,?)",
            (paper_id("10.1000/p%04d" % (220 + i)), ind_id("speculative")),
        )
    for i in range(15):
        conn.execute(
            "INSERT INTO trials(nct_id, title) VALUES (?,?)",
            ("NCT%08d" % i, "Trial %d" % i),
        )
        tid = conn.execute("SELECT id FROM trials WHERE nct_id=?", ("NCT%08d" % i,)).fetchone()[0]
        conn.execute(
            "INSERT INTO trial_indications(trial_id, indication_id) VALUES (?,?)",
            (tid, ind_id("high_evidence")),
        )
    for i in range(8):
        conn.execute(
            "INSERT INTO devices(kind, number, trade_name, generic_name, decision_date, applicant) "
            "VALUES (?,?,?,?,?,?)",
            ('pma', "P%06d" % i, "Dev%d" % i, 'Stim', '2020-01-01', 'Corp'),
        )
        did = conn.execute("SELECT id FROM devices WHERE number=?", ("P%06d" % i,)).fetchone()[0]
        conn.execute(
            "INSERT INTO device_indications(device_id, indication_id) VALUES (?,?)",
            (did, ind_id("high_evidence")),
        )
    conn.execute(
        "INSERT INTO devices(kind, number, trade_name, generic_name, decision_date, applicant) "
        "VALUES (?,?,?,?,?,?)",
        ('pma', 'P999999', 'MidDev', 'TENS', '2019-01-01', 'MidCorp'),
    )
    mid_did = conn.execute("SELECT id FROM devices WHERE number='P999999'").fetchone()[0]
    conn.execute(
        "INSERT INTO device_indications(device_id, indication_id) VALUES (?,?)",
        (mid_did, ind_id("mid_evidence")),
    )
    return conn, str(db_path)


def test_rubric_grade_a():
    assert _compute_grade(200, 10, 5) == "A"
    assert _compute_grade(500, 50, 20) == "A"


def test_rubric_grade_a_boundary_requires_all_three_thresholds():
    assert _compute_grade(199, 10, 5) != "A"
    assert _compute_grade(200, 9, 5) != "A"
    assert _compute_grade(200, 10, 4) != "A"


def test_rubric_grade_b():
    assert _compute_grade(100, 0, 1) == "B"
    assert _compute_grade(150, 5, 1) == "B"


def test_rubric_grade_c():
    assert _compute_grade(30, 0, 0) == "C"
    assert _compute_grade(99, 0, 0) == "C"


def test_rubric_grade_d():
    assert _compute_grade(5, 0, 0) == "D"
    assert _compute_grade(29, 0, 0) == "D"


def test_rubric_grade_e():
    assert _compute_grade(0, 0, 0) == "E"
    assert _compute_grade(4, 0, 0) == "E"
    assert _compute_grade(1, 100, 50) == "E"


def test_compute_grades_writes_correct_letters(tmp_path):
    conn, db_path = _bootstrap(tmp_path)
    conn.close()
    grades = compute_grades(db_path=db_path, dry_run=False)
    assert isinstance(grades, dict)
    assert len(grades) == 5
    assert grades["high_evidence"] == "A"
    assert grades["active_research"] == "C"
    assert grades["speculative"] == "E"


def test_computed_grade_persisted_in_db(tmp_path):
    conn, db_path = _bootstrap(tmp_path)
    conn.close()
    compute_grades(db_path=db_path, dry_run=False)
    conn = db.connect(db_path)
    rows = conn.execute(
        "SELECT slug, computed_evidence_grade FROM indications ORDER BY slug"
    ).fetchall()
    conn.close()
    slugs_grades = {r["slug"]: r["computed_evidence_grade"] for r in rows}
    for g in slugs_grades.values():
        assert g in ("A", "B", "C", "D", "E"), f"unexpected grade {g!r}"
    assert slugs_grades["high_evidence"] == "A"
    assert slugs_grades["speculative"] == "E"


def test_dry_run_does_not_write(tmp_path):
    conn, db_path = _bootstrap(tmp_path)
    conn.close()
    compute_grades(db_path=db_path, dry_run=True)
    conn = db.connect(db_path)
    rows = conn.execute("SELECT computed_evidence_grade FROM indications").fetchall()
    conn.close()
    for r in rows:
        assert r["computed_evidence_grade"] is None


def test_idempotent_second_run_same_result(tmp_path):
    conn, db_path = _bootstrap(tmp_path)
    conn.close()
    g1 = compute_grades(db_path=db_path, dry_run=False)
    g2 = compute_grades(db_path=db_path, dry_run=False)
    assert g1 == g2


def test_indications_summary_shape_includes_computed_grade(tmp_path):
    """
    Verify that the API-style SELECT (same query as evidence_router) returns
    computed_evidence_grade populated for every row after a compute_grades() run.
    This is the direct gate for the API delivery requirement.
    """
    conn, db_path = _bootstrap(tmp_path)
    conn.close()
    compute_grades(db_path=db_path, dry_run=False)
    conn = db.connect(db_path)
    rows = conn.execute(
        "SELECT id, slug, label, modality, condition, evidence_grade, "
        "computed_evidence_grade, regulatory "
        "FROM indications ORDER BY modality, slug"
    ).fetchall()
    conn.close()
    assert len(rows) == 5
    for row in rows:
        assert row["computed_evidence_grade"] is not None, (
            "computed_evidence_grade is NULL for %s" % row["slug"]
        )
        assert row["computed_evidence_grade"] in ("A", "B", "C", "D", "E")
        assert "evidence_grade" in row.keys()
        assert "computed_evidence_grade" in row.keys()
        assert row["evidence_grade"] is None
