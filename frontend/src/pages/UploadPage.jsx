import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, FileVideo, Image as ImageIcon, Video, CheckCircle2, AlertCircle, RefreshCw, XCircle, Copy, ExternalLink, Activity, Server, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];
const ALLOWED_VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm'];

function ResultBadge({ children, variant = 'neutral' }) {
  const classes = {
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    neutral: 'bg-white/5 text-gray-400 border border-white/10',
    error: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold ${classes[variant]}`} style={{ fontSize: '11px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

function UploadHistoryCard({ item }) {
  return (
    <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-sm overflow-hidden group cursor-pointer hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="h-40 relative overflow-hidden bg-black/40">
        <img
          src={item.s3Url}
          alt={item.filename}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md" style={{ fontSize: '10px', color: '#fff', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {item.type === 'video-face' ? 'Video Face' : item.type === 'video' ? 'Video' : 'Image'}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="p-4">
        <p className="text-white font-bold truncate text-sm">{item.filename}</p>
        <div className="flex justify-between items-center mt-2">
          <span className="text-gray-500 font-medium text-xs flex items-center gap-1">
            <Clock size={12} />
            {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '—'}
          </span>
          {item.confidence && (
            <span className="text-indigo-400 font-black text-xs">{item.confidence}% CONF</span>
          )}
        </div>
        {item.s3Url && (
          <a
            href={item.s3Url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 text-indigo-400/80 hover:text-indigo-400 font-semibold transition-colors text-xs"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink size={14} /> View in S3
          </a>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState('image');

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [videoFile, setVideoFile] = useState(null);
  const [videoIsLoading, setVideoIsLoading] = useState(false);
  const [videoResult, setVideoResult] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [videoIsDragging, setVideoIsDragging] = useState(false);

  const [history, setHistory] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await axios.get('/api/history');
      const sessions = res.data.sessions || [];
      const items = [];
      for (const s of sessions) {
        if (s.type === 'image') {
          if (s.people && s.people.length > 0) {
            s.people.forEach((p, idx) => {
              items.push({ id: `${s.id}_p${p.trackId}`, filename: s.people.length > 1 ? `${s.filename} — Face ${idx + 1}` : s.filename, timestamp: s.processedAt, s3Url: p.s3CropUrl || s.s3Url, confidence: p.averageConfidence, type: 'image' });
            });
          } else {
            items.push({ id: s.id, filename: s.filename, timestamp: s.processedAt, s3Url: s.s3Url, confidence: s.averageConfidence, type: 'image' });
          }
        } else if (s.type === 'video') {
          if (s.people && s.people.length > 0) {
            s.people.forEach((p, idx) => {
              if (p.s3CropUrl) items.push({ id: `${s.id}_p${p.trackId}`, filename: `${s.filename} — Face ${idx + 1}`, timestamp: s.processedAt, s3Url: p.s3CropUrl, confidence: p.averageConfidence, type: 'video-face' });
            });
          }
          if (s.s3Url) items.push({ id: s.id, filename: s.filename, timestamp: s.processedAt, s3Url: s.s3Url, confidence: s.averageConfidence, type: 'video' });
        }
      }
      setHistory(items);
    } catch (e) { console.error('Failed to fetch history:', e); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const processFile = useCallback((file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Unsupported type. Use JPEG, PNG, WEBP, or GIF.'); return; }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { setError(`File too large. Max ${MAX_IMAGE_SIZE_MB} MB.`); return; }
    setError(null); setResult(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsLoading(true); setResult(null); setError(null);
    const fd = new FormData(); fd.append('image', selectedFile);
    try {
      const res = await axios.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      setResult(res.data);
      if (res.data.success) {
        await fetchHistory();
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Image processed successfully!' } }));
      }
    } catch (err) {
      setError(err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Request timed out.' : 'Network error. Is the backend running?'));
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Upload failed' } }));
    } finally { setIsLoading(false); }
  };

  const handleReset = () => {
    setSelectedFile(null); setPreviewUrl(null); setResult(null); setError(null); setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processVideoFile = useCallback((file) => {
    if (!file) return;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_VIDEO_TYPES.includes(file.type) && !ALLOWED_VIDEO_EXTS.includes(ext)) { setVideoError('Unsupported type. Use MP4, MOV, MKV, or WEBM.'); return; }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) { setVideoError(`File too large. Max ${MAX_VIDEO_SIZE_MB} MB.`); return; }
    setVideoError(null); setVideoResult(null); setVideoFile(file);
  }, []);

  const handleVideoDrop = (e) => { e.preventDefault(); setVideoIsDragging(false); processVideoFile(e.dataTransfer.files[0]); };

  const handleVideoUpload = async () => {
    if (!videoFile) return;
    setVideoIsLoading(true); setVideoResult(null); setVideoError(null);
    const fd = new FormData(); fd.append('video', videoFile);
    try {
      const res = await axios.post('/api/upload-video', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
      setVideoResult(res.data);
      if (res.data.success) {
        await fetchHistory();
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Video processed successfully!' } }));
      }
    } catch (err) {
      setVideoError(err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Video processing timed out.' : 'Network error. Is the backend running?'));
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Video upload failed' } }));
    } finally { setVideoIsLoading(false); }
  };

  const handleVideoReset = () => {
    setVideoFile(null); setVideoResult(null); setVideoError(null); setVideoIsLoading(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => { 
      setCopiedId(id); 
      setTimeout(() => setCopiedId(null), 2000); 
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'info', message: 'URL copied!' } }));
    });
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-white font-extrabold text-3xl">Upload Assets</h2>
        <p className="text-gray-400 mt-2 font-medium">Securely upload images and videos for deep neural analysis and cloud storage.</p>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-3 mb-8">
        {[
          { id: 'image', icon: ImageIcon, label: 'Image Upload' },
          { id: 'video', icon: Video, label: 'Video Upload' },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-900/60 backdrop-blur-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Upload area */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'image' ? (
            <motion.div
              layout
              className={`bg-gray-900/40 backdrop-blur-xl rounded-sm p-12 border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500/60 hover:bg-indigo-500/5 transition-all group relative overflow-hidden ${
                isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={handleDrop}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <div className="w-full max-w-md">
                  <img src={previewUrl} alt="Preview" className="w-full rounded-sm object-cover shadow-2xl max-h-80" />
                  <div className="mt-4 text-gray-400 text-sm font-medium">
                    <span className="text-white font-bold">{selectedFile?.name}</span>
                    {' · '}{(selectedFile?.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6 w-24 h-24 bg-indigo-500/10 rounded-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-500 group-hover:bg-indigo-500/20 text-indigo-400">
                    <UploadCloud size={48} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-white font-bold text-xl mb-2">Drag and drop your image here</h3>
                  <p className="text-gray-500 mb-8 max-w-sm font-medium">Support for JPEG, PNG, WEBP, GIF up to {MAX_IMAGE_SIZE_MB} MB</p>
                  <button className="bg-white/10 text-white border border-white/20 px-8 py-3 rounded-sm font-bold hover:bg-white/20 transition-colors">
                    Browse Files
                  </button>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              layout
              className={`bg-gray-900/40 backdrop-blur-xl rounded-sm p-12 border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all group relative overflow-hidden ${
                videoIsDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700'
              }`}
              onDragOver={(e) => { e.preventDefault(); setVideoIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setVideoIsDragging(false); }}
              onDrop={handleVideoDrop}
              onClick={() => !videoFile && videoInputRef.current?.click()}
            >
              {videoFile ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-sm flex items-center justify-center text-emerald-400">
                    <FileVideo size={40} />
                  </div>
                  <p className="text-white font-bold text-lg">{videoFile.name}</p>
                  <p className="text-gray-400 font-medium">{(videoFile.size / 1024 / 1024).toFixed(2)} MB · Ready to analyze</p>
                </div>
              ) : (
                <>
                  <div className="mb-6 w-24 h-24 bg-emerald-500/10 rounded-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-500 group-hover:bg-emerald-500/20 text-emerald-400">
                    <FileVideo size={48} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-white font-bold text-xl mb-2">Drag and drop your video here</h3>
                  <p className="text-gray-500 mb-8 max-w-sm font-medium">MP4, MOV, MKV, WEBM up to {MAX_VIDEO_SIZE_MB} MB</p>
                  <button className="bg-white/10 text-white border border-white/20 px-8 py-3 rounded-sm font-bold hover:bg-white/20 transition-colors">
                    Browse Files
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* Hidden inputs */}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => processFile(e.target.files[0])} className="hidden" />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm" onChange={e => processVideoFile(e.target.files[0])} className="hidden" />

          {/* Action buttons */}
          <div className="flex gap-4 justify-end">
            {activeTab === 'image' ? (
              <>
                {selectedFile && !isLoading && (
                  <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 rounded-sm border border-white/10 text-white font-bold hover:bg-white/10 transition-all">
                    Change
                  </button>
                )}
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || isLoading}
                  className="px-8 py-3 rounded-sm bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:bg-gray-800 disabled:text-gray-400 shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                >
                  {isLoading ? (
                    <><RefreshCw className="animate-spin" size={18} /> Processing…</>
                  ) : (
                    <><Activity size={18} /> Analyze & Upload</>
                  )}
                </button>
              </>
            ) : (
              <>
                {videoFile && !videoIsLoading && (
                  <button onClick={() => videoInputRef.current?.click()} className="px-6 py-3 rounded-sm border border-white/10 text-white font-bold hover:bg-white/10 transition-all">
                    Change
                  </button>
                )}
                <button
                  onClick={handleVideoUpload}
                  disabled={!videoFile || videoIsLoading}
                  className="px-8 py-3 rounded-sm bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:bg-gray-800 disabled:text-gray-400 shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  {videoIsLoading ? (
                    <><RefreshCw className="animate-spin" size={18} /> Processing Frames…</>
                  ) : (
                    <><Video size={18} /> Analyze Video</>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Results section */}
          <motion.div layout>
            {activeTab === 'image' && result && !isLoading && (
              <div className={`bg-gray-900/80 backdrop-blur-xl rounded-sm p-8 border ${result.humanDetected ? 'border-emerald-500/30' : 'border-white/10'}`}>
                <div className="flex items-center gap-3 mb-6">
                  <ResultBadge variant={result.humanDetected ? 'success' : 'neutral'}>
                    {result.humanDetected ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {result.humanDetected ? `${result.humanCount} ${result.humanCount === 1 ? 'Face' : 'Faces'} Detected` : 'No Human Found'}
                  </ResultBadge>
                </div>
                <p className="text-gray-300 mb-6 font-medium">{result.message}</p>
                {result.humanDetected && Array.isArray(result.faces) && (
                  <div className="space-y-4">
                    {result.faces.map(face => (
                      <div key={face.faceIndex} className="p-5 bg-black/40 rounded-sm border border-white/5">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <span className="font-black text-white">Face #{face.faceIndex}</span>
                          <ResultBadge variant={face.isNew ? 'success' : 'neutral'}>{face.isNew ? '✨ New' : '🔁 Recurring'}</ResultBadge>
                          <ResultBadge variant="neutral">{face.confidence}% CONF</ResultBadge>
                        </div>
                        {face.s3Url && (
                          <div className="flex items-center gap-3 mt-3">
                            <a href={face.s3Url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 font-medium truncate text-sm">
                              {face.s3Url}
                            </a>
                            <button onClick={() => copyToClipboard(face.s3Url, `face-${face.faceIndex}`)} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
                              {copiedId === `face-${face.faceIndex}` ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleReset} className="mt-6 px-6 py-2.5 rounded-sm border border-white/10 text-white font-bold hover:bg-white/10 transition-all">
                  Clear & Reset
                </button>
              </div>
            )}

            {activeTab === 'image' && error && !isLoading && (
              <div className="bg-rose-500/10 backdrop-blur-xl rounded-sm p-8 border border-rose-500/20">
                <ResultBadge variant="error"><XCircle size={14}/> Upload Failed</ResultBadge>
                <p className="text-rose-200 mt-4 mb-6 font-medium">{error}</p>
                <button onClick={handleReset} className="px-6 py-2.5 rounded-sm bg-rose-500/20 text-rose-300 font-bold hover:bg-rose-500/30 transition-all">Try Again</button>
              </div>
            )}

            {activeTab === 'video' && videoResult && !videoIsLoading && (
              <div className="bg-gray-900/80 backdrop-blur-xl rounded-sm p-8 border border-emerald-500/30">
                <ResultBadge variant="success"><CheckCircle2 size={14}/> Video Analysis Complete</ResultBadge>
                <p className="text-gray-300 mt-4 mb-6 font-medium">{videoResult.message}</p>
                {videoResult.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Frames', val: videoResult.summary.totalFramesAnalyzed },
                      { label: 'Humans', val: videoResult.summary.humansDetectedCount, color: 'text-indigo-400' },
                      { label: 'New Faces', val: videoResult.summary.facesRegistered?.length, color: 'text-emerald-400' },
                      { label: 'Recurring', val: videoResult.summary.facesRecognized?.length, color: 'text-sky-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-black/40 rounded-sm p-4 text-center border border-white/5">
                        <div className={`font-black text-3xl ${color || 'text-white'}`}>{val}</div>
                        <div className="text-gray-500 font-bold uppercase tracking-wider text-[10px] mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleVideoReset} className="px-6 py-2.5 rounded-sm border border-white/10 text-white font-bold hover:bg-white/10 transition-all">Clear & Reset</button>
              </div>
            )}

            {activeTab === 'video' && videoError && !videoIsLoading && (
              <div className="bg-rose-500/10 backdrop-blur-xl rounded-sm p-8 border border-rose-500/20">
                <ResultBadge variant="error"><XCircle size={14}/> Video Processing Failed</ResultBadge>
                <p className="text-rose-200 mt-4 mb-6 font-medium">{videoError}</p>
                <button onClick={handleVideoReset} className="px-6 py-2.5 rounded-sm bg-rose-500/20 text-rose-300 font-bold hover:bg-rose-500/30 transition-all">Try Again</button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right: System status */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-sm p-6 border border-white/10">
            <h4 className="text-gray-400 uppercase tracking-widest mb-6 text-xs font-bold flex items-center gap-2">
              <Server size={14} /> System Status
            </h4>
            <div className="space-y-4 font-medium">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">Processing Nodes</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400">Active</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-300">Estimated Latency</span>
                <span className="text-white font-bold">~12ms</span>
              </div>
              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
                <span>Queue Load</span>
                <span>Low Capacity</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/60 backdrop-blur-xl rounded-sm p-6 border border-white/10">
            <h4 className="text-gray-400 uppercase tracking-widest mb-6 text-xs font-bold flex items-center gap-2">
              <UploadCloud size={14} /> Supported Formats
            </h4>
            <div className="space-y-4">
              {[
                { label: 'Images', formats: 'JPEG · PNG · WEBP · GIF', icon: ImageIcon, limit: 'Up to 10 MB' },
                { label: 'Videos', formats: 'MP4 · MOV · MKV · WEBM', icon: Video, limit: 'Up to 100 MB' },
              ].map(({ label, formats, icon: Icon, limit }) => (
                <div key={label} className="flex gap-4 p-4 bg-black/40 rounded-sm border border-white/5">
                  <div className="w-10 h-10 bg-white/5 rounded-sm flex items-center justify-center text-gray-300 flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{formats}</p>
                    <p className="text-gray-500 text-[10px] uppercase font-bold mt-1 tracking-wider">{limit}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: Upload History */}
        {history.length > 0 && (
          <div className="lg:col-span-3 mt-6 border-t border-white/10 pt-8">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h3 className="text-white font-bold text-2xl">Upload History</h3>
                <p className="text-gray-400 font-medium mt-1">Recently processed files and detection results.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {history.slice(0, 8).map(item => <UploadHistoryCard key={item.id} item={item} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
