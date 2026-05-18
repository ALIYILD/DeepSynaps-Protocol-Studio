import React, { useState, useCallback, useRef } from 'react';
import {
    Search,
    Loader2,
    Sparkles,
    BookOpen,
    ChevronRight,
    Filter,
    X,
    BarChart3,
    Link2,
    ShieldCheck,
    BrainCircuit,
    Stethoscope,
    Zap,
    Microscope,
    Award,
} from 'lucide-react';
import { useIntelligentSynaps } from '../hooks/useIntelligentSynaps';

/* ------------------------------------------------------------------ */
/*  Evidence strength helpers                                          */
/* ------------------------------------------------------------------ */
const EVIDENCE_LEVELS = {
    1: { label: 'Systematic Review', color: 'text-violet-300 bg-violet-400/15 ring-violet-400/30', icon: Award },
    2: { label: 'RCT', color: 'text-emerald-300 bg-emerald-400/15 ring-emerald-400/30', icon: ShieldCheck },
    3: { label: 'Cohort Study', color: 'text-sky-300 bg-sky-400/15 ring-sky-400/30', icon: BarChart3 },
    4: { label: 'Case Series', color: 'text-amber-300 bg-amber-400/15 ring-amber-400/30', icon: Stethoscope },
    5: { label: 'Expert Opinion', color: 'text-white/50 bg-white/5 ring-white/10', icon: BrainCircuit },
};

function EvidenceBadge({ level }) {
    const cfg = EVIDENCE_LEVELS[level] || EVIDENCE_LEVELS[5];
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.color}`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
        </span>
    );
}

function ConfidenceBadge({ score }) {
    let cfg = { color: 'text-rose-300 bg-rose-400/15 ring-rose-400/30', label: 'Low' };
    if (score >= 0.9) cfg = { color: 'text-emerald-300 bg-emerald-400/15 ring-emerald-400/30', label: 'Very High' };
    else if (score >= 0.8) cfg = { color: 'text-sky-300 bg-sky-400/15 ring-sky-400/30', label: 'High' };
    else if (score >= 0.7) cfg = { color: 'text-indigo-300 bg-indigo-400/15 ring-indigo-400/30', label: 'Good' };
    else if (score >= 0.6) cfg = { color: 'text-amber-300 bg-amber-400/15 ring-amber-400/30', label: 'Moderate' };

    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.color}`}>
            {(score * 100).toFixed(0)}% — {cfg.label}
        </span>
    );
}

function CrossRefBadge({ count }) {
    if (!count || count === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-400/10 px-2 py-0.5 text-xs font-medium text-teal-300 ring-1 ring-teal-400/30">
            <Link2 className="h-3 w-3" />
            {count} citation{count > 1 ? 's' : ''}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/*  Search Result Card                                                 */
/* ------------------------------------------------------------------ */

function ResultCard({ result, index, expanded, onToggle }) {
    const confidence = result.confidence ?? result._score ?? 0.75;
    const evidenceLevel = result.evidence_level ?? result.evidenceLevel ?? 3;
    const citations = result.citations ?? result.source_citations ?? [];
    const hasCrossRef = (result.cross_references?.length || result.crossReferences?.length) > 0;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-all hover:border-white/15 hover:bg-white/[0.05]">
            {/* Header */}
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-xs font-bold text-indigo-400 ring-1 ring-indigo-400/30">
                        {index + 1}
                    </span>
                    <h3 className="text-base font-semibold text-white">
                        {result.title || result.name || 'Untitled Result'}
                    </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ConfidenceBadge score={confidence} />
                    <EvidenceBadge level={evidenceLevel} />
                    {citations.length > 0 && <CrossRefBadge count={citations.length} />}
                </div>
            </div>

            {/* Summary */}
            <p className="mb-3 text-sm leading-relaxed text-white/60">
                {result.summary || result.abstract || result.snippet || result.description || 'No summary available.'}
            </p>

            {/* Source & Meta */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/30">
                {result.source && (
                    <span className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5">
                        <BookOpen className="h-3 w-3" />
                        {result.source}
                    </span>
                )}
                {result.doi && (
                    <span className="rounded bg-white/5 px-2 py-0.5">DOI: {result.doi}</span>
                )}
                {result.pubmed_id && (
                    <span className="rounded bg-white/5 px-2 py-0.5">PMID: {result.pubmed_id}</span>
                )}
                {result.year && (
                    <span className="rounded bg-white/5 px-2 py-0.5">{result.year}</span>
                )}
                {result.authors && (
                    <span className="rounded bg-white/5 px-2 py-0.5">{result.authors}</span>
                )}
                {result.modality && (
                    <span className="flex items-center gap-1 rounded bg-indigo-400/10 px-2 py-0.5 text-indigo-300">
                        <Zap className="h-3 w-3" />
                        {result.modality}
                    </span>
                )}
                {result.indication && (
                    <span className="flex items-center gap-1 rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                        <Stethoscope className="h-3 w-3" />
                        {result.indication}
                    </span>
                )}
            </div>

            {/* Citations */}
            {citations.length > 0 && (
                <div className="mb-3 border-t border-white/5 pt-3">
                    <button onClick={onToggle} className="mb-2 flex items-center gap-1 text-xs font-medium text-white/50 transition-colors hover:text-white/80">
                        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        Source Citations ({citations.length})
                    </button>
                    {expanded && (
                        <ul className="space-y-1.5">
                            {citations.map((c, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-white/40">
                                    <Link2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-white/20" />
                                    <span>
                                        {typeof c === 'string' ? c : `${c.authors} (${c.year}). ${c.title}. ${c.journal}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Cross-reference highlights */}
            {hasCrossRef && (
                <div className="border-t border-white/5 pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-teal-400">
                        <Microscope className="h-3.5 w-3.5" />
                        Cross-reference matches
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(result.cross_references || result.crossReferences || []).map((cr, i) => (
                            <span key={i} className="rounded-full bg-teal-400/10 px-2.5 py-1 text-xs text-teal-300 ring-1 ring-teal-400/30">
                                {typeof cr === 'string' ? cr : cr.label || cr.title || `Match ${i + 1}`}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Suggested queries                                                  */
/* ------------------------------------------------------------------ */

const SUGGESTED_QUERIES = [
    "tDCS for depression: optimal electrode placement and current intensity",
    "Safety profile of combining TMS and tDCS in treatment-resistant depression",
    "PBM for cognitive enhancement: evidence from sham-controlled trials",
    "Comparison of 10 Hz vs 20 Hz rTMS protocols for MDD",
    "Neurofeedback for ADHD: long-term efficacy follow-up studies",
];

/* ------------------------------------------------------------------ */
/*  Main Search Page                                                   */
/* ------------------------------------------------------------------ */

export default function IntelligentSearch() {
    const { search, loading, error, clearError } = useIntelligentSynaps();
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState([]);
    const [resultMeta, setResultMeta] = useState(null);
    const [expandedIndex, setExpandedIndex] = useState(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({
        modalities: [],
        evidenceLevels: [],
        minConfidence: 0.6,
        yearRange: null,
    });
    const inputRef = useRef(null);

    const toggleExpand = useCallback((i) => {
        setExpandedIndex(prev => prev === i ? null : i);
    }, []);

    const handleSearch = useCallback(async () => {
        if (!queryText.trim()) return;
        clearError();
        setExpandedIndex(null);
        try {
            const res = await search(queryText, {
                modalities: activeFilters.modalities.length > 0 ? activeFilters.modalities : undefined,
                evidence_levels: activeFilters.evidenceLevels.length > 0 ? activeFilters.evidenceLevels : undefined,
                min_confidence: activeFilters.minConfidence,
            });
            const list = res.results ?? res.data ?? (Array.isArray(res) ? res : [res]);
            setResults(list);
            setResultMeta({
                total: res.total ?? list.length,
                queryTime: res.query_time_ms ?? res.latency_ms ?? null,
                queryId: res.query_id ?? null,
            });
        } catch {
            setResults([]);
            setResultMeta(null);
        }
    }, [queryText, activeFilters, search, clearError]);

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSearch();
    };

    const applySuggestion = (q) => {
        setQueryText(q);
        setTimeout(() => handleSearch(), 50);
    };

    const modalities = ["tDCS", "TMS", "PBM", "Neurofeedback", "tACS", "tRNS", "VNS", "DBS"];
    const evidenceLevels = [1, 2, 3, 4, 5];

    const toggleModality = (m) => {
        setActiveFilters(prev => ({
            ...prev,
            modalities: prev.modalities.includes(m)
                ? prev.modalities.filter(x => x !== m)
                : [...prev.modalities, m],
        }));
    };

    const toggleEvidence = (l) => {
        setActiveFilters(prev => ({
            ...prev,
            evidenceLevels: prev.evidenceLevels.includes(l)
                ? prev.evidenceLevels.filter(x => x !== l)
                : [...prev.evidenceLevels, l],
        }));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
            <div className="mx-auto max-w-5xl px-4 py-8">

                {/* ========== HEADER ========== */}
                <div className="mb-8 text-center">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/30">
                        <Sparkles className="h-7 w-7 text-indigo-400" />
                    </div>
                    <h1 className="mb-1 text-3xl font-bold tracking-tight">Intelligent Synaps Search</h1>
                    <p className="text-sm text-white/40">Natural language search across clinical neuromodulation literature</p>
                </div>

                {/* ========== SEARCH ========== */}
                <div className="mb-6">
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-xl shadow-black/20 backdrop-blur-sm transition-all focus-within:border-indigo-400/40 focus-within:ring-1 focus-within:ring-indigo-400/20">
                            <Search className="ml-3 h-5 w-5 text-white/30" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                placeholder="Describe your clinical question in natural language..."
                                className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder-white/30 outline-none"
                            />
                            {queryText && (
                                <button type="button" onClick={() => setQueryText('')} className="mr-2 rounded-full p-1 text-white/30 hover:bg-white/10 hover:text-white/60">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(!filtersOpen)}
                                className={`mr-2 rounded-xl p-2.5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70 ${filtersOpen ? 'bg-white/10 text-white/70' : ''}`}
                            >
                                <Filter className="h-4 w-4" />
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !queryText.trim()}
                                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Search
                            </button>
                        </div>
                    </form>

                    {/* Filters */}
                    {filtersOpen && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Filters</div>
                            <div className="mb-4">
                                <div className="mb-2 text-xs text-white/50">Modality</div>
                                <div className="flex flex-wrap gap-2">
                                    {modalities.map(m => (
                                        <button key={m} onClick={() => toggleModality(m)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all ${activeFilters.modalities.includes(m)
                                                ? 'bg-indigo-500/20 text-indigo-300 ring-indigo-400/40'
                                                : 'bg-white/5 text-white/40 ring-white/10 hover:bg-white/10'}`}>
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="mb-4">
                                <div className="mb-2 text-xs text-white/50">Evidence Level</div>
                                <div className="flex flex-wrap gap-2">
                                    {evidenceLevels.map(l => (
                                        <button key={l} onClick={() => toggleEvidence(l)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all ${activeFilters.evidenceLevels.includes(l)
                                                ? 'bg-violet-500/20 text-violet-300 ring-violet-400/40'
                                                : 'bg-white/5 text-white/40 ring-white/10 hover:bg-white/10'}`}>
                                            Level {l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="mb-2 text-xs text-white/50">Minimum Confidence: {(activeFilters.minConfidence * 100).toFixed(0)}%</div>
                                <input
                                    type="range"
                                    min="50"
                                    max="95"
                                    value={activeFilters.minConfidence * 100}
                                    onChange={(e) => setActiveFilters(prev => ({ ...prev, minConfidence: parseInt(e.target.value) / 100 }))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
                            {error}
                        </div>
                    )}
                </div>

                {/* ========== SUGGESTED ========== */}
                {results.length === 0 && !loading && !error && (
                    <div className="mb-8">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/30">Suggested Queries</div>
                        <div className="space-y-2">
                            {SUGGESTED_QUERIES.map((q, i) => (
                                <button key={i} onClick={() => applySuggestion(q)}
                                    className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left text-sm text-white/50 transition-all hover:border-white/10 hover:bg-white/[0.05] hover:text-white/80">
                                    <Sparkles className="h-4 w-4 text-indigo-400/50" />
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ========== RESULTS ========== */}
                {results.length > 0 && (
                    <div className="space-y-4">
                        {/* Meta bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm text-white/50">
                                <span className="font-semibold text-white/70">{resultMeta?.total ?? results.length}</span> results
                                {resultMeta?.queryTime && (
                                    <span className="ml-2 text-white/30">({resultMeta.queryTime} ms)</span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-white/30">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-400/50" />
                                Powered by Intelligent Synaps v4
                            </div>
                        </div>

                        {results.map((r, i) => (
                            <ResultCard
                                key={r.id || i}
                                result={r}
                                index={i}
                                expanded={expandedIndex === i}
                                onToggle={() => toggleExpand(i)}
                            />
                        ))}
                    </div>
                )}

                {/* ========== LOADING STATE ========== */}
                {loading && results.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-400" />
                        <p className="text-sm text-white/40">Searching across clinical literature...</p>
                    </div>
                )}

                {/* ========== EMPTY STATE ========== */}
                {results.length === 0 && !loading && queryText && !error && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Search className="mb-3 h-10 w-10 text-white/10" />
                        <p className="text-sm text-white/30">No results found. Try refining your query or adjusting filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
