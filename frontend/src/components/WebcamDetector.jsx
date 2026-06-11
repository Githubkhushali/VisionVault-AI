import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';

// ─────────────────────────────────────────────────────────────
//  WebcamDetector — Live Face Tracking with Name Memory
//  - Detected faces auto-show their saved name from DB
//  - Unknown faces show a name input to register them
//  - Entry/exit leaderboard updates live every 5s
//  - Session end shows: "Khushali — 1 entry, exited 1 time"
// ─────────────────────────────────────────────────────────────

const WebcamDetector = () => {
    // ── Camera state ──────────────────────────────────────────
    const [cameraMode, setCameraMode] = useState('IDLE');   // 'IDLE' | 'SCANNING' | 'PAUSED'
    const [systemStatus, setSystemStatus] = useState('System Offline');
    const [isProcessing, setIsProcessing] = useState(false);

    // ── Live detections from current frame ────────────────────
    // Array of { identityId, name, entryCount, exitCount, status, isNew }
    const [liveDetections, setLiveDetections] = useState([]);

    // ── Known identity map: { identityId → name } (persists across frames) ──
    const [knownNames, setKnownNames] = useState({});

    // ── Name registration UI: { identityId → inputValue } ————
    const [nameInputs, setNameInputs] = useState({});
    const [nameFeedback, setNameFeedback] = useState({});  // 'saved' | 'error' | null

    // ── Inline edit mode in session summary ——————————————
    const [editingId, setEditingId] = useState(null);       // identityId currently being renamed
    const [editInput, setEditInput] = useState('');          // value in the rename input

    // ── Movement leaderboard (polls /api/movements) ───────────
    const [movements, setMovements] = useState([]);

    // ── Session report (shown after Stop) ─────────────────────
    const [sessionReport, setSessionReport] = useState(null);

    const webcamRef = useRef(null);
    const intervalRef = useRef(null);
    const movementsIntervalRef = useRef(null);
    const lastFrameRef = useRef(null);
    const lastIdentityKeyRef = useRef(null);
    const isLockedRef = useRef(false);

    // ── Scene-change detection (skip identical frames) ────────
    const hasSceneChanged = (imageSrc) =>
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
                    diff += Math.abs(data[i]   - lastFrameRef.current[i]);
                    diff += Math.abs(data[i+1] - lastFrameRef.current[i+1]);
                    diff += Math.abs(data[i+2] - lastFrameRef.current[i+2]);
                }
                lastFrameRef.current = data;
                resolve(diff / (32 * 24 * 3) > 18);
            };
            img.src = imageSrc;
        });

    // ── Fetch movements leaderboard ───────────────────────────
    const fetchMovements = useCallback(async () => {
        try {
            const res = await fetch('/api/movements');
            const data = await res.json();
            if (data.movements) setMovements(data.movements);
        } catch (err) {
            console.error('[Movements fetch error]', err);
        }
    }, []);

    // ── Capture frame → send to AI → update UI ────────────────
    const captureAndSend = async () => {
        if (!webcamRef.current || cameraMode !== 'SCANNING') return;

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) return;

        const changed = await hasSceneChanged(imageSrc);
        if (isLockedRef.current && !changed) return;  // skip static frames

        const blob = await (await fetch(imageSrc)).blob();
        const file = new File([blob], `frame_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('frame', file);

        setIsProcessing(true);
        setSystemStatus('Analyzing...');

        try {
            const res = await fetch('/api/stream-frame', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                const detections = data.detections || [];

                if (detections.length > 0) {
                    // ── Auto-recall known names from DB response ──────────────
                    // The AI service returns face.name from the persons table.
                    // We merge into our local knownNames map so the input stays
                    // pre-filled even for faces that were named in a previous session.
                    setKnownNames(prev => {
                        const updated = { ...prev };
                        detections.forEach(face => {
                            if (face.identityId && face.name && face.name !== 'Unknown') {
                                updated[face.identityId] = face.name;
                            }
                        });
                        return updated;
                    });

                    setLiveDetections(detections);
                    isLockedRef.current = true;

                    const key = detections.map(f => f.identityId).sort().join(',');
                    lastIdentityKeyRef.current = key;

                    const names = detections
                        .map(f => knownNames[f.identityId] || f.name || 'Unknown')
                        .filter(n => n !== 'Unknown');

                    setSystemStatus(
                        `🎯 Tracking: ${names.length > 0 ? names.join(', ') : `${detections.length} face(s)`}`
                    );
                } else {
                    isLockedRef.current = false;
                    lastIdentityKeyRef.current = null;
                    setLiveDetections([]);
                    setSystemStatus('🔍 Scanning...');
                }
            }
        } catch (err) {
            console.error('[Webcam Stream Error]', err);
            setSystemStatus('⚠️ Pipeline Error');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Register a name for an identity ──────────────────────
    const handleRegisterName = async (identityId) => {
        const name = (nameInputs[identityId] || '').trim();
        if (!name) return;
        try {
            const res = await fetch('/api/register-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identityId, name }),
            });
            const data = await res.json();
            if (data.success) {
                // Save to local known-names map immediately so UI updates
                setKnownNames(prev => ({ ...prev, [identityId]: name }));
                setNameFeedback(prev => ({ ...prev, [identityId]: 'saved' }));
                setTimeout(() => setNameFeedback(prev => ({ ...prev, [identityId]: null })), 2000);
                fetchMovements();
            } else {
                setNameFeedback(prev => ({ ...prev, [identityId]: 'error' }));
            }
        } catch (err) {
            setNameFeedback(prev => ({ ...prev, [identityId]: 'error' }));
        }
    };

    // ── Camera mode effects ───────────────────────────────────
    useEffect(() => {
        if (cameraMode === 'SCANNING') {
            setSystemStatus('🔍 Scanning...');
            intervalRef.current = setInterval(captureAndSend, 2000);
            fetchMovements();
            movementsIntervalRef.current = setInterval(fetchMovements, 5000);
        } else if (cameraMode === 'PAUSED') {
            setSystemStatus('⏸️ Paused');
            clearInterval(intervalRef.current);
        } else {
            // IDLE — reset
            setSystemStatus('System Offline');
            setLiveDetections([]);
            isLockedRef.current = false;
            lastIdentityKeyRef.current = null;
            lastFrameRef.current = null;
            clearInterval(intervalRef.current);
            clearInterval(movementsIntervalRef.current);
        }
        return () => {
            clearInterval(intervalRef.current);
            clearInterval(movementsIntervalRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraMode]);

    const handleStartSession = async () => {
        try { await fetch('/api/start-stream-analysis', { method: 'POST' }); } catch {}
        setSessionReport(null);
        setCameraMode('SCANNING');
    };

    const handleStopSession = async () => {
        clearInterval(intervalRef.current);
        clearInterval(movementsIntervalRef.current);
        setCameraMode('IDLE');
        setSystemStatus('⏳ Compiling session...');
        try {
            // Fetch both the Node session report AND the AI movements simultaneously
            const [sessionRes, movementsRes] = await Promise.all([
                fetch('/api/stop-stream-analysis', { method: 'POST' }),
                fetch('/api/movements'),
            ]);
            const sessionData = await sessionRes.json();
            const movementsData = await movementsRes.json();

            const latestMovements = movementsData.movements || [];
            setMovements(latestMovements);

            if (sessionData.success) {
                // Build a movement lookup map: { identityId → { entryCount, exitCount, name } }
                const movMap = {};
                latestMovements.forEach(m => { movMap[m.identityId] = m; });

                // Merge ALL faces from Node's faceLog with movement data.
                // sessionReport.faces = every face seen this session (from Node memory).
                // movMap = entry/exit counts (only faces that crossed the Y boundary).
                // By merging we never lose a face just because they didn't cross the line.
                const merged = (sessionData.report.faces || []).map(face => {
                    const mov = movMap[face.identityId] || {};
                    const resolvedName = knownNames[face.identityId]
                        || (mov.name && mov.name !== 'Unknown' ? mov.name : null)
                        || null;  // null = still unknown, will show input
                    return {
                        ...face,
                        name: resolvedName,
                        entryCount: mov.entryCount || 0,
                        exitCount:  mov.exitCount  || 0,
                    };
                });

                // Also add any faces that are in movements but NOT in the Node faceLog
                // (edge case: session started mid-stream)
                latestMovements.forEach(m => {
                    if (!merged.find(f => f.identityId === m.identityId)) {
                        merged.push({
                            identityId: m.identityId,
                            name: knownNames[m.identityId] || (m.name !== 'Unknown' ? m.name : null),
                            entryCount: m.entryCount || 0,
                            exitCount:  m.exitCount  || 0,
                            appearanceCount: 0,
                            crossings: 0,
                        });
                    }
                });

                setSessionReport({ ...sessionData.report, mergedFaces: merged });
                setSystemStatus(`✅ Done — ${merged.length} face(s) tracked`);
            }
        } catch (err) {
            console.error('[Stop session error]', err);
            setSystemStatus('⚠️ Failed to fetch session report');
        }
    };

    // ── Helpers ───────────────────────────────────────────────
    const displayName = (identityId, fallback = 'Unknown') =>
        knownNames[identityId] || fallback;

    const entryWord  = (n) => n === 1 ? 'entry'  : 'entries';
    const exitWord   = (n) => n === 1 ? 'time'   : 'times';

    // ─────────────────────────────────────────────────────────
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px', background: '#0f1117', borderRadius: '16px',
            border: '1px solid #1e2130', color: '#fff', maxWidth: '680px',
            margin: '32px auto', gap: '0',
        }}>
            <h2 style={{
                fontSize: '1.5rem', fontWeight: 800, marginBottom: '16px',
                background: 'linear-gradient(90deg, #60a5fa, #34d399)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
                VisionVault — Live Cam Tracker
            </h2>

            {/* Processing pill */}
            {isProcessing && (
                <div style={{ marginBottom: '8px', fontSize: '0.75rem', color: '#fbbf24', opacity: 0.9 }}>
                    ⚡ Analyzing frame...
                </div>
            )}

            {/* ── Webcam feed ───────────────────────────────── */}
            <div style={{
                width: '100%', aspectRatio: '4/3', background: '#000',
                borderRadius: '12px', overflow: 'hidden', border: '2px solid #1e2130', position: 'relative',
            }}>
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                />
                {/* Live identity overlay badges */}
                {liveDetections.length > 0 && (
                    <div style={{
                        position: 'absolute', bottom: '10px', left: '10px',
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                    }}>
                        {liveDetections.map((face, i) => (
                            <span key={i} style={{
                                background: 'rgba(0,0,0,0.75)', border: '1px solid #34d399',
                                borderRadius: '20px', padding: '3px 10px', fontSize: '0.72rem',
                                fontWeight: 700, color: '#34d399',
                            }}>
                                {displayName(face.identityId, face.name !== 'Unknown' ? face.name : null) || `ID-${i+1}`}
                                {face.status === 'INSIDE' ? ' 🟢' : face.status === 'OUTSIDE' ? ' 🔴' : ''}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Controls ──────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                {['Start', 'Pause', 'Stop'].map((label) => (
                    <button key={label}
                        onClick={
                            label === 'Start' ? handleStartSession :
                            label === 'Pause' ? () => setCameraMode('PAUSED') :
                            handleStopSession
                        }
                        disabled={
                            (label === 'Pause' && cameraMode === 'IDLE') ||
                            (label === 'Stop'  && cameraMode === 'IDLE')
                        }
                        className="btn btn-secondary"
                        style={{
                            background: cameraMode === 'SCANNING' && label === 'Start'  ? '#3b82f6' :
                                        cameraMode === 'PAUSED'   && label === 'Pause'  ? '#3b82f6' :
                                        cameraMode === 'IDLE'     && label === 'Stop'   ? '#3b82f6' : undefined,
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Status bar ────────────────────────────────── */}
            <div style={{
                marginTop: '12px', width: '100%', display: 'flex',
                justifyContent: 'space-around', background: '#070a0f',
                padding: '12px 16px', borderRadius: '10px', border: '1px solid #1e2130',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{systemStatus}</span>
                </div>
                <div style={{ borderRight: '1px solid #1e2130' }} />
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Faces</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#60a5fa' }}>{liveDetections.length}</span>
                </div>
                <div style={{ borderRight: '1px solid #1e2130' }} />
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Named</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399' }}>{Object.keys(knownNames).length}</span>
                </div>
            </div>

            {/* ── Live Identity Cards ───────────────────────── */}
            {liveDetections.length > 0 && (
                <div style={{ marginTop: '16px', width: '100%' }}>
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                        🔍 Live Detections
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {liveDetections.map((face, i) => {
                            const resolvedName = knownNames[face.identityId] || (face.name !== 'Unknown' ? face.name : null);
                            const isKnown = !!resolvedName;
                            return (
                                <div key={face.identityId || i} style={{
                                    background: '#0d1117', border: `1px solid ${isKnown ? '#34d399' : '#374151'}`,
                                    borderRadius: '10px', padding: '12px 14px',
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                }}>
                                    {/* Avatar circle */}
                                    <div style={{
                                        width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                                        background: isKnown ? '#064e3b' : '#1f2937',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1rem', fontWeight: 700, color: isKnown ? '#34d399' : '#9ca3af',
                                    }}>
                                        {isKnown ? resolvedName[0].toUpperCase() : '?'}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {isKnown ? (
                                            /* ── Known face: show name + stats ─── */
                                            <>
                                                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f9fafb' }}>{resolvedName}</p>
                                                <p style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>{face.identityId}</p>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#34d399' }}>▲ {face.entryCount || 0} {entryWord(face.entryCount || 0)}</span>
                                                    {(face.exitCount || 0) > 0 && (
                                                        <span style={{ fontSize: '0.72rem', color: '#f87171' }}>▼ exited {face.exitCount} {exitWord(face.exitCount)}</span>
                                                    )}
                                                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                                        {face.status === 'INSIDE' ? '🟢 Inside' : face.status === 'OUTSIDE' ? '🔴 Outside' : ''}
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            /* ── Unknown face: show name input ─── */
                                            <>
                                                <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace', marginBottom: '6px' }}>{face.identityId}</p>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Type name + press Enter..."
                                                        value={nameInputs[face.identityId] || ''}
                                                        onChange={e => setNameInputs(prev => ({ ...prev, [face.identityId]: e.target.value }))}
                                                        onKeyDown={e => e.key === 'Enter' && handleRegisterName(face.identityId)}
                                                        style={{
                                                            flex: 1, background: '#1f2937', border: '1px solid #374151',
                                                            borderRadius: '6px', padding: '5px 10px', fontSize: '0.8rem',
                                                            color: '#fff', outline: 'none',
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => handleRegisterName(face.identityId)}
                                                        style={{
                                                            padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem',
                                                            fontWeight: 700, cursor: 'pointer', border: 'none',
                                                            background: nameFeedback[face.identityId] === 'saved' ? '#065f46' :
                                                                        nameFeedback[face.identityId] === 'error' ? '#7f1d1d' : '#1d4ed8',
                                                            color: '#fff',
                                                        }}
                                                    >
                                                        {nameFeedback[face.identityId] === 'saved' ? '✅' :
                                                         nameFeedback[face.identityId] === 'error' ? '❌' : 'Save'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Live Entry/Exit Leaderboard ───────────────── */}
            {movements.length > 0 && (
                <div style={{ marginTop: '20px', width: '100%' }}>
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                        📊 Live Leaderboard
                    </p>
                    <div style={{ background: '#0d1117', borderRadius: '10px', border: '1px solid #1e2130', overflow: 'hidden' }}>
                        {[...movements]
                            .sort((a, b) => b.entryCount - a.entryCount)
                            .map((m, idx) => (
                                <div key={m.identityId} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 16px',
                                    borderBottom: idx < movements.length - 1 ? '1px solid #1e2130' : 'none',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', width: '18px' }}>#{idx+1}</span>
                                        <div style={{
                                            width: '30px', height: '30px', borderRadius: '50%', background: '#1f2937',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '0.85rem', color: '#60a5fa',
                                        }}>
                                            {m.name !== 'Unknown' ? m.name[0].toUpperCase() : '?'}
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f9fafb' }}>{m.name}</p>
                                            <p style={{ fontSize: '0.68rem', color: '#4b5563', fontFamily: 'monospace' }}>{m.identityId}</p>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 700 }}>
                                            {m.entryCount} {entryWord(m.entryCount)}
                                        </p>
                                        {m.exitCount > 0 && (
                                            <p style={{ fontSize: '0.72rem', color: '#f87171' }}>
                                                exited {m.exitCount} {exitWord(m.exitCount)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ── Session Report (after Stop) ───────────────── */}
            {sessionReport && sessionReport.mergedFaces && (
                <div style={{ marginTop: '20px', width: '100%', background: '#0d1117', borderRadius: '12px', border: '1px solid #065f46', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #064e3b', background: '#022c22' }}>
                        <h3 style={{ fontWeight: 800, fontSize: '1rem', color: '#34d399', margin: 0 }}>✅ Session Summary</h3>
                        <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '4px 0 0' }}>
                            Duration: {sessionReport.durationSec}s &nbsp;·&nbsp; {sessionReport.mergedFaces.length} face(s) detected
                        </p>
                    </div>

                    {/* Per-person rows */}
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ fontSize: '0.68rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
                            Per-Person Activity
                        </p>

                        {[...sessionReport.mergedFaces]
                            .sort((a, b) => (b.entryCount || 0) - (a.entryCount || 0))
                            .map((face, i) => {
                                const isKnown = !!face.name;
                                const displayLabel = face.name || face.identityId;
                                return (
                                    <div key={face.identityId || i} style={{
                                        background: '#111827', borderRadius: '10px',
                                        border: `1px solid ${isKnown ? '#065f46' : '#374151'}`,
                                        padding: '10px 14px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                            {/* Left: avatar + name/id */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                                                    background: isKnown ? '#064e3b' : '#1f2937',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 800, fontSize: '0.9rem',
                                                    color: isKnown ? '#34d399' : '#9ca3af',
                                                }}>
                                                    {isKnown ? face.name[0].toUpperCase() : '?'}
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {/* ── Inline edit mode ── */}
                                                    {editingId === face.identityId ? (
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                value={editInput}
                                                                onChange={e => setEditInput(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleSaveEdit(face.identityId);
                                                                    if (e.key === 'Escape') { setEditingId(null); setEditInput(''); }
                                                                }}
                                                                style={{
                                                                    flex: 1, background: '#0f172a', border: '1px solid #3b82f6',
                                                                    borderRadius: '6px', padding: '4px 8px', fontSize: '0.85rem',
                                                                    color: '#fff', outline: 'none', fontWeight: 600,
                                                                }}
                                                            />
                                                            <button onClick={() => handleSaveEdit(face.identityId)} style={{
                                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem',
                                                                fontWeight: 700, cursor: 'pointer', border: 'none',
                                                                background: '#065f46', color: '#34d399',
                                                            }}>✓</button>
                                                            <button onClick={() => { setEditingId(null); setEditInput(''); }} style={{
                                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem',
                                                                fontWeight: 700, cursor: 'pointer', border: 'none',
                                                                background: '#374151', color: '#9ca3af',
                                                            }}>✕</button>
                                                        </div>
                                                    ) : (
                                                        /* ── Display mode ── */
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f9fafb', margin: 0 }}>
                                                                {isKnown ? face.name : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Unknown</span>}
                                                            </p>
                                                            {/* ✏️ Edit/correct button — always visible for known faces */}
                                                            {isKnown && (
                                                                <button
                                                                    title="Correct this name"
                                                                    onClick={() => { setEditingId(face.identityId); setEditInput(face.name); }}
                                                                    style={{
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        padding: '2px 4px', borderRadius: '4px', lineHeight: 1,
                                                                        color: '#4b5563', fontSize: '0.8rem',
                                                                        transition: 'color 0.15s',
                                                                    }}
                                                                    onMouseEnter={e => e.target.style.color = '#60a5fa'}
                                                                    onMouseLeave={e => e.target.style.color = '#4b5563'}
                                                                >
                                                                    ✏️
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p style={{ fontSize: '0.67rem', color: '#4b5563', fontFamily: 'monospace', margin: '2px 0 0' }}>{face.identityId}</p>
                                                </div>
                                            </div>

                                            {/* Right: entry/exit summary */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: '#34d399' }}>
                                                    {face.entryCount} {entryWord(face.entryCount)}
                                                </p>
                                                {face.exitCount > 0 && (
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#f87171' }}>
                                                        exited {face.exitCount} {exitWord(face.exitCount)}
                                                    </p>
                                                )}
                                                {face.entryCount === 0 && face.exitCount === 0 && (
                                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280' }}>
                                                        seen {face.appearanceCount || 0} time(s)
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Name input for unknowns — register right from the report */}
                                        {!isKnown && editingId !== face.identityId && (
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Name this person..."
                                                    value={nameInputs[face.identityId] || ''}
                                                    onChange={e => setNameInputs(prev => ({ ...prev, [face.identityId]: e.target.value }))}
                                                    onKeyDown={e => e.key === 'Enter' && handleRegisterName(face.identityId)}
                                                    style={{
                                                        flex: 1, background: '#1f2937', border: '1px solid #374151',
                                                        borderRadius: '6px', padding: '5px 10px', fontSize: '0.8rem',
                                                        color: '#fff', outline: 'none',
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleRegisterName(face.identityId)}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem',
                                                        fontWeight: 700, cursor: 'pointer', border: 'none',
                                                        background: nameFeedback[face.identityId] === 'saved' ? '#065f46' :
                                                                    nameFeedback[face.identityId] === 'error' ? '#7f1d1d' : '#1d4ed8',
                                                        color: '#fff',
                                                    }}
                                                >
                                                    {nameFeedback[face.identityId] === 'saved' ? '✅ Saved' :
                                                     nameFeedback[face.identityId] === 'error' ? '❌ Error' : 'Save Name'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Totals strip */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-around',
                        padding: '10px 16px', borderTop: '1px solid #1e2130', background: '#070a0f',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block' }}>Total Entries</span>
                            <span style={{ fontWeight: 800, color: '#34d399' }}>{sessionReport.totalEntries}</span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block' }}>Total Exits</span>
                            <span style={{ fontWeight: 800, color: '#f87171' }}>{sessionReport.totalExits}</span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', color: '#6b7280', display: 'block' }}>Unique Faces</span>
                            <span style={{ fontWeight: 800, color: '#a78bfa' }}>{sessionReport.mergedFaces.length}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WebcamDetector;