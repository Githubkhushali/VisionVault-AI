import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Copy, Download, UserCheck, UserX, X, RefreshCw } from 'lucide-react';

function IdentityModal({ identity, onClose, onNameSaved }) {
  const [nameInput, setNameInput] = useState(identity?.name || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!identity) return null;

  const isKnown = !!identity.name;

  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/history/update-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: identity.id, newName: name }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback('saved');
        setTimeout(() => { onNameSaved(); onClose(); }, 1200);
      } else {
        setFeedback('error');
      }
    } catch {
      setFeedback('error');
    } finally {
      setSaving(false);
    }
  };
  const handleCopyId = () => {
    navigator.clipboard.writeText(identity.id);
    window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Identity ID copied to clipboard!' } }));
  };

  const handleDownload = () => {
    if (!identity.canonicalFaceUrl) return;
    const a = document.createElement('a');
    a.href = identity.canonicalFaceUrl;
    a.download = `face_${identity.name || identity.id}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Download started' } }));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-2xl rounded-sm overflow-hidden border border-white/10 shadow-[0_32px_64px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex gap-0">
          {/* Left: face image */}
          <div className="w-64 flex-shrink-0 relative bg-surface-container-lowest">
            {identity.canonicalFaceUrl ? (
              <img
                src={identity.canonicalFaceUrl}
                alt={identity.name || 'Unknown'}
                className="w-full h-full object-cover"
                style={{ minHeight: '280px' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full flex items-center justify-center" style={{ minHeight: '280px' }}>
                <div
                  className="w-24 h-24 rounded-sm flex items-center justify-center font-black border-4"
                  style={{
                    fontSize: '40px',
                    background: isKnown ? '#064e3b' : '#1f2937',
                    borderColor: isKnown ? '#34d399' : '#374151',
                    color: isKnown ? '#34d399' : '#9ca3af',
                  }}
                >
                  {isKnown ? identity.name[0].toUpperCase() : '?'}
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#121212] hidden md:block pointer-events-none" />
          </div>

          {/* Right: details */}
          <div className="flex-1 p-8 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-primary font-bold" style={{ fontSize: '28px', letterSpacing: '-0.02em' }}>
                  {identity.name || <em className="text-on-surface-variant font-normal" style={{ fontStyle: 'italic' }}>Unknown</em>}
                </h3>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-1 rounded border font-bold uppercase tracking-wide ${
                      isKnown
                        ? 'bg-tertiary-fixed/10 text-tertiary-fixed border-tertiary-fixed/20'
                        : 'bg-error/10 text-error border-error/20'
                    }`}
                  >
                    {isKnown ? 'Identified' : 'Unrecognized'}
                  </span>
                <span className="text-xs px-2 py-1 rounded border border-white/10 text-on-surface-variant bg-white/5">
                    {identity.totalAppearances} appearance{identity.totalAppearances !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-sm bg-white/5 hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-3 mb-6">
              <button onClick={handleCopyId} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-sm bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors text-sm border border-white/5">
                <Copy size={16} /> Copy ID
              </button>
              {identity.canonicalFaceUrl && (
                <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-sm bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-medium transition-colors text-sm border border-indigo-500/20">
                  <Download size={16} /> Download Image
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-sm bg-white/5 border border-white/5">
                <p className="text-on-surface-variant mb-1" style={{ fontSize: '11px' }}>Unique ID</p>
                <p className="text-primary font-mono" style={{ fontSize: '12px', wordBreak: 'break-all' }}>{identity.id}</p>
              </div>
              <div className="p-3 rounded-sm bg-white/5 border border-white/5">
                <p className="text-on-surface-variant mb-1" style={{ fontSize: '11px' }}>Last Seen</p>
                <p className="text-primary" style={{ fontSize: '13px' }}>{identity.lastSeen || 'N/A'}</p>
              </div>
              {identity.entryCount != null && (
                <div className="p-3 rounded-sm bg-white/5 border border-white/5">
                  <p className="text-on-surface-variant mb-1" style={{ fontSize: '11px' }}>Entries</p>
                  <p className="text-tertiary-fixed font-bold" style={{ fontSize: '18px' }}>▲ {identity.entryCount}</p>
                </div>
              )}
              {identity.exitCount > 0 && (
                <div className="p-3 rounded-sm bg-white/5 border border-white/5">
                  <p className="text-on-surface-variant mb-1" style={{ fontSize: '11px' }}>Exits</p>
                  <p className="text-error font-bold" style={{ fontSize: '18px' }}>▼ {identity.exitCount}</p>
                </div>
              )}
            </div>

            {/* Name input */}
            <div className="space-y-2 mt-auto">
              <p className="text-on-surface-variant" style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isKnown ? 'Update Name' : 'Assign Name'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Enter name..."
                  className="flex-1 bg-surface-container border border-white/10 rounded-sm px-4 py-2.5 text-primary focus:border-primary-fixed outline-none transition-all"
                  style={{ fontSize: '13px' }}
                  id={`name-input-${identity.id}`}
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !nameInput.trim()}
                  className="px-5 py-2.5 rounded-sm bg-primary-fixed text-on-primary-fixed font-semibold inner-glow hover:opacity-90 disabled:opacity-40 transition-all"
                  style={{ fontSize: '13px' }}
                >
                  {saving ? '…' : feedback === 'saved' ? '✓ Saved' : feedback === 'error' ? '✗ Error' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryCard({ identity, onClick }) {
  const isKnown = !!identity.name;
  return (
    <div
      className="glass-card rounded-sm overflow-hidden group cursor-pointer hover:-translate-y-1 transition-all duration-300"
      onClick={() => onClick(identity)}
    >
      {/* Face image */}
      <div className="relative overflow-hidden bg-surface-container" style={{ aspectRatio: '1' }}>
        {identity.canonicalFaceUrl ? (
          <img
            src={identity.canonicalFaceUrl}
            alt={identity.name || 'Unknown'}
            loading="lazy"
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 scale-105 group-hover:scale-100 transition-all duration-500"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-20 h-20 rounded-sm flex items-center justify-center font-black"
              style={{
                fontSize: '32px',
                background: isKnown ? '#064e3b' : '#1f2937',
                color: isKnown ? '#34d399' : '#9ca3af',
              }}
            >
              {isKnown ? identity.name[0].toUpperCase() : '?'}
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 right-3">
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border font-bold backdrop-blur-md ${
            isKnown
              ? 'bg-tertiary-container/10 text-tertiary-fixed-dim border-tertiary-fixed-dim/20'
              : 'bg-error-container/10 text-error border-error/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isKnown ? 'bg-tertiary-fixed-dim pulse-dot' : 'bg-error'}`} />
            {isKnown ? 'Identified' : 'Unknown'}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
          <div className="flex justify-between items-end">
            <div>
              <p className={`uppercase tracking-wider font-bold mb-0.5 ${isKnown ? 'text-primary-fixed-dim' : 'text-error'}`} style={{ fontSize: '10px' }}>Subject</p>
              <p className="text-primary font-bold" style={{ fontSize: '18px' }}>
                {identity.name || 'Unknown'}
              </p>
            </div>
            <div className="text-right">
              <p className={`uppercase tracking-wider font-bold mb-0.5 ${isKnown ? 'text-primary-fixed-dim' : 'text-error'}`} style={{ fontSize: '10px' }}>Appearances</p>
              <p className="text-primary font-bold" style={{ fontSize: '18px' }}>{identity.totalAppearances}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 flex justify-between items-center bg-surface-container-lowest/50">
        <div>
          <p className="text-on-surface-variant" style={{ fontSize: '11px', opacity: 0.6 }}>Last Seen</p>
          <p className="text-on-surface" style={{ fontSize: '13px' }}>{identity.lastSeen || 'Never'}</p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant opacity-40 group-hover:opacity-100 transition-opacity" style={{ fontSize: '18px' }}>
          {isKnown ? 'arrow_forward' : 'warning'}
        </span>
      </div>
    </div>
  );
}

export default function FaceGalleryPage() {
  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/analytics/identities');
      setIdentities(res.data || []);
    } catch (e) {
      console.error('Failed to fetch identities:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIdentities(); }, [fetchIdentities]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelectedIdentity(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = identities
    .filter(id => filterStatus === 'all' || (filterStatus === 'known' ? !!id.name : !id.name))
    .filter(id => !searchQuery || (id.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || id.id.toLowerCase().includes(searchQuery.toLowerCase()));

  const knownCount = identities.filter(i => !!i.name).length;
  const unknownCount = identities.filter(i => !i.name).length;

  return (
    <div className="animate-entrance">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-primary font-bold" style={{ fontSize: '32px', letterSpacing: '-0.02em' }}>Face Gallery</h2>
          <p className="text-on-surface-variant mt-2 max-w-2xl" style={{ fontSize: '15px' }}>
            Manage and verify captured biometric data. AI-powered multi-point structural analysis with high precision face recognition.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchIdentities}
            className="flex items-center gap-2 px-4 py-2 rounded-sm bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
            style={{ fontSize: '13px' }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Identities', val: identities.length, color: 'text-primary' },
          { label: 'Identified', val: knownCount, color: 'text-tertiary-fixed' },
          { label: 'Unrecognized', val: unknownCount, color: 'text-error' },
        ].map(({ label, val, color }) => (
          <div key={label} className="glass-card rounded-sm p-4 inner-glow text-center">
            <div className={`font-bold ${color}`} style={{ fontSize: '28px' }}>{val}</div>
            <div className="text-on-surface-variant" style={{ fontSize: '12px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'known', label: 'Identified' },
            { id: 'unknown', label: 'Unrecognized' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`px-4 py-1.5 rounded-full font-medium transition-all ${
                filterStatus === f.id
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'border border-white/10 text-on-surface-variant hover:bg-white/5'
              }`}
              style={{ fontSize: '13px' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '16px' }}>search</span>
          <input
            type="text"
            placeholder="Search by name or ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-surface-container border border-white/10 rounded-sm py-1.5 pl-9 pr-4 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary-fixed outline-none transition-all"
            style={{ fontSize: '13px', width: '220px' }}
          />
        </div>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="glass-card rounded-sm overflow-hidden animate-pulse">
              <div className="bg-white/5" style={{ aspectRatio: '1' }} />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-white/5 rounded w-2/3" />
                <div className="h-2 bg-white/5 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-8">
          {filtered.map(identity => (
            <GalleryCard key={identity.id} identity={identity} onClick={setSelectedIdentity} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '56px', opacity: 0.2 }}>face</span>
          <p style={{ fontSize: '15px' }}>No identities found.</p>
          <p style={{ fontSize: '13px', opacity: 0.6 }}>Upload images or run a live session to start tracking faces.</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedIdentity && (
        <IdentityModal
          identity={selectedIdentity}
          onClose={() => setSelectedIdentity(null)}
          onNameSaved={fetchIdentities}
        />
      )}
    </div>
  );
}
