"""
handbook_block_tree.py — Notion-style block tree for clinical handbook editing.

Provides Block (atomic content node) and BlockTree (hierarchical document model)
with CRUD, tree traversal, nesting, and serialization to HTML / Markdown / JSON.
"""
from __future__ import annotations
import html as html_lib, json, uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ── Constants ──

class BlockType:
    HEADING = "heading"; PARAGRAPH = "paragraph"; BULLET_LIST = "bullet_list"
    NUMBERED_LIST = "numbered_list"; EVIDENCE = "evidence"; QUOTE = "quote"
    DIVIDER = "divider"; TABLE = "table"; CHECKLIST = "checklist"
    WARNING = "warning"; CODE = "code"; IMAGE = "image"
    ALL = [HEADING, PARAGRAPH, BULLET_LIST, NUMBERED_LIST, EVIDENCE,
           QUOTE, DIVIDER, TABLE, CHECKLIST, WARNING, CODE, IMAGE]

# ── Data classes ──

@dataclass
class HandbookSection:
    section_id: str; title: str; level: int
    content_blocks: List[Dict[str, Any]]; order_index: int
    parent_section_id: Optional[str] = None

@dataclass
class Block:
    block_id: str; block_type: str; content: str = ""
    props: Dict[str, Any] = field(default_factory=dict)
    children: List[Block] = field(default_factory=list)
    parent_id: Optional[str] = None; order: int = 0
    created_by: str = "system"; created_at: str = ""; updated_at: str = ""
    def __post_init__(self):
        if not self.created_at:
            self.created_at = _now()
        if not self.updated_at:
            self.updated_at = self.created_at
    def to_dict(self) -> Dict[str, Any]:
        return {"block_id": self.block_id, "block_type": self.block_type,
                "content": self.content, "props": self.props,
                "children": [c.to_dict() for c in self.children],
                "parent_id": self.parent_id, "order": self.order,
                "created_by": self.created_by, "created_at": self.created_at,
                "updated_at": self.updated_at}
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> Block:
        return Block(block_id=data["block_id"], block_type=data["block_type"],
                     content=data.get("content", ""), props=data.get("props", {}),
                     children=[Block.from_dict(c) for c in data.get("children", [])],
                     parent_id=data.get("parent_id"), order=data.get("order", 0),
                     created_by=data.get("created_by", "system"),
                     created_at=data.get("created_at", ""), updated_at=data.get("updated_at", ""))
    def clone(self) -> Block:
        d = self.to_dict(); d["block_id"] = _new_id(); return Block.from_dict(d)
    def word_count(self) -> int:
        return len(self.content.split()) if self.content else 0
    def total_word_count(self) -> int:
        return self.word_count() + sum(c.total_word_count() for c in self.children)

# ── BlockTree ──

class BlockTree:
    """Tree of blocks representing one handbook document."""
    def __init__(self, handbook_id: str):
        self.handbook_id = handbook_id
        self._blocks: Dict[str, Block] = {}
        self._root_ids: List[str] = []

    def _index(self, block: Block) -> None:
        self._blocks[block.block_id] = block
        for child in block.children:
            child.parent_id = block.block_id; self._index(child)

    def _unindex(self, block_id: str) -> None:
        block = self._blocks.get(block_id)
        if not block: return
        for child in block.children: self._unindex(child.block_id)
        self._blocks.pop(block_id, None)

    def _reorder_siblings(self, parent_id: Optional[str]) -> None:
        for i, blk in enumerate(self.get_children(parent_id)):
            blk.order = i; blk.updated_at = _now()

    def _is_descendant(self, candidate: str, ancestor: str) -> bool:
        blk = self._blocks.get(candidate)
        if not blk: return False
        cur = blk.parent_id
        while cur:
            if cur == ancestor: return True
            cur = self._blocks.get(cur, Block(block_id="")).parent_id
        return False

    def add_block(self, parent_id: Optional[str], block_type: str, content: str = "",
                  props: Optional[Dict[str, Any]] = None, created_by: str = "system") -> Block:
        if block_type not in BlockType.ALL:
            raise ValueError(f"Unsupported block_type: {block_type}")
        block = Block(block_id=_new_id(), block_type=block_type, content=content,
                      props=props or {}, parent_id=parent_id,
                      order=len(self._root_ids) if parent_id is None else 0, created_by=created_by)
        if parent_id is None:
            block.order = len(self._root_ids)
            self._root_ids.append(block.block_id); self._blocks[block.block_id] = block
        else:
            parent = self._blocks.get(parent_id)
            if not parent: raise KeyError(f"Parent {parent_id} not found")
            block.order = len(parent.children); parent.children.append(block); self._index(block)
        return block

    def update_block(self, block_id: str, content: Optional[str] = None,
                     props: Optional[Dict[str, Any]] = None) -> Block:
        block = self._blocks.get(block_id)
        if not block: raise KeyError(f"Block {block_id} not found")
        if content is not None: block.content = content
        if props is not None: block.props = props
        block.updated_at = _now(); return block

    def move_block(self, block_id: str, new_parent_id: Optional[str], new_order: int = 0) -> Block:
        block = self._blocks.get(block_id)
        if not block: raise KeyError(f"Block {block_id} not found")
        if new_parent_id and self._is_descendant(new_parent_id, block_id):
            raise ValueError("Cannot move block into its own descendant")
        if block.parent_id is None:
            self._root_ids.remove(block_id)
        else:
            p = self._blocks[block.parent_id]
            p.children = [c for c in p.children if c.block_id != block_id]
        block.parent_id = new_parent_id; block.order = new_order
        if new_parent_id is None:
            self._root_ids.insert(min(new_order, len(self._root_ids)), block_id)
        else:
            np = self._blocks[new_parent_id]
            np.children.insert(min(new_order, len(np.children)), block)
        self._reorder_siblings(block.parent_id); block.updated_at = _now(); return block

    def delete_block(self, block_id: str) -> bool:
        if block_id not in self._blocks: return False
        block = self._blocks[block_id]
        if block.parent_id is None:
            self._root_ids = [r for r in self._root_ids if r != block_id]
        else:
            p = self._blocks[block.parent_id]
            p.children = [c for c in p.children if c.block_id != block_id]
        old_parent = block.parent_id; self._unindex(block_id)
        self._reorder_siblings(old_parent); return True

    def get_block(self, block_id: str) -> Optional[Block]: return self._blocks.get(block_id)

    def get_children(self, parent_id: Optional[str]) -> List[Block]:
        if parent_id is None: return [self._blocks[bid] for bid in self._root_ids if bid in self._blocks]
        parent = self._blocks.get(parent_id); return sorted(parent.children, key=lambda b: b.order) if parent else []

    def get_ancestors(self, block_id: str) -> List[Block]:
        ancestors: List[Block] = []
        cur = self._blocks.get(block_id)
        while cur and cur.parent_id:
            p = self._blocks.get(cur.parent_id)
            if p: ancestors.insert(0, p); cur = p
            else: break
        return ancestors

    def get_all_block_ids(self) -> List[str]: return list(self._blocks.keys())

    def validate(self) -> List[str]:
        errors: List[str] = []
        for bid, blk in self._blocks.items():
            if blk.parent_id and blk.parent_id not in self._blocks:
                errors.append(f"Orphan: {bid} -> {blk.parent_id}")
            for ch in blk.children:
                if ch.parent_id != bid: errors.append(f"Parent mismatch: {ch.block_id}")
        for rid in self._root_ids:
            if rid not in self._blocks: errors.append(f"Missing root: {rid}")
        return errors

    # ── JSON ──

    def to_json(self) -> str:
        return json.dumps({"handbook_id": self.handbook_id, "root_ids": self._root_ids,
                           "blocks": {bid: b.to_dict() for bid, b in self._blocks.items()}}, indent=2)

    @staticmethod
    def from_json(json_str: str) -> BlockTree:
        data = json.loads(json_str)
        tree = BlockTree(data["handbook_id"])
        raw = data.get("blocks", {})
        block_map = {}
        for bid, bdict in raw.items():
            bc = dict(bdict); bc["children"] = []; block_map[bid] = Block.from_dict(bc)
        for bid, blk in block_map.items():
            for cd in raw.get(bid, {}).get("children", []):
                cid = cd["block_id"]
                if cid in block_map: child = block_map[cid]; child.parent_id = bid; blk.children.append(child)
            blk.children.sort(key=lambda c: c.order)
        tree._blocks = block_map
        tree._root_ids = [r for r in data.get("root_ids", []) if r in block_map]
        return tree

    # ── HTML ──

    def to_html(self) -> str:
        return "\n".join(['<div class="handbook-content">']
                         + [self._render_html(self._blocks[rid]) for rid in self._root_ids]
                         + ["</div>"])

    def _render_html(self, block: Block) -> str:
        t = block.block_type; c = html_lib.escape(block.content); p = block.props; cls = p.get("css_classes", "")
        if t == BlockType.HEADING:
            lvl = min(max(p.get("level", 1), 1), 4); out = f'<h{lvl} class="hb-heading {cls}">{c}</h{lvl}>'
        elif t == BlockType.PARAGRAPH: out = f'<p class="hb-paragraph {cls}">{c}</p>'
        elif t == BlockType.BULLET_LIST: out = f'<li class="hb-bullet {cls}">{c}</li>'
        elif t == BlockType.NUMBERED_LIST: out = f'<li class="hb-numbered {cls}">{c}</li>'
        elif t == BlockType.EVIDENCE:
            badge = p.get("evidence_level", "B"); cite = html_lib.escape(p.get("citation", ""))
            url = html_lib.escape(p.get("url", "#"))
            out = (f'<div class="hb-evidence {cls}"><span class="badge-{badge}">{badge}</span>'
                   f'<span class="evidence-text">{c}</span><a href="{url}">{cite}</a></div>')
        elif t == BlockType.QUOTE: out = f'<blockquote class="hb-quote {cls}">{c}</blockquote>'
        elif t == BlockType.DIVIDER: out = '<hr class="hb-divider" />'
        elif t == BlockType.TABLE: out = self._html_table(block)
        elif t == BlockType.CHECKLIST:
            chk = "checked" if p.get("checked", False) else ""
            out = f'<label class="hb-checklist {cls}"><input type="checkbox" {chk} disabled />{c}</label>'
        elif t == BlockType.WARNING:
            icon = p.get("icon", "⚠")
            out = f'<div class="hb-warning {cls}"><div class="warn-icon">{icon}</div><div class="warn-text">{c}</div></div>'
        elif t == BlockType.CODE:
            lang = p.get("language", "")
            out = f'<pre class="hb-code {cls}"><code class="language-{lang}">{c}</code></pre>'
        elif t == BlockType.IMAGE:
            src = html_lib.escape(p.get("src", "")); alt = html_lib.escape(p.get("alt", block.content))
            out = f'<img class="hb-image {cls}" src="{src}" alt="{alt}" />'
        else: out = f'<div>{c}</div>'
        if block.children:
            ch = "\n".join(self._render_html(ch) for ch in block.children)
            if t in (BlockType.BULLET_LIST,): out = f'<ul>\n{out}\n{ch}\n</ul>'
            elif t == BlockType.NUMBERED_LIST: out = f'<ol>\n{out}\n{ch}\n</ol>'
            else: out += f"\n<div class=\"children\">\n{ch}\n</div>"
        return out

    def _html_table(self, block: Block) -> str:
        rows: List[List[str]] = block.props.get("rows", [])
        if not rows: return '<table class="hb-table"><tr><td></td></tr></table>'
        parts = ['<table class="hb-table">']; use_header = block.props.get("header", True)
        for i, row in enumerate(rows):
            tag = "th" if (i == 0 and use_header) else "td"
            cells = "".join(f"<{tag}>{html_lib.escape(str(c))}</{tag}>" for c in row)
            parts.append(f"<tr>{cells}</tr>")
        parts.append("</table>"); return "\n".join(parts)

    # ── Markdown ──

    def to_markdown(self) -> str:
        return "\n\n".join(self._render_md(self._blocks[rid], 0) for rid in self._root_ids)

    def _render_md(self, block: Block, depth: int) -> str:
        t = block.block_type; text = block.content; p = block.props
        if t == BlockType.HEADING:
            h = "#" * min(max(p.get("level", 1), 1), 4); md = f"{h} {text}"
        elif t == BlockType.PARAGRAPH: md = text
        elif t == BlockType.BULLET_LIST: md = f"{'  ' * depth}- {text}"
        elif t == BlockType.NUMBERED_LIST: md = f"{'  ' * depth}1. {text}"
        elif t == BlockType.EVIDENCE:
            b = p.get("evidence_level", "B"); cite = p.get("citation", "")
            md = f"> **Evidence Level {b}**: {text}  \n> *{cite}*"
        elif t == BlockType.QUOTE: md = "\n".join(f"> {ln}" for ln in text.split("\n"))
        elif t == BlockType.DIVIDER: md = "---"
        elif t == BlockType.TABLE: md = self._md_table(block)
        elif t == BlockType.CHECKLIST:
            x = "x" if p.get("checked", False) else " "; md = f"- [{x}] {text}"
        elif t == BlockType.WARNING: md = f"> **⚠ WARNING**: {text}"
        elif t == BlockType.CODE: md = f"```{p.get('language', '')}\n{text}\n```"
        elif t == BlockType.IMAGE: md = f"![{p.get('alt', text)}]({p.get('src', '')})"
        else: md = text
        if block.children:
            md += "\n" + "\n".join(self._render_md(c, depth + 1) for c in block.children)
        return md

    def _md_table(self, block: Block) -> str:
        rows: List[List[str]] = block.props.get("rows", [])
        if not rows: return ""
        lines = []
        for i, row in enumerate(rows):
            lines.append("| " + " | ".join(str(c) for c in row) + " |")
            if i == 0: lines.append("| " + " | ".join(["---"] * len(row)) + " |")
        return "\n".join(lines)

    # ── HandbookSection <-> BlockTree ──

    def from_sections(self, sections: List[HandbookSection]) -> BlockTree:
        self._blocks.clear(); self._root_ids.clear()
        heading_map: Dict[str, str] = {}
        for sec in sorted(sections, key=lambda s: s.order_index):
            pid = heading_map.get(sec.parent_section_id) if sec.parent_section_id else None
            h = self.add_block(pid, BlockType.HEADING, sec.title, {"level": sec.level})
            heading_map[sec.section_id] = h.block_id
            for cb in sec.content_blocks:
                self.add_block(h.block_id, cb.get("block_type", BlockType.PARAGRAPH),
                               cb.get("content", ""), cb.get("props", {}))
        return self

    def to_sections(self) -> List[HandbookSection]:
        sections: List[HandbookSection] = []; idx = 0
        def walk(blocks: List[Block], parent_id: Optional[str]):
            nonlocal idx
            for blk in blocks:
                if blk.block_type == BlockType.HEADING:
                    cbs = [{"block_type": c.block_type, "content": c.content, "props": c.props} for c in blk.children]
                    sec = HandbookSection(section_id=_new_id(), title=blk.content,
                                          level=blk.props.get("level", 1), content_blocks=cbs,
                                          order_index=idx, parent_section_id=parent_id)
                    idx += 1; sections.append(sec)
                    nested = [c for c in blk.children if c.block_type == BlockType.HEADING]
                    if nested: walk(nested, sec.section_id)
                else:
                    sections.append(HandbookSection(
                        section_id=_new_id(), title="Untitled", level=1,
                        content_blocks=[{"block_type": blk.block_type, "content": blk.content, "props": blk.props}],
                        order_index=idx, parent_section_id=parent_id))
                    idx += 1
        walk(self.get_children(None), None); return sections

    def __len__(self) -> int: return len(self._blocks)
    def __repr__(self) -> str: return f"BlockTree({self.handbook_id}, blocks={len(self)})"

# ── Helpers ──

def _new_id() -> str: return uuid.uuid4().hex[:12]
def _now() -> str: return datetime.now(timezone.utc).isoformat()

# ── Demo data ──

def build_demo_tree() -> BlockTree:
    tree = BlockTree(handbook_id="demo-hb-001")
    h1 = tree.add_block(None, BlockType.HEADING, "Acute Stroke Management Protocol", {"level": 1})
    tree.add_block(h1.block_id, BlockType.PARAGRAPH, "Evidence-based management of acute ischemic stroke.")
    h2 = tree.add_block(None, BlockType.HEADING, "1. Emergency Triage", {"level": 2})
    tree.add_block(h2.block_id, BlockType.PARAGRAPH, "Patients with sudden-onset deficits: evaluate within 10 min.")
    tree.add_block(h2.block_id, BlockType.EVIDENCE, "Door-to-needle <60 min improves outcomes.",
                   {"evidence_level": "A", "citation": "Jauch et al., Stroke 2013",
                    "url": "https://doi.org/10.1161/STR.0b013e318284056a"})
    tree.add_block(h2.block_id, BlockType.CHECKLIST, "Assess ABCs and vitals", {"checked": True})
    tree.add_block(h2.block_id, BlockType.CHECKLIST, "IV access (2 large-bore)", {"checked": False})
    tree.add_block(h2.block_id, BlockType.WARNING, "Do NOT delay CT for labs. CT within 25 min.")
    h3 = tree.add_block(None, BlockType.HEADING, "2. Imaging Workup", {"level": 2})
    tree.add_block(h3.block_id, BlockType.PARAGRAPH, "Non-contrast head CT is first-line.")
    tree.add_block(h3.block_id, BlockType.TABLE, "",
                   {"header": True, "rows": [
                       ["Finding", "Interpretation", "Action"],
                       ["No bleed", "Candidate tPA", "tPA screening"],
                       ["ICH", "tPA contraindicated", "Neurosurgery"],
                       ["Hyperdense MCA", "LVO", "Consider EVT"]]})
    h4 = tree.add_block(None, BlockType.HEADING, "3. Thrombolytic Therapy", {"level": 2})
    tree.add_block(h4.block_id, BlockType.PARAGRAPH, "Alteplase 0.9 mg/kg IV (max 90 mg).")
    tree.add_block(h4.block_id, BlockType.EVIDENCE, "NNT=8 for mRS 0-1 at 90d.",
                   {"evidence_level": "A", "citation": "NINDS tPA Trial, NEJM 1995",
                    "url": "https://doi.org/10.1056/NEJM199512143332401"})
    tree.add_block(h4.block_id, BlockType.DIVIDER)
    tree.add_block(h4.block_id, BlockType.QUOTE, "Does not replace clinical judgment.")
    return tree

if __name__ == "__main__":
    tree = build_demo_tree()
    print(f"Tree: {tree} | Blocks: {len(tree)}")
    print(f"Validation: {tree.validate()}")
    print(f"\n--- Markdown ---\n{tree.to_markdown()[:500]}...")
    print(f"\nRound-trip: {len(BlockTree.from_json(tree.to_json())) == len(tree)}")
