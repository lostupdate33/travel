"use client";

import { CalendarDays, ChartNoAxesColumnIncreasing, RefreshCw, Trophy, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchLeadStats } from "../lib/api";
import { currency } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "../lib/leadConstants";

const AGENDA_WINDOWS = [
  { id: "today", label: "Today", offset: 0 },
  { id: "tomorrow", label: "Tomorrow", offset: 1 },
  { id: "week", label: "Next 7 days", offset: null }
];

const AGENDA_LIMIT = 5;

export function PipelineDashboard({ onViewLeads }) {
  const [stats, setStats] = useState({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agendaWindow, setAgendaWindow] = useState("today");

  useEffect(() => {
    loadPipeline();
  }, []);

  async function loadPipeline() {
    setIsLoading(true);
    setMessage("");
    try {
      const data = await fetchLeadStats();
      setStats(data.stats || {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const upcoming = stats.upcoming || {};
  const visibleAgenda = useMemo(() => {
    return upcoming[agendaWindow] || { arrivals: { total: 0, items: [] }, departures: { total: 0, items: [] } };
  }, [agendaWindow, upcoming]);

  const arrivals = visibleAgenda.arrivals || { total: 0, items: [] };
  const departures = visibleAgenda.departures || { total: 0, items: [] };
  const byStatus = stats.byStatus || {};
  const funnel = stats.funnel || [];
  const trend = stats.trend || [];
  const leaderboard = stats.leaderboard || [];

  return (
    <div className="pipeline-dashboard">
      <section className="pipeline-hero">
        <div>
          <span>Admin pipeline</span>
          <h2>Lead command center</h2>
          <p>Track ownership, movement, and near-term travel operations from one clean view.</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadPipeline} disabled={isLoading}>
          <RefreshCw size={16} />
          {isLoading ? "Refreshing" : "Refresh"}
        </button>
      </section>

      {message && <p className="status-line">{message}</p>}

      <section className="pipeline-metrics">
        <Metric label="Unassigned" value={stats.unassigned || 0} />
        <Metric label="Active assigned" value={stats.assignedActive || 0} />
        <Metric label="Arriving today" value={stats.arrivingToday || 0} />
        <Metric label="Arriving tomorrow" value={stats.arrivingTomorrow || 0} />
        <Metric label="Ending today" value={stats.endingToday || 0} />
        <Metric label="Pipeline value" value={`INR ${currency(stats.pipelineValue || 0)}`} />
      </section>

      <section className="pipeline-grid">
        <div className="panel">
          <div className="panel-title with-action">
            <div>
              <CalendarDays size={18} />
              <h2>Upcoming Travel</h2>
            </div>
            <div className="segmented-control">
              {AGENDA_WINDOWS.map((item) => (
                <button
                  key={item.id}
                  className={agendaWindow === item.id ? "active" : ""}
                  type="button"
                  onClick={() => setAgendaWindow(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="agenda-columns">
            <AgendaLane
              title="Arrivals"
              movement={arrivals}
              onViewAll={() => onViewLeads?.(leadDateFilters(visibleAgenda, "start"))}
            />
            <AgendaLane
              title="Departures"
              movement={departures}
              onViewAll={() => onViewLeads?.(leadDateFilters(visibleAgenda, "end"))}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <Trophy size={18} />
            <h2>Team Leaderboard</h2>
          </div>
          <Leaderboard items={leaderboard} />
        </div>

        <div className="panel pipeline-funnel-panel">
          <div className="panel-title">
            <UserRoundCheck size={18} />
            <h2>Lead Funnel</h2>
          </div>
          <FunnelChart items={funnel} />
        </div>

        <div className="panel pipeline-trend-panel">
          <div className="panel-title">
            <ChartNoAxesColumnIncreasing size={18} />
            <h2>Weekly Lead Intake</h2>
          </div>
          <WeeklyIntakeChart items={trend} />
        </div>

        <div className="panel pipeline-status-panel">
          <div className="panel-title">
            <ChartNoAxesColumnIncreasing size={18} />
            <h2>Status Breakdown</h2>
          </div>
          <div className="pipeline-status-grid">
            {LEAD_STATUSES.map((status) => (
              <article key={status}>
                <strong>{byStatus[status] || 0}</strong>
                <span>{LEAD_STATUS_LABELS[status]}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Leaderboard({ items }) {
  const maxScore = Math.max(1, ...items.map((item) => Math.max(0, item.score || 0)));
  if (!items.length) return <p className="empty-note">No assigned lead activity in the last 30 days.</p>;

  return (
    <div className="leaderboard-list">
      {items.map((item, index) => (
        <article className="leaderboard-row" key={item.userId}>
          <div className="leaderboard-main">
            <span>#{index + 1}</span>
            <div>
              <strong>{item.name}</strong>
              <small>Score {item.score}</small>
            </div>
          </div>
          <div className="leaderboard-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(6, Math.round((Math.max(0, item.score || 0) / maxScore) * 100))}%` }}></i>
          </div>
          <div className="leaderboard-chips">
            <span>{item.wonLeads} won</span>
            <span>{item.proposalCount} proposals</span>
            <span>{item.conversionRate}% conv.</span>
            <span>{item.activeLeads} active</span>
            <span>INR {currency(item.pipelineValue || 0)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function FunnelChart({ items }) {
  const maxCount = Math.max(1, ...items.map((item) => item.count || 0));
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const won = items.find((item) => item.status === "won")?.count || 0;
  const lost = items.find((item) => item.status === "lost")?.count || 0;
  const resolved = won + lost;
  const winRate = resolved ? Math.round((won / resolved) * 100) : 0;
  if (!total) return <p className="empty-note">No leads yet.</p>;

  return (
    <div className="funnel-chart">
      <p>{total} sales-stage leads · {resolved ? `${winRate}% win rate on resolved leads` : "wins and losses will appear as leads resolve"}</p>
      <div className="funnel-stages">
        {items.map((item) => {
          const count = Number(item.count || 0);
          const share = Math.round((count / total) * 100);
          return (
            <article key={item.status}>
              <div className="funnel-stage-bar" title={`${LEAD_STATUS_LABELS[item.status] || item.label}: ${count} lead${count === 1 ? "" : "s"}`}>
                <i style={{ height: `${Math.max(10, Math.round((count / maxCount) * 100))}%` }}></i>
              </div>
              <strong>{count}</strong>
              <span>{LEAD_STATUS_LABELS[item.status] || item.label}</span>
              <small>{share}%</small>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyIntakeChart({ items }) {
  const maxCount = Math.max(1, ...items.map((item) => item.count || 0));
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const busiest = items.reduce((winner, item) => (Number(item.count || 0) > Number(winner.count || 0) ? item : winner), items[0] || {});
  if (!total) return <p className="empty-note">No lead intake data yet.</p>;

  return (
    <div className="weekly-intake">
      <p>{total} leads in the last 6 weeks · busiest week: {busiest.label || "n/a"}</p>
      <div className="weekly-intake-chart">
        {items.map((item) => (
          <article key={item.startDate}>
            <div title={`${item.label}: ${item.count} lead${item.count === 1 ? "" : "s"}`}>
              <i style={{ height: `${Math.max(10, Math.round(((item.count || 0) / maxCount) * 100))}%` }}></i>
            </div>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function AgendaLane({ title, movement, onViewAll }) {
  const items = movement.items || [];
  const total = Number(movement.total || 0);
  const visibleItems = items.slice(0, AGENDA_LIMIT);
  const hiddenCount = Math.max(0, total - visibleItems.length);

  return (
    <div className="agenda-lane">
      <div className="agenda-lane-header">
        <h3>{title}</h3>
        <span>{total}</span>
      </div>
      <div className="agenda-list">
        {visibleItems.map((lead) => (
          <article key={`${lead.id}-${lead.movementType}`}>
            <div>
              <strong>{lead.customerName}</strong>
              <span>{lead.destinationInterest || "No destination"} · {lead.movementDate}</span>
            </div>
            <small>{lead.assignedUserName || "Unassigned"}</small>
          </article>
        ))}
        {!total && <p className="empty-note">Nothing scheduled in this window.</p>}
      </div>
      {hiddenCount > 0 && (
        <div className="agenda-more-row">
          <span>Showing {visibleItems.length} of {total}</span>
          <button className="text-button" type="button" onClick={onViewAll}>View all</button>
        </div>
      )}
    </div>
  );
}

function leadDateFilters(window, dateMode) {
  return { dateMode, startDateFrom: window.startDate || "", startDateTo: window.endDate || "" };
}
