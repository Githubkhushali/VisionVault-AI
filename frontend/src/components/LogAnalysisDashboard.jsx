import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
//  LogAnalysisDashboard — Day-wise Log Analysis with full analytics
//  Data sourced entirely from backend PostgreSQL (no dependency on AI service)
// ─────────────────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10);
const nDaysAgoStr = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const formatDateLabel = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};
const shortDate = (iso) => {
  if (!iso) return '';
  return iso.slice(5); // 'MM-DD'
};

// ─────────────────────────────────────────────────────────────────────────────
//  SummaryCard
// ─────────────────────────────────────────────────────────────────────────────
const SummaryCard = ({ icon, label, value, color, subtitle }) => (
  <div className="log-summary-card" style={{ borderTop: `2px solid ${color}55` }}>
    <div className="log-summary-card-icon" style={{ background: `${color}18`, color }}>
      {icon}
    </div>
    <div className="log-summary-card-body">
      <div className="log-summary-card-value" style={{ color }}>{value ?? 0}</div>
      <div className="log-summary-card-label">{label}</div>
      {subtitle && <div className="log-summary-card-sub">{subtitle}</div>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
//  PersonCard
// ─────────────────────────────────────────────────────────────────────────────
const PersonCard = ({ person, maxEntries }) => {
  const [imgError, setImgError] = useState(false);
  const isKnown   = !!person.name;
  const displayName = person.name || `Unknown_${(person.person_id || '?').slice(-4)}`;
  const initial   = displayName[0]?.toUpperCase() || '?';
  const fillPct   = maxEntries > 0 ? Math.round((person.entry_count / maxEntries) * 100) : 0;
  const accentColor = isKnown ? '#a78bfa' : '#6b7280';

  return (
    <div className="log-person-card" style={{ borderTop: `2px solid ${accentColor}66` }}>
      <div className="log-person-card-header">
        {person.faceUrl && !imgError ? (
          <img
            src={person.faceUrl}
            alt={displayName}
            className="log-person-avatar-img"
            onError={() => setImgError(true)}
            style={{ borderColor: accentColor }}
          />
        ) : (
          <div className="log-person-avatar-fallback" style={{ color: accentColor, borderColor: `${accentColor}55`, background: `${accentColor}15` }}>
            {initial}
          </div>
        )}
        <div className="log-person-badge" style={{ color: isKnown ? '#a78bfa' : '#6b7280', borderColor: isKnown ? '#a78bfa55' : '#6b728055' }}>
          {isKnown ? '✓ Known' : '? Unknown'}
        </div>
      </div>

      <div className="log-person-card-body">
        <div className="log-person-name" title={displayName}>{displayName}</div>
        <div className="log-person-id" title={person.person_id}>{person.person_id}</div>

        <div className="log-person-stats-row">
          <div className="log-person-stat">
            <span className="log-person-stat-val" style={{ color: accentColor }}>{person.entry_count}</span>
            <span className="log-person-stat-label">appearances</span>
          </div>
          <div className="log-person-stat">
            <span className="log-person-stat-val" style={{ color: '#34d399', fontSize: '0.78rem' }}>{person.first_seen || '—'}</span>
            <span className="log-person-stat-label">first seen</span>
          </div>
          <div className="log-person-stat">
            <span className="log-person-stat-val" style={{ color: '#60a5fa', fontSize: '0.78rem' }}>{person.last_seen || '—'}</span>
            <span className="log-person-stat-label">last seen</span>
          </div>
        </div>

        <div className="log-person-timeline">
          <div className="log-person-timeline-bar">
            <div className="log-person-timeline-fill" style={{ width: `${fillPct}%`, background: accentColor }} />
          </div>
          <span className="log-person-timeline-label">{fillPct}% of peak</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  HourChart — SVG line + bar chart
// ─────────────────────────────────────────────────────────────────────────────
const HourChart = ({ hours }) => {
  const maxVal = Math.max(...hours.map(h => h.detections), 1);
  const peakH  = hours.reduce((a, b) => b.detections > a.detections ? b : a, { hour: '00', detections: 0 });
  const W = 520, H = 110, PAD = 8;
  const BAR_W = (W - PAD * 2) / 24;

  return (
    <div className="log-hour-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="log-chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.15"/>
          </linearGradient>
          <linearGradient id="barGradPeak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.95"/>
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.2"/>
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line key={i}
            x1={PAD} y1={H * f} x2={W - PAD} y2={H * f}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          />
        ))}

        {/* Bars */}
        {hours.map((h, i) => {
          const barH = Math.max(3, (h.detections / maxVal) * (H - 20));
          const x = PAD + i * BAR_W + BAR_W * 0.1;
          const isPeak = h.detections === maxVal && maxVal > 0;
          return (
            <rect key={i}
              x={x} y={H - barH - 2} width={BAR_W * 0.8} height={barH}
              fill={isPeak ? 'url(#barGradPeak)' : 'url(#barGrad)'}
              rx="1.5"
            />
          );
        })}

        {/* Smooth line chart on top */}
        {(() => {
          const pts = hours.map((h, i) => {
            const x = PAD + i * BAR_W + BAR_W / 2;
            const y = H - 2 - (h.detections / maxVal) * (H - 20);
            return [x, y];
          });
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
          const area = `${d} L${pts[pts.length-1][0]},${H} L${pts[0][0]},${H} Z`;
          return (
            <>
              <path d={area} fill="url(#lineGrad)" />
              <path d={d} fill="none" stroke="#a78bfa" strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" />
              {/* Dots at peak */}
              {pts.map((p, i) => hours[i].detections === maxVal && maxVal > 0 ? (
                <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#a78bfa" />
              ) : null)}
            </>
          );
        })()}

        {/* Hour labels */}
        {[0, 4, 8, 12, 16, 20, 23].map(h => (
          <text key={h}
            x={PAD + h * BAR_W + BAR_W / 2} y={H - 1}
            fontSize="6.5" fill="rgba(255,255,255,0.35)" textAnchor="middle"
          >
            {String(h).padStart(2,'0')}
          </text>
        ))}
      </svg>

      {maxVal > 0 && (
        <div className="log-chart-peak">
          Peak: <strong>{peakH.hour}:00</strong> — {peakH.detections} detection{peakH.detections !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  TrendChart — SVG line chart
// ─────────────────────────────────────────────────────────────────────────────
const TrendChart = ({ trend }) => {
  if (!trend || trend.length === 0) {
    return <div className="log-chart-empty">No trend data yet. Start a live session to generate data.</div>;
  }
  const maxVal = Math.max(...trend.map(d => d.unique_people || 0), 1);
  const W = 520, H = 100, PAD = 12;

  const pts = trend.map((d, i) => {
    const x = trend.length === 1
      ? W / 2
      : PAD + (i / (trend.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.unique_people || 0) / maxVal) * (H - PAD * 2);
    return { x, y, ...d };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="log-chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#34d399" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0.33, 0.66].map((f, i) => (
          <line key={i} x1={PAD} y1={H * f} x2={W - PAD} y2={H * f}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d={areaPath} fill="url(#trendGrad)" />
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#34d399" opacity="0.9" />
            <text x={p.x} y={H - 1} fontSize="7" fill="rgba(255,255,255,0.4)" textAnchor="middle">
              {shortDate(p.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  KnownUnknownPie
// ─────────────────────────────────────────────────────────────────────────────
const KnownUnknownPie = ({ known, unknown }) => {
  const total = known + unknown;
  if (total === 0) return <div className="log-chart-empty">No visitor data available for this date.</div>;

  const knownPct   = Math.round((known / total) * 100);
  const unknownPct = 100 - knownPct;
  const conicGrad  = `conic-gradient(#a78bfa 0% ${knownPct}%, #374151 ${knownPct}% 100%)`;

  return (
    <div className="log-pie-wrapper">
      <div className="log-pie-chart" style={{ background: conicGrad }}>
        <div className="log-pie-center">
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f5f1ec' }}>{total}</span>
          <span style={{ fontSize: '0.6rem', color: '#8e8276' }}>total</span>
        </div>
      </div>
      <div className="log-pie-legend">
        <div className="log-pie-legend-item">
          <span className="log-pie-dot" style={{ background: '#a78bfa' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#f5f1ec' }}>Known — {knownPct}%</div>
            <div style={{ fontSize: '0.72rem', color: '#8e8276' }}>{known} identified {known === 1 ? 'person' : 'people'}</div>
          </div>
        </div>
        <div className="log-pie-legend-item">
          <span className="log-pie-dot" style={{ background: '#374151' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#f5f1ec' }}>Unknown — {unknownPct}%</div>
            <div style={{ fontSize: '0.72rem', color: '#8e8276' }}>{unknown} unidentified</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  TopPeopleList
// ─────────────────────────────────────────────────────────────────────────────
const TopPeopleList = ({ people }) => {
  const [imgErrors, setImgErrors] = useState({});
  if (!people || people.length === 0) {
    return <div className="log-chart-empty">No frequent visitors yet — start a live session to populate this.</div>;
  }
  const maxTotal = Math.max(...people.map(p => p.total), 1);

  return (
    <div className="log-top-people">
      {people.map((p, idx) => {
        const name = p.name || `Unknown_${(p.person_id || '').slice(-4)}`;
        const pct  = Math.round((p.total / maxTotal) * 100);
        return (
          <div key={p.person_id || idx} className="log-top-person-row">
            <div className="log-top-rank">#{idx + 1}</div>
            <div className="log-top-avatar">
              {p.faceUrl && !imgErrors[p.person_id] ? (
                <img src={p.faceUrl} alt={name} className="log-top-avatar-img"
                  onError={() => setImgErrors(e => ({ ...e, [p.person_id]: true }))} />
              ) : (
                <div className="log-top-avatar-fallback">{name[0]?.toUpperCase()}</div>
              )}
            </div>
            <div className="log-top-info">
              <div className="log-top-name" title={name}>{name}</div>
              <div className="log-top-bar-row">
                <div className="log-top-bar">
                  <div className="log-top-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="log-top-count">{p.total}×</span>
              </div>
              {p.last_seen && (
                <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '2px' }}>
                  Last seen: {p.last_seen}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────────────────────────────
const LogAnalysisDashboard = () => {
  const [selectedDate,   setSelectedDate]   = useState(todayStr());
  const [activeFilter,   setActiveFilter]   = useState('today');
  const [viewMode,       setViewMode]       = useState('cards');

  const [summary,        setSummary]        = useState(null);
  const [people,         setPeople]         = useState([]);
  const [hourlyStats,    setHourlyStats]    = useState([]);
  const [trend,          setTrend]          = useState([]);
  const [topPeople,      setTopPeople]      = useState([]);
  const [availableDates, setAvailableDates] = useState([]);

  const [loading,        setLoading]        = useState(false);
  const [rebuilding,     setRebuilding]     = useState(false);
  const [error,          setError]          = useState(null);
  const [rebuildMsg,     setRebuildMsg]     = useState(null);

  // ── Backfill on first load ──────────────────────────────────────────────
  const triggerRebuild = useCallback(async (silent = false) => {
    if (!silent) setRebuilding(true);
    try {
      const r = await fetch('/api/analytics/rebuild', { method: 'POST' });
      const d = await r.json();
      if (!silent) {
        setRebuildMsg(d.success
          ? `✅ Analytics rebuilt — ${d.rowsUpserted} record(s) backfilled from existing history.`
          : `⚠️ Rebuild partially failed: ${d.error}`);
        setTimeout(() => setRebuildMsg(null), 5000);
      }
    } catch {
      if (!silent) setRebuildMsg('⚠️ Rebuild request failed. Check backend.');
    } finally {
      if (!silent) setRebuilding(false);
    }
  }, []);

  // ── Fetch all data ─────────────────────────────────────────────────────
  const fetchData = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const trendDays = activeFilter === '30days' ? 30 : 7;
      const [summaryRes, logsRes, hourlyRes, trendRes, topRes, datesRes] = await Promise.all([
        fetch(`/api/analytics/daily-summary?date=${date}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/analytics/daily-logs?date=${date}`).then(r => r.json()).catch(() => ({ people: [] })),
        fetch(`/api/analytics/hourly-stats?date=${date}`).then(r => r.json()).catch(() => ({ hours: [] })),
        fetch(`/api/analytics/daily-trend?days=${trendDays}`).then(r => r.json()).catch(() => ({ trend: [] })),
        fetch(`/api/analytics/top-people?days=${trendDays}`).then(r => r.json()).catch(() => ({ topPeople: [] })),
        fetch(`/api/analytics/available-dates`).then(r => r.json()).catch(() => ({ dates: [] })),
      ]);
      setSummary(summaryRes);
      setPeople(logsRes.people || []);
      setHourlyStats(hourlyRes.hours || Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2,'0'), detections: 0 })));
      setTrend(trendRes.trend || []);
      setTopPeople(topRes.topPeople || []);
      setAvailableDates(datesRes.dates || []);
    } catch (e) {
      setError('Failed to load analytics. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  // ── Initial load: rebuild silently, then fetch ─────────────────────────
  useEffect(() => {
    (async () => {
      await triggerRebuild(true); // silent backfill on first mount
      fetchData(selectedDate);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // ── Date filter handlers ───────────────────────────────────────────────
  const applyFilter = (filter) => {
    setActiveFilter(filter);
    switch (filter) {
      case 'today':     setSelectedDate(todayStr()); break;
      case 'yesterday': setSelectedDate(nDaysAgoStr(1)); break;
      case '7days':     setSelectedDate(nDaysAgoStr(6)); break;
      case '30days':    setSelectedDate(nDaysAgoStr(29)); break;
      default: break;
    }
  };

  const maxEntries  = people.length > 0 ? Math.max(...people.map(p => p.entry_count)) : 1;
  const knownCount  = people.filter(p => !!p.name).length;
  const unknownCount = people.filter(p => !p.name).length;
  const hasData     = people.length > 0 || (summary?.totalUniquePeople > 0);

  return (
    <div className="log-dashboard">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="log-dashboard-header">
        <div>
          <h2 className="log-dashboard-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Log Analysis
          </h2>
          <p className="log-dashboard-subtitle">{formatDateLabel(selectedDate)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="log-refresh-btn"
            onClick={async () => { await triggerRebuild(false); fetchData(selectedDate); }}
            disabled={rebuilding || loading}
            id="log-rebuild"
            title="Rebuild analytics from all existing data"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: rebuilding ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {rebuilding ? 'Rebuilding…' : 'Rebuild'}
          </button>
          <button
            className="log-refresh-btn"
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            id="log-refresh"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Rebuild feedback ──────────────────────────────────────── */}
      {rebuildMsg && (
        <div className="log-rebuild-banner">{rebuildMsg}</div>
      )}

      {/* ── Date Filters ──────────────────────────────────────────── */}
      <div className="log-date-filter">
        {[
          { key: 'today',     label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: '7days',     label: 'Last 7 Days' },
          { key: '30days',    label: 'Last 30 Days' },
          { key: 'custom',    label: 'Custom' },
        ].map(f => (
          <button key={f.key} id={`log-filter-${f.key}`}
            className={`log-filter-btn ${activeFilter === f.key ? 'active' : ''}`}
            onClick={() => applyFilter(f.key)}
          >{f.label}</button>
        ))}
        {activeFilter === 'custom' && (
          <input type="date" className="log-date-input" value={selectedDate}
            max={todayStr()} onChange={e => setSelectedDate(e.target.value)} id="log-custom-date" />
        )}
        {availableDates.length > 0 && (
          <select className="log-date-select" value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setActiveFilter('custom'); }}
            id="log-date-select">
            <option value="">Jump to date…</option>
            {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="log-error-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* ── Summary Cards ──────────────────────────────────────────── */}
      <div className="log-summary-cards">
        <SummaryCard icon="👥" label="Unique People" value={summary?.totalUniquePeople ?? 0}
          color="#a78bfa" subtitle="distinct individuals" />
        <SummaryCard icon="🚪" label="Total Entries" value={summary?.totalEntries ?? 0}
          color="#34d399" subtitle="all appearances combined" />
        <SummaryCard icon="🔁" label="Returning Visitors" value={summary?.returningVisitors ?? 0}
          color="#60a5fa" subtitle="seen more than once" />
        <SummaryCard icon="❓" label="Unknown Visitors" value={summary?.unknownVisitors ?? 0}
          color="#f59e0b" subtitle="not yet identified" />
      </div>

      {/* ── View toggle ──────────────────────────────────────────── */}
      {people.length > 0 && (
        <div className="log-view-toggle">
          {[
            { key: 'cards', label: 'Card View', icon: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></> },
            { key: 'table', label: 'Table View', icon: <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/> },
          ].map(v => (
            <button key={v.key} id={`log-view-${v.key}`}
              className={`log-toggle-btn ${viewMode === v.key ? 'active' : ''}`}
              onClick={() => setViewMode(v.key)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {v.icon}
              </svg>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────── */}
      {loading && (
        <div className="log-loading">
          <div className="log-loading-spinner"/>
          <span>Loading analytics for {selectedDate}…</span>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {!loading && !hasData && (
        <div className="log-empty-state">
          <div className="log-empty-icon">📋</div>
          <h3>No detections recorded for {selectedDate}</h3>
          <p>Start a Live Camera session to begin tracking people. All sessions are automatically logged.</p>
          <button className="log-refresh-btn" style={{ margin: '16px auto 0', display: 'flex' }}
            onClick={() => { triggerRebuild(false).then(() => fetchData(selectedDate)); }}>
            ↻ Run Rebuild to Import Existing Data
          </button>
        </div>
      )}

      {/* ── Person Card Grid ──────────────────────────────────────── */}
      {!loading && viewMode === 'cards' && people.length > 0 && (
        <div className="log-person-cards-grid">
          {[...people].sort((a, b) => b.entry_count - a.entry_count).map((person, idx) => (
            <PersonCard key={person.person_id || idx} person={person} maxEntries={maxEntries} />
          ))}
        </div>
      )}

      {/* ── Table View ───────────────────────────────────────────── */}
      {!loading && viewMode === 'table' && people.length > 0 && (
        <div className="log-table-wrapper">
          <table className="log-table">
            <thead>
              <tr>
                <th>Face</th>
                <th>Person Name</th>
                <th>Person ID</th>
                <th>Entry Count</th>
                <th>First Seen</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {[...people].sort((a, b) => b.entry_count - a.entry_count).map((p, idx) => {
                const name = p.name || `Unknown_${(p.person_id || '').slice(-4)}`;
                return (
                  <tr key={p.person_id || idx}>
                    <td>
                      <div className="log-table-face-cell">
                        <FaceImg src={p.faceUrl} name={name} size={38} />
                      </div>
                    </td>
                    <td><span className={`log-table-name ${p.name ? 'known' : 'unknown'}`}>{name}</span></td>
                    <td><code className="log-table-id">{p.person_id}</code></td>
                    <td>
                      <div className="log-table-count-cell">
                        <span className="log-table-count">{p.entry_count}</span>
                        <div className="log-table-mini-bar">
                          <div className="log-table-mini-fill"
                            style={{ width: `${Math.round((p.entry_count / maxEntries) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td><span className="log-table-time">{p.first_seen || '—'}</span></td>
                    <td><span className="log-table-time">{p.last_seen || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Charts Grid ───────────────────────────────────────────── */}
      {!loading && (
        <div className="log-charts-grid">
          <div className="log-chart-panel">
            <div className="log-chart-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Hour-wise Detections
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#6b7280' }}>{selectedDate}</span>
            </div>
            <HourChart hours={hourlyStats.length > 0 ? hourlyStats
              : Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2,'0'), detections: 0 }))} />
          </div>

          <div className="log-chart-panel">
            <div className="log-chart-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
              {activeFilter === '30days' ? '30' : '7'}-Day Visitor Trend
            </div>
            <TrendChart trend={trend} />
          </div>

          <div className="log-chart-panel">
            <div className="log-chart-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.21 15.89A10 10 0 118 2.83"/>
                <path d="M22 12A10 10 0 0012 2v10z"/>
              </svg>
              Known vs Unknown
            </div>
            <KnownUnknownPie known={knownCount} unknown={unknownCount} />
          </div>

          <div className="log-chart-panel">
            <div className="log-chart-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Most Frequent (Last {activeFilter === '30days' ? '30' : '7'} Days)
            </div>
            <TopPeopleList people={topPeople} />
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  FaceImg helper (handles broken URLs gracefully)
// ─────────────────────────────────────────────────────────────────────────────
const FaceImg = ({ src, name, size = 38 }) => {
  const [err, setErr] = useState(false);
  const initial = (name || '?')[0].toUpperCase();
  if (!src || err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 800, color: 'rgba(167,139,250,0.8)',
      }}>{initial}</div>
    );
  }
  return <img src={src} alt={name} onError={() => setErr(true)}
    style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border: '2px solid rgba(167,139,250,0.35)' }} />;
};

export default LogAnalysisDashboard;
