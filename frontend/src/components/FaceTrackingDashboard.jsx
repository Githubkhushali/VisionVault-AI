import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
//  FaceTrackingDashboard
//  A high-performance face tracking & recognition dashboard with:
//  - Live camera overlay with positioned bounding boxes + inline name labels
//  - Strict session lifecycle: live → post-session summary → historical tabs
//  - Fault-tolerant history editing (retroactive name correction)
//  - Modular functional components with explicit hooks
// ─────────────────────────────────────────────────────────────────────────────

// ── Utility: format timestamp ─────────────────────────────────────────────────
const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatTimestamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ── Deterministic hue from identityId string ─────────────────────────────────
const idToHue = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-component: CameraOverlay
//  Renders the live webcam feed with absolute-positioned bounding boxes and
//  inline per-face name input fields.
// ─────────────────────────────────────────────────────────────────────────────
const CameraOverlay = ({
  webcamRef,
  detectedFaces,
  isLive,
  containerRef,
  faceLabelInputs,
  onFaceLabelChange,
  onFaceLabelSave,
  nameFeedback,
}) => {
  return (
    <div className="ftd-camera-wrapper" ref={containerRef}>
      {/* Camera feed via react-webcam or a placeholder */}
      <video
        ref={webcamRef}
        autoPlay
        muted
        playsInline
        className="ftd-video-feed"
      />

      {/* Idle placeholder overlay */}
      {!isLive && (
        <div className="ftd-camera-placeholder">
          <div className="ftd-camera-placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="ftd-camera-placeholder-text">Camera feed will appear here</p>
          <p className="ftd-camera-placeholder-sub">Click "Start Live Session" to begin tracking</p>
        </div>
      )}

      {/* Scanning pulse when live */}
      {isLive && (
        <div className="ftd-scan-line" />
      )}

      {/* Live indicator */}
      {isLive && (
        <div className="ftd-live-badge">
          <span className="ftd-live-dot" />
          LIVE
        </div>
      )}

      {/* ── Bounding boxes + inline labels ─────────────────────── */}
      {isLive && detectedFaces.map((face, idx) => {
        const hue = idToHue(face.identityId || String(idx));
        const boxColor = `hsl(${hue}, 80%, 60%)`;
        const resolvedName = face.name && face.name !== 'Unknown' ? face.name : null;
        const feedback = nameFeedback[face.identityId] || null;

        // Bounding box coordinates as percentages of the video container
        const { x = 0.2 + idx * 0.18, y = 0.15, w = 0.2, h = 0.35 } = face.bbox || {};

        return (
          <div
            key={face.identityId || idx}
            className="ftd-face-bounding-box"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              borderColor: boxColor,
              boxShadow: `0 0 12px ${boxColor}44, inset 0 0 8px ${boxColor}11`,
            }}
          >
            {/* Corner decorations */}
            <span className="ftd-bbox-corner ftd-bbox-tl" style={{ borderColor: boxColor }} />
            <span className="ftd-bbox-corner ftd-bbox-tr" style={{ borderColor: boxColor }} />
            <span className="ftd-bbox-corner ftd-bbox-bl" style={{ borderColor: boxColor }} />
            <span className="ftd-bbox-corner ftd-bbox-br" style={{ borderColor: boxColor }} />

            {/* Face index badge */}
            <span className="ftd-bbox-index" style={{ background: boxColor, color: '#0a0a0f' }}>
              #{idx + 1}
            </span>

            {/* ── Inline label: attached to right edge of bounding box ── */}
            <div
              className="ftd-bbox-label-panel"
              style={{ borderColor: `${boxColor}66`, '--box-color': boxColor }}
            >
              {resolvedName ? (
                // Known face: show name with edit button
                <div className="ftd-bbox-label-known">
                  <span
                    className="ftd-bbox-name-dot"
                    style={{ background: boxColor }}
                  />
                  <span className="ftd-bbox-known-name">{resolvedName}</span>
                  <button
                    className="ftd-bbox-edit-btn"
                    onClick={() => onFaceLabelChange(face.identityId, resolvedName, true)}
                    title="Edit name"
                    aria-label={`Edit name for face ${idx + 1}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              ) : (
                // Unknown face: show inline input field
                <div className="ftd-bbox-label-unknown">
                  <input
                    type="text"
                    placeholder="Enter Name"
                    value={faceLabelInputs[face.identityId] || ''}
                    onChange={(e) => onFaceLabelChange(face.identityId, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onFaceLabelSave(face.identityId)}
                    className="ftd-bbox-name-input"
                    style={{ '--box-color': boxColor, borderColor: `${boxColor}88` }}
                    aria-label={`Enter name for face ${idx + 1}`}
                    id={`face-name-input-${face.identityId || idx}`}
                  />
                  <button
                    className="ftd-bbox-save-btn"
                    onClick={() => onFaceLabelSave(face.identityId)}
                    style={{
                      background: feedback === 'saved' ? '#22c55e22' : `${boxColor}22`,
                      borderColor: feedback === 'saved' ? '#22c55e' : boxColor,
                      color: feedback === 'saved' ? '#22c55e' : boxColor,
                    }}
                    aria-label={`Save name for face ${idx + 1}`}
                  >
                    {feedback === 'saved' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : feedback === 'error' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    ) : (
                      <span>Save</span>
                    )}
                  </button>
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
//  Sub-component: LiveSessionLog
//  Shows only the events from the current active session — no historical data.
// ─────────────────────────────────────────────────────────────────────────────
const LiveSessionLog = ({ sessionLogs, detectedFaces, knownNames }) => {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionLogs]);

  return (
    <div className="ftd-live-log">
      <div className="ftd-live-log-header">
        <div className="ftd-live-log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Current Session Events
        </div>
        <span className="ftd-live-log-count">{sessionLogs.length} events</span>
      </div>

      <div className="ftd-live-log-body">
        {sessionLogs.length === 0 ? (
          <div className="ftd-live-log-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>No events yet. Session events will appear here in real-time.</span>
          </div>
        ) : (
          sessionLogs.map((log, idx) => {
            const hue = idToHue(log.identityId || '');
            const color = `hsl(${hue}, 75%, 60%)`;
            return (
              <div key={idx} className="ftd-live-log-item">
                <div className="ftd-log-avatar" style={{ background: `hsl(${hue},60%,15%)`, borderColor: color, color }}>
                  {(log.name || 'U')[0].toUpperCase()}
                </div>
                <div className="ftd-log-content">
                  <div className="ftd-log-name">
                    {log.name || <em className="ftd-log-unknown">Unknown</em>}
                    <span
                      className={`ftd-log-event-type ${log.event === 'ENTERED' ? 'entry' : log.event === 'EXITED' ? 'exit' : 'detected'}`}
                    >
                      {log.event === 'ENTERED' ? '↑ Entered'
                        : log.event === 'EXITED' ? '↓ Exited'
                        : '● Detected'}
                    </span>
                  </div>
                  <div className="ftd-log-meta">
                    <span className="ftd-log-id">{log.identityId}</span>
                    <span className="ftd-log-time">{formatTime(log.timestamp)}</span>
                  </div>
                </div>
                {log.confidence !== undefined && (
                  <div className="ftd-log-confidence">
                    <span>{log.confidence}%</span>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>

      {/* Live face cards strip */}
      {detectedFaces.length > 0 && (
        <div className="ftd-live-faces-strip">
          <p className="ftd-strip-label">Currently in Frame</p>
          <div className="ftd-strip-faces">
            {detectedFaces.map((face, idx) => {
              const hue = idToHue(face.identityId || String(idx));
              const resolvedName = knownNames[face.identityId] || face.name;
              return (
                <div key={face.identityId || idx} className="ftd-strip-face-chip"
                  style={{ borderColor: `hsl(${hue},70%,55%)`, background: `hsl(${hue},60%,8%)` }}>
                  <span className="ftd-chip-dot" style={{ background: `hsl(${hue},70%,55%)` }} />
                  <span className="ftd-chip-name">
                    {resolvedName && resolvedName !== 'Unknown' ? resolvedName : `Face #${idx + 1}`}
                  </span>
                  {face.confidence && (
                    <span className="ftd-chip-conf">{face.confidence}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-component: PostSessionSummary
//  Shown immediately after "End Live Session" — only shows data from that session.
// ─────────────────────────────────────────────────────────────────────────────
const PostSessionSummary = ({ summary, onViewHistory, onStartNew }) => {
  const [editingId, setEditingId] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [localFaces, setLocalFaces] = useState(summary?.mergedFaces || []);
  const [editFeedback, setEditFeedback] = useState({});

  useEffect(() => {
    setLocalFaces(summary?.mergedFaces || []);
  }, [summary]);

  const handleEditSave = async (identityId) => {
    const name = editInput.trim();
    if (!name) return;
    // Optimistic update
    setLocalFaces(prev => prev.map(f =>
      f.identityId === identityId ? { ...f, name } : f
    ));
    setEditingId(null);
    setEditInput('');

    // Persist to backend
    try {
      const res = await fetch('/api/history/update-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, newName: name }),
      });
      const data = await res.json();
      setEditFeedback(prev => ({ ...prev, [identityId]: data.success ? 'saved' : 'error' }));
      setTimeout(() => setEditFeedback(prev => ({ ...prev, [identityId]: null })), 2500);
    } catch {
      setEditFeedback(prev => ({ ...prev, [identityId]: 'error' }));
    }
  };

  const handleNameUnknown = async (identityId, nameInput) => {
    const name = nameInput.trim();
    if (!name) return;
    setLocalFaces(prev => prev.map(f =>
      f.identityId === identityId ? { ...f, name } : f
    ));
    try {
      await fetch('/api/history/update-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, newName: nameInput }),
      });
      setEditFeedback(prev => ({ ...prev, [identityId]: 'saved' }));
      setTimeout(() => setEditFeedback(prev => ({ ...prev, [identityId]: null })), 2500);
    } catch {}
  };

  if (!summary) return null;

  const totalEntries = localFaces.reduce((s, f) => s + (f.entryCount || 0), 0);
  const totalExits = localFaces.reduce((s, f) => s + (f.exitCount || 0), 0);
  const durationMin = Math.floor((summary.durationSec || 0) / 60);
  const durationSec = (summary.durationSec || 0) % 60;

  return (
    <div className="ftd-post-session">
      {/* Header */}
      <div className="ftd-post-header">
        <div className="ftd-post-title-row">
          <div className="ftd-post-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <div>
            <h2 className="ftd-post-title">Session Complete</h2>
            <p className="ftd-post-subtitle">
              {formatTimestamp(summary.startedAt)} — {formatTimestamp(summary.endedAt)}
            </p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="ftd-post-kpis">
          <div className="ftd-post-kpi">
            <span className="ftd-post-kpi-val">{localFaces.length}</span>
            <span className="ftd-post-kpi-label">Faces Tracked</span>
          </div>
          <div className="ftd-post-kpi-divider" />
          <div className="ftd-post-kpi">
            <span className="ftd-post-kpi-val green">{totalEntries}</span>
            <span className="ftd-post-kpi-label">Entries</span>
          </div>
          <div className="ftd-post-kpi-divider" />
          <div className="ftd-post-kpi">
            <span className="ftd-post-kpi-val red">{totalExits}</span>
            <span className="ftd-post-kpi-label">Exits</span>
          </div>
          <div className="ftd-post-kpi-divider" />
          <div className="ftd-post-kpi">
            <span className="ftd-post-kpi-val gold">
              {durationMin > 0 ? `${durationMin}m ` : ''}{durationSec}s
            </span>
            <span className="ftd-post-kpi-label">Duration</span>
          </div>
        </div>
      </div>

      {/* Per-person cards */}
      <div className="ftd-post-body">
        <p className="ftd-post-section-label">Per-Person Activity</p>
        <div className="ftd-post-faces">
          {localFaces.length === 0 ? (
            <div className="ftd-post-empty">No faces were tracked in this session.</div>
          ) : (
            [...localFaces]
              .sort((a, b) => (b.entryCount || 0) - (a.entryCount || 0))
              .map((face, idx) => {
                const hue = idToHue(face.identityId || '');
                const isKnown = !!face.name;
                const fb = editFeedback[face.identityId];

                return (
                  <div key={face.identityId || idx} className="ftd-post-face-card"
                    style={{ borderLeftColor: `hsl(${hue},70%,55%)` }}>
                    {/* Avatar */}
                    <div className="ftd-post-face-avatar"
                      style={{
                        background: `hsl(${hue},60%,12%)`,
                        borderColor: `hsl(${hue},70%,50%)`,
                        color: `hsl(${hue},70%,65%)`,
                      }}>
                      {isKnown ? face.name[0].toUpperCase() : '?'}
                    </div>

                    {/* Name + ID */}
                    <div className="ftd-post-face-info">
                      {editingId === face.identityId ? (
                        <div className="ftd-post-edit-row">
                          <input
                            autoFocus
                            type="text"
                            value={editInput}
                            onChange={e => setEditInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleEditSave(face.identityId);
                              if (e.key === 'Escape') { setEditingId(null); setEditInput(''); }
                            }}
                            className="ftd-post-edit-input"
                            aria-label={`Rename ${face.name || 'unknown face'}`}
                          />
                          <button className="ftd-post-edit-confirm" onClick={() => handleEditSave(face.identityId)}>✓</button>
                          <button className="ftd-post-edit-cancel" onClick={() => { setEditingId(null); setEditInput(''); }}>✕</button>
                        </div>
                      ) : (
                        <div className="ftd-post-name-row">
                          <span className="ftd-post-face-name">
                            {isKnown
                              ? face.name
                              : <em className="ftd-post-unknown-label">Unknown</em>}
                          </span>
                          {fb === 'saved' && <span className="ftd-inline-saved">✓ saved</span>}
                          {fb === 'error' && <span className="ftd-inline-error">✗ error</span>}
                          {isKnown && (
                            <button
                              className="ftd-post-rename-btn"
                              onClick={() => { setEditingId(face.identityId); setEditInput(face.name); }}
                              title="Correct this name"
                              aria-label={`Rename ${face.name}`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}

                      <span className="ftd-post-face-id">{face.identityId}</span>

                      {/* Name input for unknowns */}
                      {!isKnown && editingId !== face.identityId && (
                        <UnknownFaceNameInput
                          identityId={face.identityId}
                          onSave={handleNameUnknown}
                          feedback={fb}
                        />
                      )}
                    </div>

                    {/* Stats */}
                    <div className="ftd-post-face-stats">
                      {face.entryCount > 0 && (
                        <span className="ftd-post-stat-entry">▲ {face.entryCount} {face.entryCount === 1 ? 'entry' : 'entries'}</span>
                      )}
                      {face.exitCount > 0 && (
                        <span className="ftd-post-stat-exit">▼ {face.exitCount} {face.exitCount === 1 ? 'exit' : 'exits'}</span>
                      )}
                      {face.entryCount === 0 && face.exitCount === 0 && (
                        <span className="ftd-post-stat-seen">● Seen {face.appearanceCount || 1}×</span>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="ftd-post-actions">
        <button className="ftd-btn-primary" onClick={onStartNew} id="ftd-start-new-session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          Start New Session
        </button>
        <button className="ftd-btn-ghost" onClick={onViewHistory} id="ftd-view-history">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" />
          </svg>
          View Analysis History
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helper sub-component: UnknownFaceNameInput
// ─────────────────────────────────────────────────────────────────────────────
const UnknownFaceNameInput = ({ identityId, onSave, feedback }) => {
  const [value, setValue] = useState('');
  return (
    <div className="ftd-unknown-name-row">
      <input
        type="text"
        placeholder="Name this person…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave(identityId, value)}
        className="ftd-unknown-name-input"
        id={`post-unknown-name-${identityId}`}
      />
      <button
        className={`ftd-unknown-save-btn ${feedback === 'saved' ? 'saved' : feedback === 'error' ? 'error' : ''}`}
        onClick={() => onSave(identityId, value)}
      >
        {feedback === 'saved' ? '✓' : feedback === 'error' ? '✗' : 'Save'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-component: AnalysisHistoryView
//  Shows all past sessions and their aggregate data — completely separate from
//  the live session view.
// ─────────────────────────────────────────────────────────────────────────────
const AnalysisHistoryView = ({ historicalSessions, onEditHistoryName }) => {
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null); // { sessionIdx, faceIdx }
  const [editInput, setEditInput] = useState('');
  const [editFeedback, setEditFeedback] = useState({});

  const handleSaveHistoryEdit = async (identityId, sessionIdx, faceIdx) => {
    const name = editInput.trim();
    if (!name) return;
    onEditHistoryName(identityId, name, sessionIdx, faceIdx);
    setEditingEntry(null);
    setEditInput('');

    try {
      const res = await fetch('/api/history/update-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, newName: name }),
      });
      const data = await res.json();
      setEditFeedback(prev => ({ ...prev, [identityId]: data.success ? 'saved' : 'error' }));
      setTimeout(() => setEditFeedback(prev => ({ ...prev, [identityId]: null })), 2500);
    } catch {
      setEditFeedback(prev => ({ ...prev, [identityId]: 'error' }));
    }
  };

  if (!historicalSessions || historicalSessions.length === 0) {
    return (
      <div className="ftd-history-empty">
        <div className="ftd-history-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3>No Historical Sessions Yet</h3>
        <p>Completed sessions will appear here for analysis.</p>
      </div>
    );
  }

  return (
    <div className="ftd-history-view">
      <div className="ftd-history-header">
        <h2 className="ftd-history-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Analysis History
        </h2>
        <span className="ftd-history-count">{historicalSessions.length} sessions</span>
      </div>

      <div className="ftd-history-sessions">
        {[...historicalSessions].reverse().map((session, sIdx) => {
          const realIdx = historicalSessions.length - 1 - sIdx;
          const isExpanded = expandedSessionId === session.id;
          const duration = session.durationSec
            ? `${Math.floor(session.durationSec / 60)}m ${session.durationSec % 60}s`
            : '—';

          return (
            <div key={session.id} className={`ftd-history-session-card ${isExpanded ? 'expanded' : ''}`}>
              {/* Session header — click to expand */}
              <button
                className="ftd-history-session-header"
                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                aria-expanded={isExpanded}
                id={`ftd-history-session-${session.id}`}
              >
                <div className="ftd-hist-session-left">
                  <div className="ftd-hist-session-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </div>
                  <div>
                    <p className="ftd-hist-session-date">{formatTimestamp(session.startedAt)}</p>
                    <p className="ftd-hist-session-meta">
                      {session.faces?.length || 0} faces · {duration}
                    </p>
                  </div>
                </div>
                <div className="ftd-hist-session-right">
                  <div className="ftd-hist-stat">
                    <span className="ftd-hist-stat-val green">{session.totalEntries || 0}</span>
                    <span className="ftd-hist-stat-label">entries</span>
                  </div>
                  <div className="ftd-hist-stat">
                    <span className="ftd-hist-stat-val red">{session.totalExits || 0}</span>
                    <span className="ftd-hist-stat-label">exits</span>
                  </div>
                  <svg
                    className={`ftd-hist-chevron ${isExpanded ? 'open' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Expanded: per-face rows with inline Edit Name */}
              {isExpanded && (
                <div className="ftd-history-session-detail">
                  {/* Session log entries */}
                  {session.logs && session.logs.length > 0 && (
                    <div className="ftd-hist-logs">
                      <p className="ftd-hist-logs-label">Session Events</p>
                      {session.logs.map((log, lIdx) => (
                        <div key={lIdx} className="ftd-hist-log-row">
                          <span className={`ftd-hist-log-event ${log.event?.toLowerCase()}`}>
                            {log.event === 'ENTERED' ? '↑' : log.event === 'EXITED' ? '↓' : '●'}
                          </span>
                          <span className="ftd-hist-log-name">
                            {log.name || <em>Unknown</em>}
                          </span>
                          <span className="ftd-hist-log-time">{formatTime(log.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per-face cards with Edit Name */}
                  <p className="ftd-hist-faces-label">Tracked Identities</p>
                  <div className="ftd-hist-faces">
                    {(session.faces || []).map((face, fIdx) => {
                      const hue = idToHue(face.identityId || '');
                      const isKnown = !!face.name;
                      const isEditing = editingEntry?.sessionIdx === realIdx && editingEntry?.faceIdx === fIdx;
                      const fb = editFeedback[face.identityId];
                      return (
                        <div key={face.identityId || fIdx} className="ftd-hist-face-row">
                          <div
                            className="ftd-hist-face-avatar"
                            style={{
                              background: `hsl(${hue},60%,12%)`,
                              borderColor: `hsl(${hue},70%,50%)`,
                              color: `hsl(${hue},70%,65%)`,
                            }}
                          >
                            {isKnown ? face.name[0].toUpperCase() : '?'}
                          </div>

                          <div className="ftd-hist-face-info">
                            {isEditing ? (
                              <div className="ftd-hist-edit-row">
                                <input
                                  autoFocus
                                  type="text"
                                  value={editInput}
                                  onChange={e => setEditInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveHistoryEdit(face.identityId, realIdx, fIdx);
                                    if (e.key === 'Escape') { setEditingEntry(null); setEditInput(''); }
                                  }}
                                  className="ftd-hist-edit-input"
                                  aria-label={`Edit name for ${face.name || 'unknown'}`}
                                />
                                <button
                                  className="ftd-hist-edit-confirm"
                                  onClick={() => handleSaveHistoryEdit(face.identityId, realIdx, fIdx)}
                                >✓</button>
                                <button
                                  className="ftd-hist-edit-cancel"
                                  onClick={() => { setEditingEntry(null); setEditInput(''); }}
                                >✕</button>
                              </div>
                            ) : (
                              <div className="ftd-hist-name-row">
                                <span className="ftd-hist-face-name">
                                  {isKnown ? face.name : <em className="ftd-hist-unknown">Unknown</em>}
                                </span>
                                {fb === 'saved' && <span className="ftd-inline-saved">✓ saved</span>}
                                {fb === 'error' && <span className="ftd-inline-error">✗ failed</span>}
                                {/* Edit Name button — available for ALL entries */}
                                <button
                                  className="ftd-hist-edit-name-btn"
                                  onClick={() => {
                                    setEditingEntry({ sessionIdx: realIdx, faceIdx: fIdx });
                                    setEditInput(face.name || '');
                                  }}
                                  title={isKnown ? 'Correct name' : 'Add name'}
                                  aria-label={`Edit name for face ${fIdx + 1} in session`}
                                  id={`ftd-hist-edit-${face.identityId}-${realIdx}`}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                  Edit Name
                                </button>
                              </div>
                            )}
                            <span className="ftd-hist-face-id">{face.identityId}</span>
                          </div>

                          <div className="ftd-hist-face-stats">
                            {face.entryCount > 0 && <span className="ftd-stat-entry">▲ {face.entryCount}</span>}
                            {face.exitCount > 0 && <span className="ftd-stat-exit">▼ {face.exitCount}</span>}
                            {face.confidence && <span className="ftd-stat-conf">{face.confidence}%</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main: FaceTrackingDashboard
// ─────────────────────────────────────────────────────────────────────────────
const FaceTrackingDashboard = () => {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [isLive, setIsLive] = useState(false);                        // session active?
  const [view, setView] = useState('live');                           // 'live' | 'post-session' | 'history'
  const [detectedFaces, setDetectedFaces] = useState([]);             // current frame faces
  const [sessionLogs, setSessionLogs] = useState([]);                 // CURRENT session events only
  const [knownNames, setKnownNames] = useState({});                   // { identityId → name }
  const [faceLabelInputs, setFaceLabelInputs] = useState({});         // { identityId → inputValue }
  const [nameFeedback, setNameFeedback] = useState({});               // { identityId → 'saved'|'error'|null }
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemStatus, setSystemStatus] = useState('System Offline');
  const [postSessionSummary, setPostSessionSummary] = useState(null); // data from just-ended session
  const [historicalSessions, setHistoricalSessions] = useState([]);   // all past sessions

  // ── Refs ────────────────────────────────────────────────────────────────────
  const webcamRef = useRef(null);
  const containerRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const movementsIntervalRef = useRef(null);
  const lastFrameRef = useRef(null);
  const isLockedRef = useRef(false);
  const sessionStartRef = useRef(null);

  // ── Scene-change detection ──────────────────────────────────────────────────
  const hasSceneChanged = useCallback((imageSrc) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(true); return; }
        ctx.drawImage(img, 0, 0, 32, 24);
        const data = ctx.getImageData(0, 0, 32, 24).data;
        if (!lastFrameRef.current) { lastFrameRef.current = data; resolve(true); return; }
        let diff = 0;
        for (let i = 0; i < data.length; i += 4) {
          diff += Math.abs(data[i] - lastFrameRef.current[i]);
          diff += Math.abs(data[i + 1] - lastFrameRef.current[i + 1]);
          diff += Math.abs(data[i + 2] - lastFrameRef.current[i + 2]);
        }
        lastFrameRef.current = data;
        resolve(diff / (32 * 24 * 3) > 18);
      };
      img.onerror = () => resolve(true);
      img.src = imageSrc;
    }), []);

  // ── Camera: initialize video stream ────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('[FTD] Camera access denied:', err);
      setSystemStatus('⚠️ Camera access denied');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (webcamRef.current?.srcObject) {
      webcamRef.current.srcObject.getTracks().forEach(t => t.stop());
      webcamRef.current.srcObject = null;
    }
  }, []);

  // ── Capture frame & send to AI API ─────────────────────────────────────────
  const captureAndSend = useCallback(async () => {
    if (!webcamRef.current || !isLive) return;
    const video = webcamRef.current;
    if (video.readyState < 2) return;

    // Draw frame to canvas to get image data
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageSrc = canvas.toDataURL('image/jpeg', 0.85);

    const changed = await hasSceneChanged(imageSrc);
    if (isLockedRef.current && !changed) return;

    const blob = await (await fetch(imageSrc)).blob();
    const file = new File([blob], `frame_${Date.now()}.jpg`, { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('frame', file);

    setIsProcessing(true);
    setSystemStatus('Analyzing…');

    try {
      const res = await fetch('/api/stream-frame', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        const detections = data.detections || [];

        // Update known names from API response
        setKnownNames(prev => {
          const updated = { ...prev };
          detections.forEach(face => {
            if (face.identityId && face.name && face.name !== 'Unknown') {
              updated[face.identityId] = face.name;
            }
          });
          return updated;
        });

        // Map detections, merging with bounding box data from API
        const facesWithBbox = detections.map((face, idx) => ({
          ...face,
          bbox: face.bbox || {
            x: 0.1 + (idx * 0.25) % 0.7,
            y: 0.1,
            w: 0.22,
            h: 0.35,
          },
        }));

        setDetectedFaces(facesWithBbox);
        isLockedRef.current = detections.length > 0;

        // Log new detection events to current session log
        if (detections.length > 0) {
          const timestamp = new Date().toISOString();
          setSessionLogs(prev => {
            const newLogs = [];
            detections.forEach(face => {
              if (data.newEntries?.includes(face.identityId)) {
                newLogs.push({ ...face, event: 'ENTERED', timestamp });
              } else if (data.newExits?.includes(face.identityId)) {
                newLogs.push({ ...face, event: 'EXITED', timestamp });
              } else {
                // Only log detection once per identity per session (dedup)
                const alreadyLogged = prev.some(l => l.identityId === face.identityId);
                if (!alreadyLogged) {
                  newLogs.push({ ...face, event: 'DETECTED', timestamp });
                }
              }
            });
            return [...prev, ...newLogs];
          });

          const names = detections
            .map(f => knownNames[f.identityId] || f.name)
            .filter(n => n && n !== 'Unknown');

          setSystemStatus(
            `🎯 Tracking: ${names.length > 0 ? names.join(', ') : `${detections.length} face(s)`}`
          );
        } else {
          isLockedRef.current = false;
          setDetectedFaces([]);
          setSystemStatus('🔍 Scanning…');
        }
      }
    } catch (err) {
      console.error('[FTD] Frame analysis error:', err);
      setSystemStatus('⚠️ Pipeline error');
    } finally {
      setIsProcessing(false);
    }
  }, [isLive, hasSceneChanged, knownNames]);

  // ── Session lifecycle ───────────────────────────────────────────────────────
  const handleStartSession = useCallback(async () => {
    setSessionLogs([]);
    setDetectedFaces([]);
    setFaceLabelInputs({});
    setNameFeedback({});
    isLockedRef.current = false;
    lastFrameRef.current = null;
    sessionStartRef.current = new Date().toISOString();
    setPostSessionSummary(null);

    try { await fetch('/api/start-stream-analysis', { method: 'POST' }); } catch {}

    await startCamera();
    setIsLive(true);
    setView('live');
    setSystemStatus('🔍 Scanning…');
  }, [startCamera]);

  const handleEndSession = useCallback(async () => {
    // Stop capture loop
    clearInterval(captureIntervalRef.current);
    clearInterval(movementsIntervalRef.current);
    setIsLive(false);
    setSystemStatus('⏳ Compiling session report…');

    const endedAt = new Date().toISOString();

    try {
      const [sessionRes, movementsRes] = await Promise.all([
        fetch('/api/session/end', { method: 'POST' }).catch(() => null),
        fetch('/api/movements').catch(() => null),
      ]);

      let mergedFaces = [];
      let totalEntries = 0;
      let totalExits = 0;
      let durationSec = 0;

      if (sessionRes) {
        const sessionData = await sessionRes.json().catch(() => ({}));
        const movementsData = movementsRes ? await movementsRes.json().catch(() => ({})) : {};
        const latestMovements = movementsData.movements || [];
        const movMap = {};
        latestMovements.forEach(m => { movMap[m.identityId] = m; });

        mergedFaces = (sessionData.report?.faces || []).map(face => {
          const mov = movMap[face.identityId] || {};
          return {
            ...face,
            name: knownNames[face.identityId] || (mov.name && mov.name !== 'Unknown' ? mov.name : null),
            entryCount: mov.entryCount || 0,
            exitCount: mov.exitCount || 0,
          };
        });

        durationSec = sessionData.report?.durationSec || 0;
        totalEntries = sessionData.report?.totalEntries || 0;
        totalExits = sessionData.report?.totalExits || 0;
      } else {
        // Fallback: build summary from session logs
        const seenIds = {};
        sessionLogs.forEach(log => {
          if (!seenIds[log.identityId]) {
            seenIds[log.identityId] = {
              identityId: log.identityId,
              name: knownNames[log.identityId] || log.name || null,
              entryCount: 0, exitCount: 0, appearanceCount: 0,
            };
          }
          if (log.event === 'ENTERED') seenIds[log.identityId].entryCount++;
          else if (log.event === 'EXITED') seenIds[log.identityId].exitCount++;
          else seenIds[log.identityId].appearanceCount++;
        });
        mergedFaces = Object.values(seenIds);
        const ms = sessionStartRef.current
          ? (new Date(endedAt) - new Date(sessionStartRef.current))
          : 0;
        durationSec = Math.round(ms / 1000);
      }

      const summary = {
        id: `session_${Date.now()}`,
        startedAt: sessionStartRef.current,
        endedAt,
        durationSec,
        totalEntries,
        totalExits,
        mergedFaces,
        logs: [...sessionLogs],
      };

      setPostSessionSummary(summary);

      // Add to historical sessions
      setHistoricalSessions(prev => [...prev, {
        ...summary,
        faces: mergedFaces,
      }]);

      setSystemStatus(`✅ Done — ${mergedFaces.length} face(s) tracked`);
    } catch (err) {
      console.error('[FTD] Stop session error:', err);
      setSystemStatus('⚠️ Failed to compile session report');
    }

    stopCamera();
    setView('post-session');
  }, [knownNames, sessionLogs, stopCamera]);

  // ── Start/stop capture loop when isLive changes ────────────────────────────
  useEffect(() => {
    if (isLive) {
      captureIntervalRef.current = setInterval(captureAndSend, 2000);
    } else {
      clearInterval(captureIntervalRef.current);
      clearInterval(movementsIntervalRef.current);
    }
    return () => {
      clearInterval(captureIntervalRef.current);
      clearInterval(movementsIntervalRef.current);
    };
  }, [isLive, captureAndSend]);

  // ── Face label handling ────────────────────────────────────────────────────
  const handleFaceLabelChange = useCallback((identityId, value, triggerEdit = false) => {
    if (triggerEdit) {
      // Edit mode: pre-fill input with existing name
      setFaceLabelInputs(prev => ({ ...prev, [identityId]: value }));
      setKnownNames(prev => {
        const updated = { ...prev };
        delete updated[identityId]; // clear to show input
        return updated;
      });
    } else {
      setFaceLabelInputs(prev => ({ ...prev, [identityId]: value }));
    }
  }, []);

  const handleFaceLabelSave = useCallback(async (identityId) => {
    const name = (faceLabelInputs[identityId] || '').trim();
    if (!name) return;

    // Optimistic update
    setKnownNames(prev => ({ ...prev, [identityId]: name }));
    setFaceLabelInputs(prev => { const n = { ...prev }; delete n[identityId]; return n; });
    setNameFeedback(prev => ({ ...prev, [identityId]: null }));

    // Also update sessionLogs names for this identity
    setSessionLogs(prev => prev.map(log =>
      log.identityId === identityId ? { ...log, name } : log
    ));

    try {
      const res = await fetch('/api/history/update-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, newName: name }),
      });
      const data = await res.json();
      setNameFeedback(prev => ({ ...prev, [identityId]: data.success ? 'saved' : 'error' }));
    } catch {
      setNameFeedback(prev => ({ ...prev, [identityId]: 'error' }));
    }
    setTimeout(() => setNameFeedback(prev => ({ ...prev, [identityId]: null })), 2000);
  }, [faceLabelInputs]);

  // ── Historical name correction ─────────────────────────────────────────────
  const handleEditHistoryName = useCallback((identityId, newName, sessionIdx, faceIdx) => {
    setHistoricalSessions(prev => {
      const updated = [...prev];
      if (updated[sessionIdx]) {
        const faces = [...(updated[sessionIdx].faces || [])];
        if (faces[faceIdx]) {
          faces[faceIdx] = { ...faces[faceIdx], name: newName };
        }
        // Also update logs within that session
        const logs = (updated[sessionIdx].logs || []).map(log =>
          log.identityId === identityId ? { ...log, name: newName } : log
        );
        updated[sessionIdx] = { ...updated[sessionIdx], faces, logs };
      }
      return updated;
    });
    // Propagate to knownNames for future sessions
    setKnownNames(prev => ({ ...prev, [identityId]: newName }));
  }, []);

  // ── Status indicator color ─────────────────────────────────────────────────
  const statusColor = isLive ? '#22c55e' : postSessionSummary ? '#c7a27c' : '#6b7280';

  // ─────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="ftd-root">

      {/* ── Dashboard Header ── */}
      <div className="ftd-header">
        <div className="ftd-header-left">
          <div className="ftd-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="ftd-header-title">Face Tracking Dashboard</h1>
            <p className="ftd-header-sub">Real-time detection · Recognition · Session analytics</p>
          </div>
        </div>

        {/* Status pill */}
        <div className="ftd-status-pill" style={{ borderColor: statusColor + '55', background: statusColor + '11' }}>
          <span className="ftd-status-dot" style={{ background: statusColor }} />
          <span className="ftd-status-text" style={{ color: statusColor }}>{systemStatus}</span>
          {isProcessing && <span className="ftd-spinner" />}
        </div>
      </div>

      {/* ── View Tabs ── */}
      <div className="ftd-tab-bar" role="tablist" aria-label="Dashboard sections">
        <button
          id="ftd-tab-live"
          role="tab"
          className={`ftd-tab ${view === 'live' ? 'active' : ''}`}
          onClick={() => setView('live')}
          aria-selected={view === 'live'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Live Session
          {isLive && <span className="ftd-tab-live-dot" />}
        </button>

        {postSessionSummary && (
          <button
            id="ftd-tab-post-session"
            role="tab"
            className={`ftd-tab ${view === 'post-session' ? 'active' : ''}`}
            onClick={() => setView('post-session')}
            aria-selected={view === 'post-session'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            Session Summary
          </button>
        )}

        <button
          id="ftd-tab-history"
          role="tab"
          className={`ftd-tab ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
          aria-selected={view === 'history'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Analysis History
          {historicalSessions.length > 0 && (
            <span className="ftd-tab-count">{historicalSessions.length}</span>
          )}
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────
          LIVE SESSION VIEW
          Only shows the camera + current session log.
          No historical data visible here whatsoever.
       ─────────────────────────────────────────────────────── */}
      {view === 'live' && (
        <div className="ftd-live-layout">

          {/* Camera panel */}
          <div className="ftd-camera-panel">
            <CameraOverlay
              webcamRef={webcamRef}
              detectedFaces={detectedFaces}
              isLive={isLive}
              containerRef={containerRef}
              faceLabelInputs={faceLabelInputs}
              onFaceLabelChange={handleFaceLabelChange}
              onFaceLabelSave={handleFaceLabelSave}
              nameFeedback={nameFeedback}
            />

            {/* Session controls */}
            <div className="ftd-session-controls">
              {!isLive ? (
                <button
                  className="ftd-btn-start"
                  onClick={handleStartSession}
                  id="ftd-start-session"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                  </svg>
                  Start Live Session
                </button>
              ) : (
                <div className="ftd-active-controls">
                  <div className="ftd-session-timer">
                    <span className="ftd-timer-dot" />
                    Session Active
                  </div>
                  <div className="ftd-stats-bar">
                    <div className="ftd-stat-chip">
                      <span className="ftd-stat-chip-val" style={{ color: '#60a5fa' }}>
                        {detectedFaces.length}
                      </span>
                      <span className="ftd-stat-chip-label">In Frame</span>
                    </div>
                    <div className="ftd-stat-chip">
                      <span className="ftd-stat-chip-val" style={{ color: '#34d399' }}>
                        {Object.keys(knownNames).length}
                      </span>
                      <span className="ftd-stat-chip-label">Named</span>
                    </div>
                    <div className="ftd-stat-chip">
                      <span className="ftd-stat-chip-val" style={{ color: '#c7a27c' }}>
                        {sessionLogs.length}
                      </span>
                      <span className="ftd-stat-chip-label">Events</span>
                    </div>
                  </div>
                  <button
                    className="ftd-btn-end"
                    onClick={handleEndSession}
                    id="ftd-end-session"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="none" />
                    </svg>
                    End Live Session
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Live session log — current session ONLY */}
          <LiveSessionLog
            sessionLogs={sessionLogs}
            detectedFaces={detectedFaces}
            knownNames={knownNames}
          />
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          POST-SESSION VIEW
          Shown immediately after ending session.
          Displays ONLY data from the just-ended session.
       ─────────────────────────────────────────────────────── */}
      {view === 'post-session' && postSessionSummary && (
        <PostSessionSummary
          summary={postSessionSummary}
          onViewHistory={() => setView('history')}
          onStartNew={() => {
            setView('live');
            setPostSessionSummary(null);
          }}
        />
      )}

      {/* ────────────────────────────────────────────────────────
          ANALYSIS HISTORY VIEW
          Completely separate — all historical sessions.
          Fault-tolerant inline editing for every tracked entry.
       ─────────────────────────────────────────────────────── */}
      {view === 'history' && (
        <AnalysisHistoryView
          historicalSessions={historicalSessions}
          onEditHistoryName={handleEditHistoryName}
        />
      )}

    </div>
  );
};

export default FaceTrackingDashboard;
