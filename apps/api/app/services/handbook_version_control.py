"""
handbook_version_control.py — Git-like version control for clinical handbooks.

Provides HandbookVersion (immutable snapshot), HandbookVersionControl (CRUD,
diffing, branching, merging), and evidence-decay alerting. In-memory storage
with optional JSON persistence.
"""
from __future__ import annotations
import copy, json, uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

# ── Data classes ──

@dataclass
class DecayAlert:
    alert_id: str; handbook_id: str; version_id: str
    evidence_ref: str; evidence_level: str; months_since_update: int
    recommended_action: str; severity: str

@dataclass
class ComparisonResult:
    version_a: str; version_b: str; sections_added: List[str]
    sections_removed: List[str]; sections_modified: List[str]
    evidence_changed: List[str]; safety_changed: bool
    word_count_delta: int; modified_blocks: List[Dict[str, Any]]

@dataclass
class MergeResult:
    success: bool; merge_version_id: Optional[str]
    conflicts: List[Dict[str, Any]]; message: str

@dataclass
class HandbookVersion:
    version_id: str; handbook_id: str; parent_version: Optional[str]
    snapshot: Dict[str, Any]; diff: Dict[str, Any]; author: str
    timestamp: str; message: str; tags: List[str] = field(default_factory=list)
    branch: str = "main"
    def to_dict(self) -> Dict[str, Any]:
        return {"version_id": self.version_id, "handbook_id": self.handbook_id,
                "parent_version": self.parent_version, "snapshot": self.snapshot,
                "diff": self.diff, "author": self.author, "timestamp": self.timestamp,
                "message": self.message, "tags": self.tags, "branch": self.branch}
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> HandbookVersion:
        return HandbookVersion(version_id=data["version_id"], handbook_id=data["handbook_id"],
                               parent_version=data.get("parent_version"),
                               snapshot=data.get("snapshot", {}), diff=data.get("diff", {}),
                               author=data.get("author", ""), timestamp=data.get("timestamp", ""),
                               message=data.get("message", ""), tags=data.get("tags", []),
                               branch=data.get("branch", "main"))

# ── Diff engine ──

def get_diff_summary(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """Summarize changes between two handbook snapshots."""
    b_secs = {s["section_id"]: s for s in before.get("sections", [])}
    a_secs = {s["section_id"]: s for s in after.get("sections", [])}
    added = [s for s in a_secs if s not in b_secs]
    removed = [s for s in b_secs if s not in a_secs]
    modified, evidence_changed, safety_changed = [], [], False
    for sid, asec in a_secs.items():
        if sid in b_secs and asec != b_secs[sid]:
            modified.append(sid)
            if _extract_evidence(asec) != _extract_evidence(b_secs[sid]): evidence_changed.append(sid)
            if _has_safety_change(asec, b_secs[sid]): safety_changed = True
    wb = _word_count(before); wa = _word_count(after); ba, br = _block_delta(before, after)
    return {"sections_added": added, "sections_removed": removed, "sections_modified": modified,
            "evidence_changed": evidence_changed, "safety_changed": safety_changed,
            "word_count_delta": wa - wb, "blocks_added": ba, "blocks_removed": br}

def _extract_evidence(sec: Dict[str, Any]) -> List[str]:
    return [cb.get("props", {}).get("citation", "") + "|" + cb.get("content", "")
            for cb in sec.get("content_blocks", []) if cb.get("block_type") == "evidence"]

def _has_safety_change(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    return ([cb for cb in a.get("content_blocks", []) if cb.get("block_type") == "warning"]
            != [cb for cb in b.get("content_blocks", []) if cb.get("block_type") == "warning"])

def _word_count(hb: Dict[str, Any]) -> int:
    return sum(len(cb.get("content", "").split()) for s in hb.get("sections", [])
               for cb in s.get("content_blocks", []))

def _block_delta(b: Dict[str, Any], a: Dict[str, Any]) -> Tuple[int, int]:
    def cnt(h): return sum(len(s.get("content_blocks", [])) for s in h.get("sections", []))
    cb, ca = cnt(b), cnt(a); return max(0, ca - cb), max(0, cb - ca)

# ── Version Control System ──

class HandbookVersionControl:
    """Git-like version control for clinical handbooks."""
    def __init__(self):
        self._versions: Dict[str, HandbookVersion] = {}
        self._hb_versions: Dict[str, List[str]] = {}
        self._tags: Dict[str, Dict[str, str]] = {}
        self._branches: Dict[str, Dict[str, str]] = {}
        self._reviews: Dict[str, str] = {}

    def create_version(self, handbook_id: str, snapshot: Dict[str, Any], author: str,
                       message: str, parent_version: Optional[str] = None,
                       branch: str = "main", tags: Optional[List[str]] = None) -> HandbookVersion:
        vid = _new_id(); diff: Dict[str, Any] = {}
        if parent_version and parent_version in self._versions:
            diff = get_diff_summary(self._versions[parent_version].snapshot, snapshot)
        v = HandbookVersion(version_id=vid, handbook_id=handbook_id, parent_version=parent_version,
                            snapshot=snapshot, diff=diff, author=author, timestamp=_now(),
                            message=message, tags=tags or [], branch=branch)
        self._versions[vid] = v
        self._hb_versions.setdefault(handbook_id, []).append(vid)
        self._branches.setdefault(handbook_id, {})[branch] = vid
        return v

    def get_version(self, vid: str) -> Optional[HandbookVersion]: return self._versions.get(vid)

    def get_history(self, hbid: str, branch: Optional[str] = None) -> List[HandbookVersion]:
        v = [self._versions[vid] for vid in self._hb_versions.get(hbid, []) if vid in self._versions]
        return sorted([x for x in v if x.branch == branch] if branch else v, key=lambda x: x.timestamp)

    def get_latest_version(self, hbid: str, branch: str = "main") -> Optional[HandbookVersion]:
        bh = self._branches.get(hbid, {}).get(branch)
        return self._versions.get(bh) if bh else None

    def diff_versions(self, va: str, vb: str) -> Dict[str, Any]:
        a, b = self._versions.get(va), self._versions.get(vb)
        if not a or not b: raise ValueError("Version not found")
        return get_diff_summary(a.snapshot, b.snapshot)

    def compare_versions(self, va: str, vb: str) -> ComparisonResult:
        a, b = self._versions.get(va), self._versions.get(vb)
        if not a or not b: raise ValueError("Version not found")
        diff = get_diff_summary(a.snapshot, b.snapshot)
        return ComparisonResult(version_a=va, version_b=vb, sections_added=diff["sections_added"],
                                sections_removed=diff["sections_removed"],
                                sections_modified=diff["sections_modified"],
                                evidence_changed=diff["evidence_changed"],
                                safety_changed=diff["safety_changed"],
                                word_count_delta=diff["word_count_delta"],
                                modified_blocks=self._block_diff(a.snapshot, b.snapshot))

    def _block_diff(self, sa: Dict[str, Any], sb: Dict[str, Any]) -> List[Dict[str, Any]]:
        changes: List[Dict[str, Any]] = []
        secs_a = {s["section_id"]: s for s in sa.get("sections", [])}
        secs_b = {s["section_id"]: s for s in sb.get("sections", [])}
        for sid in sorted(set(secs_b) - set(secs_a)):
            for cb in secs_b[sid].get("content_blocks", []):
                changes.append({"action": "added", "section": secs_b[sid].get("title", sid),
                                "block_type": cb.get("block_type"),
                                "preview": cb.get("content", "")[:80]})
        for sid in sorted(set(secs_a) - set(secs_b)):
            for cb in secs_a[sid].get("content_blocks", []):
                changes.append({"action": "removed", "section": secs_a[sid].get("title", sid),
                                "block_type": cb.get("block_type"),
                                "preview": cb.get("content", "")[:80]})
        for sid in sorted(set(secs_a) & set(secs_b)):
            cbs_a = {cb.get("block_id", i): cb for i, cb in enumerate(secs_a[sid].get("content_blocks", []))}
            cbs_b = {cb.get("block_id", i): cb for i, cb in enumerate(secs_b[sid].get("content_blocks", []))}
            for bid in sorted(set(cbs_b) - set(cbs_a)):
                changes.append({"action": "block_added", "section": secs_b[sid].get("title", sid),
                                "block_type": cbs_b[bid].get("block_type"),
                                "preview": cbs_b[bid].get("content", "")[:80]})
            for bid in sorted(set(cbs_a) & set(cbs_b)):
                if cbs_a[bid] != cbs_b[bid]:
                    changes.append({"action": "modified", "section": secs_b[sid].get("title", sid),
                                    "block_type": cbs_b[bid].get("block_type"),
                                    "preview": cbs_b[bid].get("content", "")[:80]})
        return changes

    def revert_to_version(self, vid: str, author: str, message: Optional[str] = None) -> HandbookVersion:
        t = self._versions.get(vid)
        if not t: raise ValueError(f"Version {vid} not found")
        return self.create_version(t.handbook_id, copy.deepcopy(t.snapshot), author,
                                   message or f"Revert to {vid[:8]}", self._latest_vid(t.handbook_id))

    def tag_version(self, vid: str, tag: str) -> bool:
        v = self._versions.get(vid)
        if not v: return False
        if tag not in v.tags: v.tags.append(tag)
        self._tags.setdefault(v.handbook_id, {})[tag] = vid
        return True

    def get_tags(self, hbid: str) -> Dict[str, str]: return dict(self._tags.get(hbid, {}))

    def get_version_by_tag(self, hbid: str, tag: str) -> Optional[HandbookVersion]:
        vid = self._tags.get(hbid, {}).get(tag); return self._versions.get(vid) if vid else None

    def branch_from_version(self, vid: str, branch_name: str) -> str:
        v = self._versions.get(vid)
        if not v: raise ValueError(f"Version {vid} not found")
        nv = self.create_version(v.handbook_id, copy.deepcopy(v.snapshot), v.author,
                                 f"Branch '{branch_name}' from {vid[:8]}", vid, branch_name)
        self._branches.setdefault(v.handbook_id, {})[branch_name] = nv.version_id
        return nv.version_id

    def get_branches(self, hbid: str) -> List[str]: return list(self._branches.get(hbid, {}).keys())

    def merge_branches(self, hbid: str, src: str, tgt: str, author: str,
                       message: Optional[str] = None) -> MergeResult:
        branches = self._branches.get(hbid, {}); sv, tv = branches.get(src), branches.get(tgt)
        if not sv or not tv: return MergeResult(False, None, [], "Branch not found")
        anc = self._find_ancestor(sv, tv)
        if not anc: return MergeResult(False, None, [], "No common ancestor")
        conf = self._detect_conflicts(self._versions[anc].snapshot, self._versions[sv].snapshot,
                                      self._versions[tv].snapshot)
        if conf: return MergeResult(False, None, conf, f"Conflict: {src} vs {tgt}")
        merged = self._3way_merge(self._versions[anc].snapshot, self._versions[sv].snapshot,
                                  self._versions[tv].snapshot)
        mv = self.create_version(hbid, merged, author, message or f"Merge {src} into {tgt}",
                                  tv, tgt)
        self._branches[hbid][tgt] = mv.version_id
        return MergeResult(True, mv.version_id, [], "Merge successful")

    def _find_ancestor(self, a: str, b: str) -> Optional[str]:
        pa: Set[str] = set(); cur = a
        while cur: pa.add(cur); v = self._versions.get(cur); cur = v.parent_version if v else None
        cur = b
        while cur:
            if cur in pa: return cur
            v = self._versions.get(cur); cur = v.parent_version if v else None
        return None

    def _detect_conflicts(self, base: Dict[str, Any], src: Dict[str, Any],
                          tgt: Dict[str, Any]) -> List[Dict[str, Any]]:
        conflicts = []
        bs = {s["section_id"]: s for s in base.get("sections", [])}
        ss = {s["section_id"]: s for s in src.get("sections", [])}
        ts = {s["section_id"]: s for s in tgt.get("sections", [])}
        for sid in set(ss) | set(ts):
            sa, sb, sc = bs.get(sid), ss.get(sid), ts.get(sid)
            if sa and sb and sc and sb != sa and sc != sa and sb != sc:
                conflicts.append({"type": "section_conflict", "section_id": sid, "title": sa.get("title", sid)})
            elif sb and sc and not sa and sb != sc:
                conflicts.append({"type": "both_added", "section_id": sid, "title": sb.get("title", sid)})
        return conflicts

    def _3way_merge(self, base: Dict[str, Any], src: Dict[str, Any], tgt: Dict[str, Any]) -> Dict[str, Any]:
        merged = copy.deepcopy(tgt)
        ms = {s["section_id"]: s for s in merged.get("sections", [])}
        ss = {s["section_id"]: s for s in src.get("sections", [])}
        bs = {s["section_id"]: s for s in base.get("sections", [])}
        for sid, sec in ss.items():
            if sid not in bs and sid not in ms: ms[sid] = copy.deepcopy(sec)
        merged["sections"] = list(ms.values()); return merged

    def _latest_vid(self, hbid: str) -> Optional[str]:
        h = self.get_history(hbid); return h[-1].version_id if h else None

    def check_evidence_freshness(self, hbid: str) -> List[DecayAlert]:
        alerts: List[DecayAlert] = []; latest = self.get_latest_version(hbid)
        if not latest: return alerts
        age = _months_since(latest.timestamp)
        if age < 6: return alerts
        for sec in latest.snapshot.get("sections", []):
            for cb in sec.get("content_blocks", []):
                if cb.get("block_type") == "evidence":
                    props = cb.get("props", {}); lvl = props.get("evidence_level", "C")
                    cit = props.get("citation", "Unknown")
                    sev = "critical" if lvl in ("A", "B") and age > 18 else ("high" if age > 18 else "medium" if age > 12 else "low")
                    alerts.append(DecayAlert(alert_id=_new_id(), handbook_id=hbid, version_id=latest.version_id,
                                             evidence_ref=cit, evidence_level=lvl, months_since_update=age,
                                             recommended_action=f"Review Level-{lvl} evidence: {cit}", severity=sev))
        return sorted(alerts, key=lambda a: ["low", "medium", "high", "critical"].index(a.severity), reverse=True)

    def schedule_evidence_review(self, hbid: str, months: int = 12) -> bool:
        self._reviews[hbid] = (datetime.now(timezone.utc) + timedelta(days=30 * months)).isoformat(); return True

    def get_pending_reviews(self) -> List[Dict[str, str]]:
        now = datetime.now(timezone.utc).isoformat()
        return [{"handbook_id": h, "review_date": d} for h, d in self._reviews.items() if d <= now]

    # ── Persistence ──

    def to_json(self) -> str:
        return json.dumps({"versions": {vid: v.to_dict() for vid, v in self._versions.items()},
                           "handbook_versions": self._hb_versions, "tags": self._tags,
                           "branches": self._branches, "scheduled_reviews": self._reviews}, indent=2)

    @staticmethod
    def from_json(js: str) -> HandbookVersionControl:
        d = json.loads(js); vc = HandbookVersionControl()
        vc._versions = {vid: HandbookVersion.from_dict(vd) for vid, vd in d.get("versions", {}).items()}
        vc._hb_versions = d.get("handbook_versions", {})
        vc._tags = d.get("tags", {})
        vc._branches = d.get("branches", {})
        vc._reviews = d.get("scheduled_reviews", {})
        return vc

# ── Helpers ──

def _new_id() -> str: return uuid.uuid4().hex[:12]
def _now() -> str: return datetime.now(timezone.utc).isoformat()

def _months_since(ts: str) -> int:
    try:
        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return max(0, int((datetime.now(timezone.utc) - t).days / 30))
    except (ValueError, TypeError): return 0

# ── Demo ──

def _snap(hbid: str, title: str, sections: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"handbook_id": hbid, "title": title, "sections": sections}

def run_demo():
    vc = HandbookVersionControl(); hbid = "hb-stroke-001"
    v1s = _snap(hbid, "Stroke v1", [
        {"section_id": "s1", "title": "Triage", "order": 0,
         "content_blocks": [
             {"block_type": "paragraph", "content": "Evaluate within 10 min.", "block_id": "b1"},
             {"block_type": "evidence", "content": "Time is brain.", "block_id": "b2",
              "props": {"evidence_level": "A", "citation": "Jauch 2013"}}]},
        {"section_id": "s2", "title": "Imaging", "order": 1,
         "content_blocks": [
             {"block_type": "paragraph", "content": "Non-contrast CT first.", "block_id": "b3"},
             {"block_type": "warning", "content": "Do NOT delay CT for labs.", "block_id": "b4"}]}])
    v1 = vc.create_version(hbid, v1s, "Dr.Smith", "Initial protocol", tags=["v1.0"])
    print(f"v1: {v1.version_id[:8]} tags={v1.tags}")
    v2s = copy.deepcopy(v1s)
    v2s["sections"].append({"section_id": "s3", "title": "Thrombolysis", "order": 2,
        "content_blocks": [
            {"block_type": "paragraph", "content": "Alteplase 0.9 mg/kg IV.", "block_id": "b5"},
            {"block_type": "evidence", "content": "NNT=8.", "block_id": "b6",
             "props": {"evidence_level": "A", "citation": "NINDS 1995"}}]})
    v2 = vc.create_version(hbid, v2s, "Dr.Lee", "Add thrombolysis", parent_version=v1.version_id)
    vc.tag_version(v2.version_id, "v1.1")
    print(f"v2: {v2.version_id[:8]} tags={v2.tags}")
    v3s = copy.deepcopy(v2s)
    v3s["sections"][0]["content_blocks"].append(
        {"block_type": "checklist", "content": "Check glucose.", "block_id": "b7", "props": {"checked": False}})
    v3 = vc.create_version(hbid, v3s, "Dr.Smith", "Add glucose check", parent_version=v2.version_id)
    print(f"v3: {v3.version_id[:8]}")
    diff = vc.diff_versions(v1.version_id, v3.version_id)
    print(f"\nDiff v1->v3: +{diff['sections_added']} secs, Δwords={diff['word_count_delta']:+d}, safety={diff['safety_changed']}")
    comp = vc.compare_versions(v1.version_id, v3.version_id)
    print(f"Compare: added={comp.sections_added}, modified={comp.sections_modified}, evidence={comp.evidence_changed}")
    bh = vc.branch_from_version(v2.version_id, "experimental")
    print(f"\nBranch 'experimental': {bh[:8]}")
    bs = copy.deepcopy(v2s)
    bs["sections"].append({"section_id": "s4", "title": "Endovascular Therapy", "order": 3,
        "content_blocks": [
            {"block_type": "paragraph", "content": "EVT for LVO within 6h.", "block_id": "b8"},
            {"block_type": "evidence", "content": "MR CLEAN showed benefit.", "block_id": "b9",
             "props": {"evidence_level": "A", "citation": "Berkhemer 2015"}}]})
    vc.create_version(hbid, bs, "Dr.Chen", "Add EVT", parent_version=bh, branch="experimental")
    mr = vc.merge_branches(hbid, "experimental", "main", "Dr.Chen", "Merge EVT into main")
    print(f"Merge: success={mr.success}, conflicts={len(mr.conflicts)}, {mr.message}")
    vr = vc.revert_to_version(v2.version_id, "Dr.Admin", "Rollback to v1.1")
    print(f"Revert: {vr.version_id[:8]} '{vr.message}'")
    alerts = vc.check_evidence_freshness(hbid)
    print(f"\nDecay alerts: {len(alerts)}")
    for a in alerts[:3]: print(f"  [{a.severity}] {a.evidence_ref}")
    print(f"Tags: {vc.get_tags(hbid)}")
    history = vc.get_history(hbid)
    print(f"\nHistory ({len(history)} versions):")
    for h in history: print(f"  {h.version_id[:8]} | {h.timestamp[:10]} | {h.author:12s} | {h.message}")
    vc2 = HandbookVersionControl.from_json(vc.to_json())
    print(f"\nRound-trip: {len(vc2._versions)} versions")

if __name__ == "__main__":
    run_demo()
