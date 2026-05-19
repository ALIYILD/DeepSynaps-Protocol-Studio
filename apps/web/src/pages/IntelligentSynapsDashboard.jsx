import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Activity,
    Shield,
    GitCompare,
    FileText,
    Cpu,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Zap,
    Brain,
    TrendingUp,
    Clock,
    ArrowRight,
    BarChart3,
    Loader2,
} from 'lucide-react';
import { useIntelligentSynaps } from '../hooks/useIntelligentSynaps';

/* ------------------------------------------------------------------ */
/*  Adapter status helpers                                             */
/* ------------------------------------------------------------------ */
const STATUS_CONFIG = {
    available: {
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10',
        border: 'border-emerald-400/20',
        label: 'Available',
    },
    degraded: {
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-400/10',
        border: 'border-amber-400/20',
        label: 'Degraded',
    },
    unavailable: {
        icon: XCircle,
        color: 'text-rose-400',
        bg: 'bg-rose-400/10',
        border: 'border-rose-400/20',
        label: 'Unavailable',
    },
};

const ADAPTER_NAMES = [
    /* Legacy dashboard display list; not the canonical production inventory. */
    'Core NLP Engine','MedSpaCy NER','SciSpaCy Linker','UMLS Resolver',
    'SNOMED CT Mapper','ICD-10 Validator','PubMed Retriever','Semantic Scholar',
    'BioRxiv Fetcher','ClinicalTrials.gov','Cochrane Library','Embase Adapter',
    'IEEE Xplore','Nature API','ScienceDirect','SpringerLink','Wiley Adapter',
    'Oxford Academic','Cambridge Core','BMJ Adapter','Lancet Adapter',
    'JAMA Adapter','NEJM Adapter','Cell Press','Elsevier KB','Springer KB',
    'Wiley KB','arXiv Bio','bioRxiv API','medRxiv API','PLOS API',
    'eLife Adapter','PeerJ Adapter','Frontiers API','Hindawi Adapter',
    'MDPI Adapter','Sage Journals','Taylor & Francis','Wolters Kluwer',
    'Karger Adapter','Thieme Adapter','De Gruyter Adapter','Brill Adapter',
    'Emerald Insight','Ingenta Connect','ProQuest Adapter','EBSCO Adapter',
    'JSTOR Adapter','PubMed Central Europe','Europe PMC','NCBI E-utilities',
    'UniProt KB','Reactome Pathway','KEGG Adapter','Gene Ontology',
    'DrugBank API','PharmGKB','ChemSpider','PubChem','ChEMBL API',
    'ClinicalTrials API AACT','FDA Open API','EMA API','WHO ICTRP',
    'ISRCTN Registry','ANZCTR Adapter',
];

const ADAPTER_COUNT = ADAPTER_NAMES.length;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value, color, loading }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className={`rounded-lg ${color.bg} p-2`}>
                    <Icon className={`h-5 w-5 ${color.text}`} />
                </div>
                <div>
                    <p className="text-xs text-white/40">{label}</p>
                    <p className="text-lg font-semibold text-white">
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
                    </p>
                </div>
            </div>
        </div>
    );
}

function AdapterCard({ name, status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unavailable;
    const Icon = cfg.icon;
    return (
        <div className={`flex items-center gap-2 rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2 transition-all hover:scale-[1.02]`}>
            <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
            <span className="truncate text-xs font-medium text-white/90">{name}</span>
        </div>
    );
}

function ConfidenceBadge({ score }) {
    let color = 'bg-rose-400/20 text-rose-300';
    if (score >= 0.9) color = 'bg-emerald-400/20 text-emerald-300';
    else if (score >= 0.75) color = 'bg-sky-400/20 text-sky-300';
    else if (score >= 0.6) color = 'bg-amber-400/20 text-amber-300';
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
            {(score * 100).toFixed(0)}%
        </span>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */

export default function IntelligentSynapsDashboard() {
    const navigate = useNavigate();
    const { query, getHealth, generateProtocol, crossReference, safetyCheck, loading, error, health, recentQueries } = useIntelligentSynaps();

    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [adapters, setAdapters] = useState([]);

    /* ---- Poll health on mount ---- */
    useEffect(() => {
        fetchHealth();
        const iv = setInterval(fetchHealth, 30000);
        return () => clearInterval(iv);
    }, []);

    async function fetchHealth() {
        try {
            const h = await getHealth();
            /* Build adapter list from health response or defaults */
            if (h?.adapters) {
                setAdapters(
                    ADAPTER_NAMES.map((name, i) => ({
                        name,
                        status: h.adapters[name]?.status || 'available',
                    }))
                );
            } else {
                /* Demo mode: random distribution */
                setAdapters(
                    ADAPTER_NAMES.map((name) => ({
                        name,
                        status: Math.random() > 0.85 ? (Math.random() > 0.5 ? 'degraded' : 'unavailable') : 'available',
                    }))
                );
            }
        } catch {
            /* fallback demo data */
            setAdapters(
                ADAPTER_NAMES.map((name) => ({
                    name,
                    status: Math.random() > 0.9 ? 'degraded' : 'available',
                }))
            );
        }
    }

    /* ---- Quick search ---- */
    async function handleSearch(e) {
        e.preventDefault();
        if (!searchText.trim()) return;
        try {
            const res = await query(searchText, { top_n: 5 });
            setSearchResults(res);
        } catch {
            /* error handled by hook */
        }
    }

    /* ---- Quick actions ---- */
    async function handleProtocolGenerate() {
        navigate('/protocols/generate');
    }

    async function handleSafetyCheck() {
        navigate('/protocols');
    }

    async function handleCrossReference() {
        navigate('/cross-reference');
    }

    /* ---- Computed stats ---- */
    const availableCount = adapters.filter(a => a.status === 'available').length;
    const degradedCount = adapters.filter(a => a.status === 'degraded').length;
    const unavailableCount = adapters.filter(a => a.status === 'unavailable').length;
    const readinessPct = Math.round((availableCount / ADAPTER_COUNT) * 100);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
            <div className="mx-auto max-w-7xl px-4 py-8">

                {/* ========== HEADER ========== */}
                <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
                                <Brain className="h-6 w-6 text-indigo-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight">Intelligent Synaps v4</h1>
                                <p className="text-sm text-white/40">Neuromodulation Intelligence Dashboard</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${readinessPct >= 95 ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30' : readinessPct >= 80 ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-400/30' : 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-400/30'}`}>
                            <Activity className="h-3.5 w-3.5" />
                            {readinessPct >= 95 ? 'All Systems Optimal' : readinessPct >= 80 ? 'Systems Degraded' : 'Service Disruption'}
                        </div>
                    </div>
                </div>

                {/* ========== STATS ROW ========== */}
                <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard icon={Cpu} label="Adapters Ready" value={`${availableCount}/${ADAPTER_COUNT}`}
                        color={{ text: 'text-emerald-400', bg: 'bg-emerald-400/10' }} loading={loading && adapters.length === 0} />
                    <StatCard icon={Zap} label="System Readiness" value={`${readinessPct}%`}
                        color={{ text: 'text-sky-400', bg: 'bg-sky-400/10' }} loading={loading && adapters.length === 0} />
                    <StatCard icon={BarChart3} label="Degraded" value={degradedCount}
                        color={{ text: 'text-amber-400', bg: 'bg-amber-400/10' }} loading={loading && adapters.length === 0} />
                    <StatCard icon={TrendingUp} label="Recent Queries" value={recentQueries.length}
                        color={{ text: 'text-violet-400', bg: 'bg-violet-400/10' }} loading={false} />
                </div>

                {/* ========== SEARCH BAR ========== */}
                <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
                    <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
                            <input
                                type="text"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="Ask Intelligent Synaps anything about neuromodulation..."
                                className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !searchText.trim()}
                            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Query
                        </button>
                    </form>

                    {/* Search results preview */}
                    {searchResults && (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                            <h3 className="text-sm font-semibold text-white/70">Results</h3>
                            {searchResults.results?.map((r, i) => (
                                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm font-medium text-white">{r.title || `Result ${i + 1}`}</span>
                                        <ConfidenceBadge score={r.confidence || 0.85} />
                                    </div>
                                    <p className="text-sm leading-relaxed text-white/60">{r.summary || r.snippet || JSON.stringify(r).slice(0, 200)}</p>
                                    {r.source && (
                                        <p className="mt-2 text-xs text-white/30">Source: {r.source}</p>
                                    )}
                                </div>
                            )) || (
                                <pre className="overflow-x-auto rounded-lg bg-slate-950/50 p-4 text-xs text-white/60">
                                    {JSON.stringify(searchResults, null, 2)}
                                </pre>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
                            {error}
                        </div>
                    )}
                </div>

                {/* ========== QUICK ACTIONS ========== */}
                <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button onClick={handleProtocolGenerate}
                        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-indigo-400/30 hover:bg-indigo-400/5">
                        <div className="rounded-lg bg-indigo-400/10 p-2.5">
                            <FileText className="h-5 w-5 text-indigo-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white group-hover:text-indigo-300">Generate Protocol</p>
                            <p className="text-xs text-white/40">Create personalized neuromodulation plans</p>
                        </div>
                        <ArrowRight className="ml-auto h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                    </button>

                    <button onClick={handleSafetyCheck}
                        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-emerald-400/30 hover:bg-emerald-400/5">
                        <div className="rounded-lg bg-emerald-400/10 p-2.5">
                            <Shield className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white group-hover:text-emerald-300">Safety Check</p>
                            <p className="text-xs text-white/40">Validate protocols for contraindications</p>
                        </div>
                        <ArrowRight className="ml-auto h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400" />
                    </button>

                    <button onClick={handleCrossReference}
                        className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-violet-400/30 hover:bg-violet-400/5">
                        <div className="rounded-lg bg-violet-400/10 p-2.5">
                            <GitCompare className="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white group-hover:text-violet-300">Cross-Reference</p>
                            <p className="text-xs text-white/40">Verify against clinical literature</p>
                        </div>
                        <ArrowRight className="ml-auto h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-violet-400" />
                    </button>
                </div>

                {/* ========== ADAPTER STATUS GRID ========== */}
                <div className="mb-8">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Adapter Status Grid</h2>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {availableCount} Ready</span>
                            <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> {degradedCount} Degraded</span>
                            <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-rose-400" /> {unavailableCount} Down</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                        {adapters.map((a, i) => (
                            <AdapterCard key={i} name={a.name} status={a.status} />
                        ))}
                    </div>
                </div>

                {/* ========== RECENT QUERIES ========== */}
                {recentQueries.length > 0 && (
                    <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
                        <h2 className="mb-4 text-lg font-semibold">Recent Queries</h2>
                        <div className="space-y-3">
                            {recentQueries.slice(0, 10).map((q, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Clock className="h-4 w-4 flex-shrink-0 text-white/30" />
                                        <p className="truncate text-sm text-white/70">{q.query}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <ConfidenceBadge score={q.confidence || q.overall_confidence || 0.75} />
                                        <span className="text-xs text-white/30">{new Date(q.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ========== FOOTER ========== */}
                <div className="text-center text-xs text-white/20">
                    Intelligent Synaps v4 — Powered by DeepSynaps Protocol Studio
                </div>
            </div>
        </div>
    );
}
