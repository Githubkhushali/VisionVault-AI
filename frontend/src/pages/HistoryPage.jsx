import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Trash2, RefreshCw, List, Activity, Filter, ArrowDownUp, ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react';
import LogAnalysisDashboard from '../components/LogAnalysisDashboard';

const STATUS_STYLES = {
  verified: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  anomaly: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

function ConfidenceBar({ value }) {
  const color = value >= 85 ? '#34d399' : value >= 75 ? '#fbbf24' : '#fb7185';
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-1.5 bg-gray-800 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${value || 0}%`, backgroundColor: color }} />
      </div>
      <span className="font-bold tabular-nums" style={{ fontSize: '13px', color }}>{value || 0}%</span>
    </div>
  );
}

function StatusBadge({ type }) {
  const map = {
    image: { label: 'Image', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    video: { label: 'Video', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'video-face': { label: 'Video Face', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    live: { label: 'Live Stream', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  };
  const style = map[type] || { label: type, cls: 'bg-gray-800 text-gray-400 border-gray-700' };
  return (
    <span className={`px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${style.cls}`}>
      {style.label}
    </span>
  );
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sessions');
  const [filterType, setFilterType] = useState('all');
  const [sortDir, setSortDir] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/analytics/sessions');
      setSessions(res.data.sessions || []);
    } catch (e) {
      console.error('Failed to fetch history:', e);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Failed to fetch sessions' } }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleClearAll = async () => {
    if (!window.confirm('Clear all session records from the database? This action cannot be undone.')) return;
    try {
      await axios.delete('/api/analytics/sessions');
      setSessions([]);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'All records deleted successfully.' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Failed to clear history.' } }));
    }
  };

  const exportCSV = () => {
    if (!sessions.length) return;
    const headers = ['ID', 'Filename', 'Type', 'Processed At', 'People Count', 'Unique Identities', 'Average Confidence', 'S3 URL'];
    const csvContent = [
      headers.join(','),
      ...sessions.map(s => [
        s.id,
        `"${s.filename}"`,
        s.type,
        `"${s.processedAt}"`,
        s.peopleCount,
        s.uniqueIdentitiesCount,
        s.averageConfidence,
        s.s3Url || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visionvault_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Exported records to CSV' } }));
  };

  const filtered = sessions
    .filter(s => filterType === 'all' || s.type === filterType)
    .filter(s => !searchQuery || (s.filename || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const da = new Date(a.sort_time || 0);
      const db = new Date(b.sort_time || 0);
      return sortDir === 'desc' ? db - da : da - db;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="animate-in fade-in duration-500 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-white font-extrabold text-3xl">Detection History</h2>
          <p className="text-gray-400 mt-2 font-medium">Audit and review all processed sessions across image, video, and live streams.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-white/10 text-white hover:bg-white/10 transition-all font-bold text-sm">
            <Download size={16} /> Export CSV
          </button>
          {sessions.length > 0 && (
            <button onClick={handleClearAll} className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-all font-bold text-sm">
              <Trash2 size={16} /> Clear All
            </button>
          )}
          <button onClick={fetchSessions} className="flex items-center gap-2 px-4 py-2.5 rounded-sm bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all text-sm shadow-lg shadow-indigo-500/20">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'sessions', icon: List, label: 'Session Logs' },
          { id: 'logs', icon: Activity, label: 'Log Analysis' },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-900/60 backdrop-blur-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} /> {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'logs' ? (
        <LogAnalysisDashboard />
      ) : (
        <>
          {/* Filters */}
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-sm p-4 mb-6 flex flex-wrap items-center gap-4 border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/10 rounded-sm w-full md:w-auto">
              <Filter size={16} className="text-gray-400" />
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="bg-transparent border-none text-white focus:ring-0 cursor-pointer outline-none text-sm font-medium w-full">
                <option value="all" className="bg-gray-900">All Types</option>
                <option value="image" className="bg-gray-900">Images</option>
                <option value="video" className="bg-gray-900">Videos</option>
                <option value="live" className="bg-gray-900">Live Streams</option>
              </select>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/10 rounded-sm w-full md:w-auto">
              <ArrowDownUp size={16} className="text-gray-400" />
              <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="bg-transparent border-none text-white focus:ring-0 cursor-pointer outline-none text-sm font-medium w-full">
                <option value="desc" className="bg-gray-900">Newest First</option>
                <option value="asc" className="bg-gray-900">Oldest First</option>
              </select>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/10 rounded-sm w-full md:w-64">
              <input type="text" placeholder="Search filename..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }} className="bg-transparent border-none text-white focus:ring-0 outline-none text-sm font-medium w-full placeholder-gray-600" />
            </div>
            <span className="ml-auto text-gray-500 font-bold text-sm">
              {filtered.length} session{filtered.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {/* Table */}
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-sm overflow-hidden border border-white/10 shadow-xl mb-6">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="border-b border-white/10 bg-black/40">
                  <tr>
                    {['Filename', 'Type', 'Processed At', 'People', 'Confidence', 'S3 Asset'].map(col => (
                      <th key={col} className="px-6 py-4 text-gray-400 uppercase tracking-widest text-[10px] font-black">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : paginated.length > 0 ? paginated.map(s => (
                    <tr key={s.id} className="group hover:bg-white/5 transition-colors duration-200">
                      <td className="px-6 py-4">
                        <span className="font-bold text-white text-sm">{s.filename}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge type={s.type} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white font-medium text-sm">
                          {s.processedAt || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-white font-bold text-sm">
                          {s.peopleCount || 0}
                          {s.uniqueIdentitiesCount ? <span className="text-indigo-400"> ({s.uniqueIdentitiesCount} unique)</span> : ''}
                        </span>
                        {s.people && s.people.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {s.people.filter(p => p.s3CropUrl).slice(0, 5).map((p, i) => (
                              <img key={i} src={p.s3CropUrl} alt={p.identityId} className="w-8 h-8 rounded-sm object-cover border-2 border-gray-800" onError={e => { e.target.style.display = 'none'; }} />
                            ))}
                            {s.people.length > 5 && (
                              <div className="w-8 h-8 rounded-sm bg-gray-800 border-2 border-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                +{s.people.length - 5}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <ConfidenceBar value={s.averageConfidence} />
                      </td>
                      <td className="px-6 py-4">
                        {s.s3Url ? (
                          <a href={s.s3Url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold text-xs transition-colors">
                            <ExternalLink size={14} /> {s.type === 'live' ? 'View Log' : 'Open'}
                          </a>
                        ) : s.type === 'live' ? (
                          <span className="text-gray-500 font-medium text-[10px] uppercase tracking-widest">N/A (Live)</span>
                        ) : (
                          <span className="text-gray-600 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-4 text-gray-500">
                          <List size={48} className="opacity-20" />
                          <p className="font-medium text-sm">No sessions found matching your criteria.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > PER_PAGE && (
              <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-gray-400 font-medium text-sm">
                  Showing <span className="text-white font-bold">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)}</span> of{' '}
                  <span className="text-white font-bold">{filtered.length}</span> results
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-9 h-9 flex items-center justify-center rounded-sm border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 flex items-center justify-center rounded-sm font-bold transition-colors text-sm ${page === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-500/50' : 'border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-9 h-9 flex items-center justify-center rounded-sm border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
