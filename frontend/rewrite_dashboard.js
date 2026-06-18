const fs = require('fs');

const fileContent = `import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Users, UserCheck, UserX, LogIn, LogOut, Activity, History, Check, X, Play, Square, FileText, ChevronDown, ChevronRight, Edit2 } from 'lucide-react';

// ── Utility: format timestamp
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

const idToHue = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

// ── Sub-component: StatCard
const StatCard = ({ icon: Icon, label, value, colorClass }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={\`bg-gray-900/60 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 border border-white/5 border-l-4 \${colorClass} shadow-lg\`}
  >
    <div className={\`p-3 rounded-xl bg-gray-800/80 \${colorClass.replace('border-', 'text-')}\`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <motion.p 
        key={value}
        initial={{ scale: 1.2, color: '#fff' }}
        animate={{ scale: 1, color: '' }}
        className="text-xl sm:text-2xl font-bold text-gray-100"
      >
        {value}
      </motion.p>
    </div>
  </motion.div>
);

// ── Sub-component: CameraOverlay
const CameraOverlay = ({
  webcamRef,
  detectedFaces,
  isLive,
  containerRef,
  knownNames,
  faceLabelInputs,
  onFaceLabelChange,
  onFaceLabelSave,
  nameFeedback,
}) => {
  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-gray-950/90 backdrop-blur-xl border border-white/10 shadow-2xl" ref={containerRef}>
      <video
        ref={webcamRef}
        autoPlay
        muted
        playsInline
        className={\`w-full h-full object-cover transition-opacity duration-700 \${isLive ? 'opacity-100' : 'opacity-0'}\`}
      />
      
      {!isLive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          <Camera size={64} className="mb-4 opacity-30" />
          <p className="text-xl font-medium text-gray-300">Camera Offline</p>
          <p className="text-sm opacity-60 mt-2">Click "Start Live Tracking" to begin</p>
        </div>
      )}

      {isLive && (
        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold tracking-widest text-red-500 uppercase">Live</span>
        </div>
      )}

      {/* Scanning overlay pulse */}
      {isLive && detectedFaces.length === 0 && (
         <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div 
              animate={{ y: ['-10%', '110%'] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              className="w-full h-32 bg-gradient-to-b from-transparent via-indigo-500/10 to-transparent"
            />
         </div>
      )}

      <AnimatePresence>
        {isLive && detectedFaces.map((face, idx) => {
          const resolvedName = knownNames[face.identityId] || face.name;
          const isKnown = resolvedName && resolvedName !== 'Unknown';
          const boxColorClass = isKnown ? 'border-emerald-500' : 'border-rose-500';
          const bgColorClass = isKnown ? 'bg-emerald-500' : 'bg-rose-500';
          const textColorClass = isKnown ? 'text-emerald-50' : 'text-rose-50';
          const feedback = nameFeedback[face.identityId] || null;
          
          const { x = 0.2 + (idx * 0.1), y = 0.2, w = 0.2, h = 0.3 } = face.bbox || {};

          return (
            <motion.div
              key={face.identityId || idx}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className={\`absolute border-2 \${boxColorClass} transition-all duration-200 ease-out\`}
              style={{
                left: \`\${x * 100}%\`,
                top: \`\${y * 100}%\`,
                width: \`\${w * 100}%\`,
                height: \`\${h * 100}%\`,
                boxShadow: isKnown ? '0 0 20px rgba(16, 185, 129, 0.2)' : '0 0 20px rgba(244, 63, 94, 0.2)',
              }}
            >
              {/* Corner brackets */}
              <div className={\`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 \${boxColorClass}\`} />
              <div className={\`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 \${boxColorClass}\`} />
              <div className={\`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 \${boxColorClass}\`} />
              <div className={\`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 \${boxColorClass}\`} />

              {/* Label above the box */}
              <div className="absolute bottom-full mb-2 left-0 flex items-center gap-2 whitespace-nowrap">
                <div className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 \${bgColorClass} \${textColorClass}\`}>
                  {isKnown ? <UserCheck size={14} /> : <UserX size={14} />}
                  {isKnown ? resolvedName : 'Unknown'}
                  {face.confidence && (
                    <span className="opacity-90 ml-1 font-mono bg-black/20 px-1.5 py-0.5 rounded text-[10px]">{face.confidence}%</span>
                  )}
                </div>

                {/* Inline Editing for Unknowns */}
                {!isKnown && (
                  <div className="flex items-center gap-1 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-2xl">
                    <input
                      type="text"
                      placeholder="Enter name..."
                      value={faceLabelInputs[face.identityId] || ''}
                      onChange={(e) => onFaceLabelChange(face.identityId, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onFaceLabelSave(face.identityId)}
                      className="bg-transparent text-xs text-white w-24 px-2 outline-none font-medium placeholder-gray-500"
                    />
                    <button
                      onClick={() => onFaceLabelSave(face.identityId)}
                      className={\`p-1.5 rounded-md transition-colors \${feedback === 'saved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 hover:bg-white/20 text-white'}\`}
                    >
                      {feedback === 'saved' ? <Check size={14} /> : feedback === 'error' ? <X size={14} /> : <Check size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

// ── Sub-component: DetectedPersonsList
const DetectedPersonsList = ({ detectedFaces, knownNames }) => (
  <div className="flex-1 min-h-0 bg-gray-900/60 backdrop-blur-xl rounded-2xl flex flex-col overflow-hidden border border-white/10 shadow-lg">
    <div className="p-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
      <h3 className="font-semibold text-gray-200 flex items-center gap-2 text-sm uppercase tracking-wider">
        <Users size={16} className="text-indigo-400" /> Tracked Now
      </h3>
      <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full text-xs font-bold border border-indigo-500/30">
        {detectedFaces.length}
      </span>
    </div>
    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
      <AnimatePresence>
        {detectedFaces.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center text-gray-500 text-sm">
            <Camera className="mx-auto mb-2 opacity-20" size={32} />
            Waiting for subjects...
          </motion.div>
        ) : (
          detectedFaces.map((face, idx) => {
            const resolvedName = knownNames[face.identityId] || face.name;
            const isKnown = resolvedName && resolvedName !== 'Unknown';
            const hue = idToHue(face.identityId || String(idx));
            
            return (
              <motion.div
                key={face.identityId || idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-800/70 transition-colors border border-white/5"
              >
                <div 
                  className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold shadow-inner"
                  style={{ backgroundColor: \`hsl(\${hue}, 60%, 15%)\`, color: \`hsl(\${hue}, 70%, 70%)\`, border: \`1px solid hsl(\${hue}, 50%, 30%)\` }}
                >
                  {isKnown ? resolvedName[0].toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-100 truncate">
                    {isKnown ? resolvedName : 'Unknown'}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{face.identityId}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isKnown ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Known</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">Unknown</span>
                  )}
                  {face.confidence && <span className="text-[10px] text-gray-400 font-mono">{face.confidence}%</span>}
                </div>
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
    </div>
  </div>
);

// ── Sub-component: EventsPanel
const EventsPanel = ({ sessionLogs, knownNames }) => {
  const eventsOnly = sessionLogs.filter(log => log.event === 'ENTERED' || log.event === 'EXITED');
  const scrollRef = useRef(null);
  
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [eventsOnly.length]);

  return (
    <div className="flex-1 min-h-0 bg-gray-900/60 backdrop-blur-xl rounded-2xl flex flex-col overflow-hidden border border-white/10 shadow-lg">
      <div className="p-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2 text-sm uppercase tracking-wider">
          <Activity size={16} className="text-orange-400" /> Event Stream
        </h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {eventsOnly.length === 0 ? (
           <div className="p-8 text-center text-gray-500 text-sm">
             <Activity className="mx-auto mb-2 opacity-20" size={32} />
             No events yet.
           </div>
        ) : (
          eventsOnly.map((log, idx) => {
             const isEntry = log.event === 'ENTERED';
             const Icon = isEntry ? LogIn : LogOut;
             const color = isEntry ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20';
             const name = knownNames[log.identityId] || log.name || 'Unknown';
             
             return (
               <motion.div 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 key={idx} 
                 className="flex items-start gap-3"
               >
                 <div className={\`p-1.5 rounded-lg border \${color}\`}>
                   <Icon size={14} />
                 </div>
                 <div className="flex-1 min-w-0 pt-0.5 border-b border-white/5 pb-2">
                   <p className="text-xs text-gray-300">
                     <span className="font-bold text-gray-100">{name}</span> 
                     {isEntry ? ' entered' : ' exited'} the frame
                   </p>
                   <p className="text-[10px] text-gray-500 mt-1 font-mono tracking-wide">{formatTime(log.timestamp)}</p>
                 </div>
               </motion.div>
             )
          })
        )}
      </div>
    </div>
  );
};

// ── Sub-component: HistoryTimeline
const HistoryTimeline = ({ sessionLogs, knownNames }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const uniqueDetectionsMap = new Map();
  [...sessionLogs].forEach(log => {
    uniqueDetectionsMap.set(log.identityId, log);
  });
  
  let historyList = Array.from(uniqueDetectionsMap.values()).reverse();
  
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    historyList = historyList.filter(log => {
      const name = knownNames[log.identityId] || log.name || 'Unknown';
      return name.toLowerCase().includes(term) || log.identityId?.toLowerCase().includes(term);
    });
  }

  return (
    <div className="flex-1 min-h-0 bg-gray-900/60 backdrop-blur-xl rounded-2xl flex flex-col overflow-hidden border border-white/10 shadow-lg">
      <div className="p-4 border-b border-white/10 bg-black/20 flex flex-col gap-3">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2 text-sm uppercase tracking-wider">
          <History size={16} className="text-teal-400" /> Recent Log
        </h3>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search name or ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-gray-200 focus:outline-none focus:border-teal-500/50 transition-colors placeholder-gray-600"
          />
          <svg className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {historyList.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
             <History className="mx-auto mb-2 opacity-20" size={32} />
             No logs found
          </div>
        ) : (
          <div className="relative border-l-2 border-white/5 ml-5 pl-5 space-y-5 py-3">
            {historyList.map((log, idx) => {
              const resolvedName = knownNames[log.identityId] || log.name;
              const isKnown = resolvedName && resolvedName !== 'Unknown';
              const hue = idToHue(log.identityId);
              
              return (
                <div key={idx} className="relative">
                  <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-teal-500/20 border border-teal-500 flex items-center justify-center">
                    <div className="w-1 h-1 bg-teal-400 rounded-full" />
                  </div>
                  <div className="flex gap-3 items-center">
                    <div 
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-inner"
                      style={{ backgroundColor: \`hsl(\${hue}, 60%, 15%)\`, color: \`hsl(\${hue}, 70%, 70%)\` }}
                    >
                      {isKnown ? resolvedName[0].toUpperCase() : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-200 truncate">{isKnown ? resolvedName : 'Unknown'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500 font-mono truncate">{log.identityId}</span>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded">
                          <Clock size={10} /> {formatTime(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-component: PostSessionSummary
const PostSessionSummary = ({ summary, onViewHistory, onStartNew }) => {
  const [editingId, setEditingId] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [localFaces, setLocalFaces] = useState(summary?.mergedFaces || []);
  const [editFeedback, setEditFeedback] = useState({});

  useEffect(() => setLocalFaces(summary?.mergedFaces || []), [summary]);

  const handleEditSave = async (identityId) => {
    const name = editInput.trim();
    if (!name) return;
    setLocalFaces(prev => prev.map(f => f.identityId === identityId ? { ...f, name } : f));
    setEditingId(null);
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

  if (!summary) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-6">
      <div className="bg-gray-900/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
           <div>
              <h2 className="text-3xl font-extrabold text-white flex items-center gap-3">
                 <FileText className="text-indigo-400" size={32} /> Session Summary
              </h2>
              <p className="text-gray-400 mt-2 font-mono text-sm">
                 {formatTimestamp(summary.startedAt)} — {formatTimestamp(summary.endedAt)}
              </p>
           </div>
           <div className="flex gap-3">
              <button onClick={onViewHistory} className="px-5 py-2.5 rounded-xl font-semibold bg-gray-800 hover:bg-gray-700 text-white transition-colors flex items-center gap-2">
                 <History size={18} /> Analysis History
              </button>
              <button onClick={onStartNew} className="px-5 py-2.5 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-2">
                 <Play fill="currentColor" size={18} /> New Session
              </button>
           </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
           <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Faces Tracked</p>
              <p className="text-3xl font-black text-white">{localFaces.length}</p>
           </div>
           <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Entries</p>
              <p className="text-3xl font-black text-cyan-400">{summary.totalEntries}</p>
           </div>
           <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Exits</p>
              <p className="text-3xl font-black text-orange-400">{summary.totalExits}</p>
           </div>
           <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Duration</p>
              <p className="text-3xl font-black text-indigo-400">{Math.floor((summary.durationSec || 0) / 60)}m {(summary.durationSec || 0) % 60}s</p>
           </div>
        </div>

        <h3 className="text-lg font-bold text-gray-200 mb-4 border-b border-white/10 pb-2">Per-Person Activity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {localFaces.length === 0 ? (
             <p className="text-gray-500 italic col-span-full">No faces tracked in this session.</p>
           ) : (
             [...localFaces].sort((a,b) => (b.entryCount || 0) - (a.entryCount || 0)).map((face, idx) => {
                const hue = idToHue(face.identityId);
                const isKnown = !!face.name && face.name !== 'Unknown';
                const fb = editFeedback[face.identityId];
                
                return (
                  <div key={face.identityId || idx} className="bg-gray-800/40 p-4 rounded-2xl border border-white/5 flex gap-4 items-center transition-colors hover:bg-gray-800/60">
                     <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shadow-inner shrink-0" style={{ backgroundColor: \`hsl(\${hue}, 60%, 15%)\`, color: \`hsl(\${hue}, 70%, 70%)\` }}>
                        {isKnown ? face.name[0].toUpperCase() : '?'}
                     </div>
                     <div className="flex-1 min-w-0">
                        {editingId === face.identityId ? (
                           <div className="flex items-center gap-1 mb-1">
                              <input autoFocus type="text" value={editInput} onChange={e=>setEditInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') handleEditSave(face.identityId); if(e.key==='Escape') {setEditingId(null);setEditInput('');} }} className="bg-black/50 text-white text-sm px-2 py-1 rounded outline-none w-full border border-indigo-500/50" />
                              <button onClick={() => handleEditSave(face.identityId)} className="text-emerald-400 p-1 hover:bg-emerald-400/20 rounded"><Check size={14}/></button>
                              <button onClick={() => {setEditingId(null);setEditInput('');}} className="text-rose-400 p-1 hover:bg-rose-400/20 rounded"><X size={14}/></button>
                           </div>
                        ) : (
                           <div className="flex items-center gap-2 mb-1">
                              <p className={\`text-sm font-bold truncate \${isKnown ? 'text-white' : 'text-gray-400 italic'}\`}>{isKnown ? face.name : 'Unknown Person'}</p>
                              {isKnown && <button onClick={()=>{setEditingId(face.identityId);setEditInput(face.name);}} className="text-gray-500 hover:text-indigo-400 transition-colors"><Edit2 size={12}/></button>}
                              {!isKnown && <button onClick={()=>{setEditingId(face.identityId);setEditInput('');}} className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold hover:bg-indigo-500/40 transition-colors">Name?</button>}
                              {fb === 'saved' && <Check size={12} className="text-emerald-400"/>}
                           </div>
                        )}
                        <p className="text-[10px] text-gray-500 font-mono truncate">{face.identityId}</p>
                        <div className="flex gap-2 mt-2">
                           {(face.entryCount > 0 || face.exitCount > 0) ? (
                              <>
                                 {face.entryCount > 0 && <span className="text-[10px] font-bold bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">↑ {face.entryCount} Entries</span>}
                                 {face.exitCount > 0 && <span className="text-[10px] font-bold bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded">↓ {face.exitCount} Exits</span>}
                              </>
                           ) : (
                              <span className="text-[10px] font-bold bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded">Seen {face.appearanceCount || 1}×</span>
                           )}
                        </div>
                     </div>
                  </div>
                )
             })
           )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Sub-component: AnalysisHistoryView
const AnalysisHistoryView = ({ historicalSessions, onEditHistoryName }) => {
  const [expandedSessionId, setExpandedSessionId] = useState(null);

  if (!historicalSessions || historicalSessions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20 text-gray-500 bg-gray-900/30 rounded-3xl border border-white/5 backdrop-blur-sm">
        <History size={64} className="mb-4 opacity-20" />
        <h3 className="text-xl font-bold text-gray-300">No History Available</h3>
        <p className="text-sm mt-2">Complete a live tracking session to see analysis here.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6">
       <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-extrabold text-white flex items-center gap-3">
             <History className="text-teal-400" size={32} /> Analysis History
          </h2>
          <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-sm font-bold border border-gray-700">
             {historicalSessions.length} Sessions
          </span>
       </div>

       <div className="space-y-4">
          {[...historicalSessions].reverse().map((session, sIdx) => {
             const realIdx = historicalSessions.length - 1 - sIdx;
             const isExpanded = expandedSessionId === session.id;
             const duration = session.durationSec ? \`\${Math.floor(session.durationSec / 60)}m \${session.durationSec % 60}s\` : '—';
             
             return (
               <div key={session.id} className="bg-gray-900/60 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden transition-all duration-300 shadow-lg">
                  <button onClick={() => setExpandedSessionId(isExpanded ? null : session.id)} className="w-full p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition-colors text-left focus:outline-none">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                           <FileText size={24} />
                        </div>
                        <div>
                           <p className="text-lg font-bold text-white">{formatTimestamp(session.startedAt)}</p>
                           <p className="text-sm text-gray-400 font-mono mt-1">{session.faces?.length || 0} faces • {duration}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-6">
                        <div className="flex gap-4">
                           <div className="text-center">
                              <p className="text-xl font-black text-cyan-400">{session.totalEntries || 0}</p>
                              <p className="text-[10px] uppercase font-bold text-gray-500">Entries</p>
                           </div>
                           <div className="text-center">
                              <p className="text-xl font-black text-orange-400">{session.totalExits || 0}</p>
                              <p className="text-[10px] uppercase font-bold text-gray-500">Exits</p>
                           </div>
                        </div>
                        <div className={\`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center transition-transform \${isExpanded ? 'rotate-180 bg-white/10' : ''}\`}>
                           <ChevronDown size={18} className="text-gray-400" />
                        </div>
                     </div>
                  </button>

                  <AnimatePresence>
                     {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                           <div className="p-6 border-t border-white/10 bg-black/20 grid grid-cols-1 lg:grid-cols-2 gap-8">
                              {/* Session Logs summary */}
                              <div>
                                 <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Event Timeline</h4>
                                 <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                    {(session.logs || []).map((log, lIdx) => (
                                       <div key={lIdx} className="flex items-center gap-3 text-sm bg-gray-800/30 p-2 rounded-lg border border-white/5">
                                          <span className={\`w-6 h-6 flex items-center justify-center rounded-md shrink-0 \${log.event === 'ENTERED' ? 'bg-cyan-500/20 text-cyan-400' : log.event === 'EXITED' ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-500/20 text-gray-400'}\`}>
                                             {log.event === 'ENTERED' ? '↑' : log.event === 'EXITED' ? '↓' : '●'}
                                          </span>
                                          <span className="font-bold text-gray-200 flex-1 truncate">{log.name || 'Unknown'}</span>
                                          <span className="text-xs text-gray-500 font-mono">{formatTime(log.timestamp)}</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                              {/* Tracked Faces summary */}
                              <div>
                                 <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Tracked Identities</h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                    {(session.faces || []).map((face, fIdx) => {
                                       const hue = idToHue(face.identityId);
                                       const isKnown = !!face.name;
                                       return (
                                          <div key={fIdx} className="bg-gray-800/50 p-3 rounded-xl border border-white/5 flex gap-3 items-center">
                                             <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: \`hsl(\${hue}, 60%, 15%)\`, color: \`hsl(\${hue}, 70%, 70%)\` }}>
                                                {isKnown ? face.name[0].toUpperCase() : '?'}
                                             </div>
                                             <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-200 truncate">{isKnown ? face.name : 'Unknown'}</p>
                                                <p className="text-[10px] text-gray-500 font-mono truncate">{face.identityId}</p>
                                             </div>
                                          </div>
                                       )
                                    })}
                                 </div>
                              </div>
                           </div>
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>
             )
          })}
       </div>
    </motion.div>
  );
}

// ── Main: FaceTrackingDashboard
const FaceTrackingDashboard = () => {
  const [isLive, setIsLive] = useState(false);
  const [view, setView] = useState('live');
  const [detectedFaces, setDetectedFaces] = useState([]);
  const [sessionLogs, setSessionLogs] = useState([]);
  const [knownNames, setKnownNames] = useState({});
  const [faceLabelInputs, setFaceLabelInputs] = useState({});
  const [nameFeedback, setNameFeedback] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemStatus, setSystemStatus] = useState('System Offline');
  const [postSessionSummary, setPostSessionSummary] = useState(null);
  const [historicalSessions, setHistoricalSessions] = useState([]);

  const webcamRef = useRef(null);
  const containerRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const movementsIntervalRef = useRef(null);
  const lastFrameRef = useRef(null);
  const isLockedRef = useRef(false);
  const sessionStartRef = useRef(null);

  const hasSceneChanged = useCallback((imageSrc) => new Promise((resolve) => {
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

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (webcamRef.current) webcamRef.current.srcObject = stream;
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

  const captureAndSend = useCallback(async () => {
    if (!webcamRef.current || !isLive) return;
    const video = webcamRef.current;
    if (video.readyState < 2) return;

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
    const file = new File([blob], \`frame_\${Date.now()}.jpg\`, { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('frame', file);

    setIsProcessing(true);
    setSystemStatus('Analyzing...');

    try {
      const res = await fetch('/api/stream-frame', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        const detections = data.detections || [];
        setKnownNames(prev => {
          const updated = { ...prev };
          detections.forEach(face => {
            if (face.identityId && face.name && face.name !== 'Unknown') updated[face.identityId] = face.name;
          });
          return updated;
        });

        const facesWithBbox = detections.map((face, idx) => ({
          ...face,
          bbox: face.bbox || { x: 0.1 + (idx * 0.25) % 0.7, y: 0.1, w: 0.22, h: 0.35 },
        }));

        setDetectedFaces(facesWithBbox);
        isLockedRef.current = detections.length > 0;

        if (detections.length > 0) {
          const timestamp = new Date().toISOString();
          setSessionLogs(prev => {
            const newLogs = [];
            detections.forEach(face => {
              if (data.newEntries?.includes(face.identityId)) newLogs.push({ ...face, event: 'ENTERED', timestamp });
              else if (data.newExits?.includes(face.identityId)) newLogs.push({ ...face, event: 'EXITED', timestamp });
              else {
                const alreadyLogged = prev.some(l => l.identityId === face.identityId);
                if (!alreadyLogged) newLogs.push({ ...face, event: 'DETECTED', timestamp });
              }
            });
            return [...prev, ...newLogs];
          });

          const names = detections.map(f => knownNames[f.identityId] || f.name).filter(n => n && n !== 'Unknown');
          setSystemStatus(\`🎯 Tracking: \${names.length > 0 ? names.join(', ') : \`\${detections.length} face(s)\`}\`);
        } else {
          isLockedRef.current = false;
          setDetectedFaces([]);
          setSystemStatus('🔍 Scanning...');
        }
      }
    } catch (err) {
      console.error('[FTD] Frame analysis error:', err);
      setSystemStatus('⚠️ Pipeline error');
    } finally {
      setIsProcessing(false);
    }
  }, [isLive, hasSceneChanged, knownNames]);

  const handleStartSession = useCallback(async () => {
    setSessionLogs([]); setDetectedFaces([]); setFaceLabelInputs({}); setNameFeedback({});
    isLockedRef.current = false; lastFrameRef.current = null;
    sessionStartRef.current = new Date().toISOString();
    setPostSessionSummary(null);
    try { await fetch('/api/start-stream-analysis', { method: 'POST' }); } catch {}
    await startCamera();
    setIsLive(true); setView('live'); setSystemStatus('🔍 Scanning...');
  }, [startCamera]);

  const handleEndSession = useCallback(async () => {
    clearInterval(captureIntervalRef.current); clearInterval(movementsIntervalRef.current);
    setIsLive(false); setSystemStatus('⏳ Compiling session report...');
    const endedAt = new Date().toISOString();

    try {
      const [sessionRes, movementsRes] = await Promise.all([
        fetch('/api/session/end', { method: 'POST' }).catch(() => null),
        fetch('/api/movements').catch(() => null),
      ]);

      let mergedFaces = []; let totalEntries = 0; let totalExits = 0; let durationSec = 0;

      if (sessionRes) {
        const sessionData = await sessionRes.json().catch(() => ({}));
        const movementsData = movementsRes ? await movementsRes.json().catch(() => ({})) : {};
        const latestMovements = movementsData.movements || [];
        const movMap = {}; latestMovements.forEach(m => { movMap[m.identityId] = m; });

        mergedFaces = (sessionData.report?.faces || []).map(face => ({
          ...face,
          name: knownNames[face.identityId] || (movMap[face.identityId]?.name && movMap[face.identityId].name !== 'Unknown' ? movMap[face.identityId].name : null),
          entryCount: movMap[face.identityId]?.entryCount || 0,
          exitCount: movMap[face.identityId]?.exitCount || 0,
        }));

        durationSec = sessionData.report?.durationSec || 0;
        totalEntries = sessionData.report?.totalEntries || 0;
        totalExits = sessionData.report?.totalExits || 0;
      } else {
        const seenIds = {};
        sessionLogs.forEach(log => {
          if (!seenIds[log.identityId]) seenIds[log.identityId] = { identityId: log.identityId, name: knownNames[log.identityId] || log.name || null, entryCount: 0, exitCount: 0, appearanceCount: 0 };
          if (log.event === 'ENTERED') seenIds[log.identityId].entryCount++;
          else if (log.event === 'EXITED') seenIds[log.identityId].exitCount++;
          else seenIds[log.identityId].appearanceCount++;
        });
        mergedFaces = Object.values(seenIds);
        const ms = sessionStartRef.current ? (new Date(endedAt) - new Date(sessionStartRef.current)) : 0;
        durationSec = Math.round(ms / 1000);
      }

      const summary = { id: \`session_\${Date.now()}\`, startedAt: sessionStartRef.current, endedAt, durationSec, totalEntries, totalExits, mergedFaces, logs: [...sessionLogs] };
      setPostSessionSummary(summary);
      setHistoricalSessions(prev => [...prev, { ...summary, faces: mergedFaces }]);
      setSystemStatus(\`✅ Done — \${mergedFaces.length} face(s) tracked\`);
    } catch (err) {
      console.error('[FTD] Stop session error:', err);
      setSystemStatus('⚠️ Failed to compile session report');
    }
    stopCamera(); setView('post-session');
  }, [knownNames, sessionLogs, stopCamera]);

  useEffect(() => {
    if (isLive) captureIntervalRef.current = setInterval(captureAndSend, 2000);
    else { clearInterval(captureIntervalRef.current); clearInterval(movementsIntervalRef.current); }
    return () => { clearInterval(captureIntervalRef.current); clearInterval(movementsIntervalRef.current); };
  }, [isLive, captureAndSend]);

  const handleFaceLabelChange = useCallback((identityId, value) => {
    setFaceLabelInputs(prev => ({ ...prev, [identityId]: value }));
  }, []);

  const handleFaceLabelSave = useCallback(async (identityId) => {
    const name = (faceLabelInputs[identityId] || '').trim();
    if (!name) return;

    setKnownNames(prev => ({ ...prev, [identityId]: name }));
    setFaceLabelInputs(prev => { const n = { ...prev }; delete n[identityId]; return n; });
    setNameFeedback(prev => ({ ...prev, [identityId]: null }));

    setSessionLogs(prev => prev.map(log => log.identityId === identityId ? { ...log, name } : log));

    try {
      const res = await fetch('/api/history/update-name', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identityId, newName: name }) });
      const data = await res.json();
      setNameFeedback(prev => ({ ...prev, [identityId]: data.success ? 'saved' : 'error' }));
    } catch {
      setNameFeedback(prev => ({ ...prev, [identityId]: 'error' }));
    }
    setTimeout(() => setNameFeedback(prev => ({ ...prev, [identityId]: null })), 2000);
  }, [faceLabelInputs]);

  // Derive stats for Live Statistics Panel
  const uniqueIds = new Set(sessionLogs.map(l => l.identityId));
  const uniquePeople = uniqueIds.size;
  const totalDetections = sessionLogs.length;
  let knownPeopleCount = 0; let unknownPeopleCount = 0; let entryCount = 0; let exitCount = 0;
  const latestStatusMap = {};
  sessionLogs.forEach(log => {
    if (log.event === 'ENTERED') entryCount++;
    if (log.event === 'EXITED') exitCount++;
    latestStatusMap[log.identityId] = knownNames[log.identityId] || log.name;
  });
  Object.values(latestStatusMap).forEach(name => {
    if (name && name !== 'Unknown') knownPeopleCount++; else unknownPeopleCount++;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 font-sans">
      <div className="max-w-[1600px] mx-auto w-full p-4 lg:p-6 flex flex-col h-full">
        <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Activity className="text-indigo-500" size={32} />
              Live Tracking Panel
            </h1>
            <p className="text-gray-400 mt-1 font-medium">Real-time detection • Recognition • Session analytics</p>
          </div>
          <div className="flex items-center gap-4">
             <div className={\`px-4 py-2 rounded-full border shadow-lg flex items-center gap-2 font-bold text-sm transition-all \${isLive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-gray-800/50 border-white/10 text-gray-400'}\`}>
                <span className={\`w-2.5 h-2.5 rounded-full \${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}\`} />
                {systemStatus}
                {isProcessing && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="ml-2 w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full" />}
             </div>
          </div>
        </header>

        <div className="flex items-center gap-2 mb-8 border-b border-white/10 pb-4">
          <button onClick={() => setView('live')} className={\`px-5 py-2.5 rounded-xl font-bold transition-all \${view === 'live' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}\`}>Live Session</button>
          {postSessionSummary && (
            <button onClick={() => setView('post-session')} className={\`px-5 py-2.5 rounded-xl font-bold transition-all \${view === 'post-session' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}\`}>Session Summary</button>
          )}
          <button onClick={() => setView('history')} className={\`px-5 py-2.5 rounded-xl font-bold transition-all \${view === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}\`}>Analysis History</button>
        </div>

        <div className="flex-1 min-h-0">
          {view === 'live' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[700px]">
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="relative group">
                   <CameraOverlay webcamRef={webcamRef} detectedFaces={detectedFaces} isLive={isLive} containerRef={containerRef} knownNames={knownNames} faceLabelInputs={faceLabelInputs} onFaceLabelChange={handleFaceLabelChange} onFaceLabelSave={handleFaceLabelSave} nameFeedback={nameFeedback} />
                   <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center z-10">
                      {!isLive ? (
                         <button onClick={handleStartSession} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-2xl font-black text-lg flex items-center gap-3 shadow-xl shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95">
                           <Play fill="currentColor" size={20} /> Start Live Tracking
                         </button>
                      ) : (
                         <button onClick={handleEndSession} className="bg-rose-600/90 backdrop-blur-md border border-rose-500/50 hover:bg-rose-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-rose-500/30 transition-all hover:scale-105 active:scale-95">
                           <Square fill="currentColor" size={18} /> End Session
                         </button>
                      )}
                   </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard icon={Activity} label="Total Detections" value={totalDetections} colorClass="border-blue-500" />
                  <StatCard icon={Users} label="Unique People" value={uniquePeople} colorClass="border-purple-500" />
                  <StatCard icon={UserCheck} label="Known People" value={knownPeopleCount} colorClass="border-emerald-500" />
                  <StatCard icon={UserX} label="Unknown People" value={unknownPeopleCount} colorClass="border-rose-500" />
                  <StatCard icon={LogIn} label="Total Entries" value={entryCount} colorClass="border-cyan-500" />
                  <StatCard icon={LogOut} label="Total Exits" value={exitCount} colorClass="border-orange-500" />
                </div>
              </div>
              
              <div className="lg:col-span-4 flex flex-col gap-6 h-[800px] lg:h-auto lg:max-h-[calc(100vh-14rem)]">
                 <DetectedPersonsList detectedFaces={detectedFaces} knownNames={knownNames} />
                 <EventsPanel sessionLogs={sessionLogs} knownNames={knownNames} />
                 <HistoryTimeline sessionLogs={sessionLogs} knownNames={knownNames} />
              </div>
            </div>
          )}

          {view === 'post-session' && postSessionSummary && <PostSessionSummary summary={postSessionSummary} onViewHistory={() => setView('history')} onStartNew={() => { setView('live'); setPostSessionSummary(null); }} />}
          {view === 'history' && <AnalysisHistoryView historicalSessions={historicalSessions} onEditHistoryName={() => {}} />}
        </div>
      </div>
    </div>
  );
};

export default FaceTrackingDashboard;
`

fs.writeFileSync('src/components/FaceTrackingDashboard.jsx', fileContent);
console.log('Successfully wrote FaceTrackingDashboard.jsx');
