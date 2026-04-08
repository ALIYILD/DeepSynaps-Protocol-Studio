import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

// ── Chart colors (hardcoded — CSS vars cannot be used in SVG fill attributes) ─
const CHART_COLORS = {
  positive: "#0d9488",   // teal
  neutral:  "#d97706",   // amber
  adverse:  "#dc2626",   // red
  tms:      "#0d9488",
  neuro:    "#7c3aed",
  tps:      "#0284c7",
  pbm:      "#ea580c",
  tdcs:     "#6b7280",
} as const;

// ── Mock data ─────────────────────────────────────────────────────────────────

type MonthData = {
  month: string;
  positive: number;
  neutral: number;
  adverse: number;
};

const SESSION_OUTCOME_DATA: MonthData[] = [
  { month: "Nov", positive: 12, neutral: 4, adverse: 1 },
  { month: "Dec", positive: 15, neutral: 5, adverse: 0 },
  { month: "Jan", positive: 18, neutral: 6, adverse: 1 },
  { month: "Feb", positive: 22, neutral: 7, adverse: 2 },
  { month: "Mar", positive: 28, neutral: 8, adverse: 1 },
  { month: "Apr", positive: 31, neutral: 9, adverse: 2 },
];

type ConditionCount = { condition: string; count: number };

const CONDITION_DATA: ConditionCount[] = [
  { condition: "Depression",          count: 6 },
  { condition: "ADHD",                count: 5 },
  { condition: "Parkinson's Disease", count: 4 },
  { condition: "PTSD",                count: 3 },
  { condition: "Anxiety",             count: 3 },
  { condition: "Chronic Pain",        count: 3 },
];

type ModalitySegment = { label: string; pct: number; color: string };

const MODALITY_DATA: ModalitySegment[] = [
  { label: "TMS",            pct: 35, color: CHART_COLORS.tms  },
  { label: "Neurofeedback",  pct: 28, color: CHART_COLORS.neuro },
  { label: "TPS",            pct: 20, color: CHART_COLORS.tps  },
  { label: "PBM",            pct: 12, color: CHART_COLORS.pbm  },
  { label: "tDCS",           pct:  5, color: CHART_COLORS.tdcs },
];

type ActivityItem = {
  id: string;
  icon: string;
  text: string;
  time: string;
  tone: "success" | "info" | "neutral" | "warning";
};

const ACTIVITY_FEED: ActivityItem[] = [
  { id: "a1", icon: "✅", text: "Sarah Mitchell completed session 9/12 · TPS · Positive",                 time: "2h ago",  tone: "success"  },
  { id: "a2", icon: "👤", text: "New patient James Okonkwo added",                                        time: "5h ago",  tone: "info"     },
  { id: "a3", icon: "📋", text: "PHQ-9 assessment completed by Elena Vasquez — Score: 12 (Moderate)",     time: "1d ago",  tone: "warning"  },
  { id: "a4", icon: "⚡", text: "Protocol prescribed: DLPFC TMS for David Thornton",                      time: "1d ago",  tone: "info"     },
  { id: "a5", icon: "💬", text: "Session reminder sent via Telegram to Amira Hassan",                     time: "2d ago",  tone: "neutral"  },
  { id: "a6", icon: "📋", text: "New assessment: GAD-7 sent to Robert Chen",                              time: "2d ago",  tone: "info"     },
  { id: "a7", icon: "⚡", text: "Protocol generated: Neurofeedback Alpha/Theta for James Okonkwo",        time: "3d ago",  tone: "info"     },
  { id: "a8", icon: "✅", text: "Session completed: Amira Hassan — Session 1/8",                          time: "3d ago",  tone: "success"  },
];

type UpcomingSession = {
  id: string;
  patient: string;
  modality: string;
  time: string;
  progress: string;
};

const UPCOMING_SESSIONS: UpcomingSession[] = [
  { id: "s1", patient: "Sarah Mitchell",  modality: "TPS", time: "09:00", progress: "Session 9/12"  },
  { id: "s2", patient: "David Thornton",  modality: "TMS", time: "11:00", progress: "Session 7/15"  },
  { id: "s3", patient: "Elena Vasquez",   modality: "TMS", time: "14:00", progress: "Session 16/20" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiTile({
  value,
  label,
  delta,
  deltaPositive,
}: {
  value: string;
  label: string;
  delta: string;
  deltaPositive: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-2"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <p className="font-display text-3xl font-bold leading-none" style={{ color: "var(--text)" }}>
        {value}
      </p>
      <p className="text-sm text-[var(--text-muted)] leading-tight">{label}</p>
      <Badge tone={deltaPositive ? "success" : "warning"}>{delta}</Badge>
    </div>
  );
}

// SVG grouped bar chart for session outcomes
function SessionOutcomeChart({ data }: { data: MonthData[] }) {
  const maxVal = Math.max(...data.map((d) => d.positive + d.neutral + d.adverse));
  // SVG layout constants
  const SVG_W = 560;
  const SVG_H = 180;
  const CHART_H = 140;
  const CHART_TOP = 10;
  const LEFT_PAD = 10;
  const RIGHT_PAD = 10;
  const CHART_W = SVG_W - LEFT_PAD - RIGHT_PAD;
  const MONTHS = data.length;
  const GROUP_W = CHART_W / MONTHS;
  const BAR_GAP = 2;
  const BAR_W = (GROUP_W - 16) / 3; // 3 bars + padding on each side

  const barHeight = (val: number) =>
    maxVal === 0 ? 0 : (val / maxVal) * CHART_H;

  const keys = ["positive", "neutral", "adverse"] as const;
  const colors: Record<typeof keys[number], string> = {
    positive: CHART_COLORS.positive,
    neutral:  CHART_COLORS.neutral,
    adverse:  CHART_COLORS.adverse,
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        aria-label="Session outcomes bar chart"
        role="img"
      >
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = CHART_TOP + CHART_H - frac * CHART_H;
          return (
            <line
              key={frac}
              x1={LEFT_PAD}
              y1={y}
              x2={SVG_W - RIGHT_PAD}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
          );
        })}

        {/* Bars */}
        {data.map((d, gi) => {
          const groupX = LEFT_PAD + gi * GROUP_W + 8;
          return keys.map((key, ki) => {
            const h = barHeight(d[key]);
            const x = groupX + ki * (BAR_W + BAR_GAP);
            const y = CHART_TOP + CHART_H - h;
            if (h === 0) return null;
            return (
              <rect
                key={`${gi}-${key}`}
                x={x}
                y={y}
                width={BAR_W}
                height={h}
                rx={2}
                fill={colors[key]}
                opacity={0.9}
              >
                <title>{`${d.month} ${key}: ${d[key]}`}</title>
              </rect>
            );
          });
        })}

        {/* X-axis month labels */}
        {data.map((d, gi) => {
          const groupCenterX = LEFT_PAD + gi * GROUP_W + GROUP_W / 2;
          return (
            <text
              key={d.month}
              x={groupCenterX}
              y={SVG_H - 2}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
              fontFamily="inherit"
            >
              {d.month}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-2 flex-wrap">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-sm"
              style={{ width: 12, height: 12, background: colors[k], flexShrink: 0 }}
            />
            <span className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>
              {k}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar chart for condition distribution
function ConditionDistribution({ data }: { data: ConditionCount[] }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.condition}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm" style={{ color: "var(--text)" }}>
              {d.condition}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              {d.count}
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 8, background: "var(--bg)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Stacked pill chart for modality usage
function ModalityPillChart({ data }: { data: ModalitySegment[] }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Stacked pill */}
      <div
        className="flex rounded-full overflow-hidden"
        style={{ height: 24 }}
        role="img"
        aria-label="Modality usage distribution"
      >
        {data.map((seg) => (
          <div
            key={seg.label}
            style={{ width: `${seg.pct}%`, background: seg.color }}
            title={`${seg.label}: ${seg.pct}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {data.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-sm flex-shrink-0"
              style={{ width: 12, height: 12, background: seg.color }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {seg.label}
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              {seg.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity feed timeline
function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const iconBgMap: Record<ActivityItem["tone"], string> = {
    success: "var(--success-bg)",
    info:    "var(--info-bg)",
    warning: "var(--warning-bg)",
    neutral: "var(--bg)",
  };
  const iconBorderMap: Record<ActivityItem["tone"], string> = {
    success: "var(--success-border)",
    info:    "var(--info-border)",
    warning: "var(--warning-border)",
    neutral: "var(--border)",
  };

  return (
    <ol className="relative flex flex-col gap-0">
      {items.map((item, idx) => (
        <li key={item.id} className="flex gap-3 pb-4 relative">
          {/* Vertical connector line */}
          {idx < items.length - 1 && (
            <div
              className="absolute left-4 top-8 w-px"
              style={{
                height: "calc(100% - 8px)",
                background: "var(--border)",
              }}
              aria-hidden="true"
            />
          )}
          {/* Icon bubble */}
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm z-10"
            style={{
              background: iconBgMap[item.tone],
              border: `1px solid ${iconBorderMap[item.tone]}`,
            }}
            aria-hidden="true"
          >
            {item.icon}
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0 pt-1">
            <p className="text-sm leading-snug" style={{ color: "var(--text)" }}>
              {item.text}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              {item.time}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Upcoming sessions strip
function UpcomingSessionsStrip({ sessions }: { sessions: UpcomingSession[] }) {
  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-4 rounded-xl px-4 py-3"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-soft-border)" }}
          >
            {s.time.split(":")[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--text)" }}>
              {s.patient}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {s.progress}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge tone="accent">{s.modality}</Badge>
            <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-subtle)" }}>
              {s.time}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { role } = useAppState();

  // Role gate
  if (role === "guest") {
    return (
      <div className="grid gap-7 max-w-6xl">
        <PageHeader
          icon="📊"
          eyebrow="Analytics"
          title="Practice Analytics"
          description="Insights into sessions, outcomes, and patient trends."
        />
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              🔒
            </div>
            <div>
              <p className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
                Analytics Restricted
              </p>
              <p className="mt-1 text-sm max-w-sm" style={{ color: "var(--text-muted)" }}>
                Analytics are available for clinician and admin roles. Please sign in with an
                appropriate account to access this section.
              </p>
            </div>
            <Badge tone="warning">Guest access — analytics locked</Badge>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-7 max-w-6xl">
      <PageHeader
        icon="📊"
        eyebrow="Analytics"
        title="Practice Analytics"
        description="Session outcomes, patient trends, and modality usage across your practice."
        badge="Live"
      />

      {/* 1. KPI Strip */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          value="24"
          label="Total Patients"
          delta="+3 this month"
          deltaPositive={true}
        />
        <KpiTile
          value="89"
          label="Sessions This Month"
          delta="+12%"
          deltaPositive={true}
        />
        <KpiTile
          value="7.2"
          label="Avg Sessions / Patient"
          delta="↑ from 6.8"
          deltaPositive={true}
        />
        <KpiTile
          value="78%"
          label="Protocol Completion Rate"
          delta="−2% vs last month"
          deltaPositive={false}
        />
      </div>

      {/* 2 + 3: Charts row */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Session Outcomes (takes 2 cols) */}
        <Card className="lg:col-span-2">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
              Session Outcomes — Last 6 Months
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Positive, neutral, and adverse outcomes by month
            </p>
          </div>
          <SessionOutcomeChart data={SESSION_OUTCOME_DATA} />
        </Card>

        {/* Condition Distribution */}
        <Card>
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
              Condition Distribution
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Patients by primary diagnosis (top 6)
            </p>
          </div>
          <ConditionDistribution data={CONDITION_DATA} />
        </Card>
      </div>

      {/* 4. Modality Usage */}
      <Card>
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
            Modality Usage
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Distribution of treatment modalities across all sessions
          </p>
        </div>
        <ModalityPillChart data={MODALITY_DATA} />
      </Card>

      {/* 5 + 6: Feed + Upcoming */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recent Activity Feed */}
        <Card>
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
              Recent Activity
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Latest actions across your practice
            </p>
          </div>
          <ActivityFeed items={ACTIVITY_FEED} />
        </Card>

        {/* Upcoming Sessions */}
        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
                  Today's Sessions
                </h2>
                <Badge tone="info">3 scheduled</Badge>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Upcoming appointments for today
              </p>
            </div>
            <UpcomingSessionsStrip sessions={UPCOMING_SESSIONS} />
          </Card>

          {/* Quick stats summary card */}
          <Card>
            <div className="mb-3">
              <h2 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>
                This Week at a Glance
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Sessions Completed", value: "21", icon: "✅" },
                { label: "New Patients",        value: "2",  icon: "👤" },
                { label: "Assessments Sent",    value: "5",  icon: "📋" },
                { label: "Protocols Issued",    value: "3",  icon: "⚡" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <span className="text-base leading-none">{stat.icon}</span>
                  <div>
                    <p className="font-display text-lg font-bold leading-none" style={{ color: "var(--text)" }}>
                      {stat.value}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
