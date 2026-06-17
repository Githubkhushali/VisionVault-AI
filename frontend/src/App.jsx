import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import WebcamDetector from './components/WebcamDetector';
import FaceTrackingDashboard from './components/FaceTrackingDashboard';
import LogAnalysisDashboard from './components/LogAnalysisDashboard';


// ─────────────────────────────────────────────────────────────
//  VisionVault-AI  —  Premium Dark Luxury React Frontend
// ─────────────────────────────────────────────────────────────


const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 100;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];
const ALLOWED_VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm'];

function App() {
  // ── Mode: 'image' | 'video' ───────────────────────────────
  const [mode, setMode] = useState('image');

  // ── Image state ───────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Video state ───────────────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [videoIsLoading, setVideoIsLoading] = useState(false);
  const [videoResult, setVideoResult] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [videoIsDragging, setVideoIsDragging] = useState(false);

  // ── Shared ────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [sessionsLog, setSessionsLog] = useState([]);

  // ── Analytics states ──────────────────────────────────────
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [analyticsTraffic, setAnalyticsTraffic] = useState([]);
  const [analyticsIdentities, setAnalyticsIdentities] = useState([]);
  const [analyticsConfidence, setAnalyticsConfidence] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // ── Fetch History ──────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const response = await axios.get('/api/history');
      const sessions = response.data.sessions || [];
      setSessionsLog(sessions);

      const historyItems = [];
      for (const s of sessions) {
        if (s.type === 'image') {
          if (s.people && s.people.length > 0) {
            s.people.forEach((p, idx) => {
              historyItems.push({
                id: `${s.id}_p${p.trackId}`,
                filename: s.people.length > 1 ? `${s.filename} — Face ${idx + 1}` : s.filename,
                timestamp: s.processedAt,
                s3Url: p.s3CropUrl || s.s3Url,
                confidence: p.averageConfidence,
                type: 'image',
                identityId: p.identityId
              });
            });
          } else {
            historyItems.push({
              id: s.id,
              filename: s.filename,
              timestamp: s.processedAt,
              s3Url: s.s3Url,
              confidence: s.averageConfidence,
              type: 'image',
              identityId: null
            });
          }
        } else if (s.type === 'video') {
          if (s.people && s.people.length > 0) {
            s.people.forEach((p, idx) => {
              if (p.s3CropUrl) {
                historyItems.push({
                  id: `${s.id}_p${p.trackId}`,
                  filename: `${s.filename} — Face ${idx + 1}`,
                  timestamp: s.processedAt,
                  s3Url: p.s3CropUrl,
                  confidence: p.averageConfidence,
                  type: 'video-face',
                  identityId: p.identityId
                });
              }
            });
          }
          if (s.s3Url) {
            historyItems.push({
              id: s.id,
              filename: s.filename,
              timestamp: s.processedAt,
              s3Url: s.s3Url,
              confidence: s.averageConfidence,
              type: 'video',
              identityId: null
            });
          }
        }
      }
      setHistory(historyItems);
    } catch (e) {
      console.error('Error fetching history:', e);
    }
  }, []);

  // ── Fetch Analytics ────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const [summaryRes, trafficRes, identitiesRes, confidenceRes] = await Promise.all([
        axios.get('/api/analytics/summary'),
        axios.get('/api/analytics/traffic'),
        axios.get('/api/analytics/identities'),
        axios.get('/api/analytics/confidence'),
      ]);
      setAnalyticsSummary(summaryRes.data);
      setAnalyticsTraffic(trafficRes.data);
      setAnalyticsIdentities(identitiesRes.data);
      setAnalyticsConfidence(confidenceRes.data);
    } catch (err) {
      setAnalyticsError('Failed to fetch analytics data.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Fetch history on initial load
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearAllHistory = async () => {
    if (window.confirm('Are you sure you want to clear your upload history? This will delete all PostgreSQL database session records.')) {
      try {
        await axios.delete('/api/analytics/sessions');
        setHistory([]);
        setSessionsLog([]);
        if (mode === 'analytics') {
          fetchAnalytics();
        }
      } catch (err) {
        alert('Failed to clear history on backend.');
      }
    }
  };

  // ── Switch mode reset ─────────────────────────────────────
  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setResult(null);
    setVideoError(null);
    setVideoResult(null);
    if (newMode === 'analytics') {
      fetchAnalytics();
      fetchHistory();
    }
  };

  // ── Image: file handling ──────────────────────────────────
  const processFile = useCallback((file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Unsupported file type. Please upload a JPEG, PNG, WEBP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_IMAGE_SIZE_MB} MB.`);
      return;
    }
    setError(null);
    setResult(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleFileChange = (e) => processFile(e.target.files[0]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setResult(null);
    setError(null);
    const formData = new FormData();
    formData.append('image', selectedFile);
    try {
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      const resData = response.data;
      setResult(resData);
      if (resData.success) {
        await fetchHistory();
      }
    } catch (err) {
      setError(err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Request timed out. Please try again.' : 'Network error. Is the backend running?'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Video: file handling ──────────────────────────────────
  const processVideoFile = useCallback((file) => {
    if (!file) return;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const mimeOk = ALLOWED_VIDEO_TYPES.includes(file.type);
    const extOk = ALLOWED_VIDEO_EXTS.includes(ext);

    if (!mimeOk && !extOk) {
      setVideoError('Unsupported file type. Please upload an MP4, MOV, MKV, or WEBM video.');
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      setVideoError(`File too large. Maximum video size is ${MAX_VIDEO_SIZE_MB} MB.`);
      return;
    }
    setVideoError(null);
    setVideoResult(null);
    setVideoFile(file);
  }, []);

  const handleVideoFileChange = (e) => processVideoFile(e.target.files[0]);
  const handleVideoDragOver = (e) => { e.preventDefault(); setVideoIsDragging(true); };
  const handleVideoDragLeave = (e) => { e.preventDefault(); setVideoIsDragging(false); };
  const handleVideoDrop = (e) => { e.preventDefault(); setVideoIsDragging(false); processVideoFile(e.dataTransfer.files[0]); };

  const handleVideoUpload = async () => {
    if (!videoFile) return;
    setVideoIsLoading(true);
    setVideoResult(null);
    setVideoError(null);
    const formData = new FormData();
    formData.append('video', videoFile);
    try {
      const response = await axios.post('/api/upload-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 minute timeout for video processing
      });
      setVideoResult(response.data);
      if (response.data.success) {
        await fetchHistory();
      }
    } catch (err) {
      setVideoError(err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Video processing timed out. Try a shorter clip.' : 'Network error. Is the backend running?'));
    } finally {
      setVideoIsLoading(false);
    }
  };

  const handleVideoReset = () => {
    setVideoFile(null);
    setVideoResult(null);
    setVideoError(null);
    setVideoIsLoading(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="app-wrapper">
      <main className="container">

        {/* Header / Hero Section */}
        <header className="header">
          <div className="hero-tag">Secure Vault</div>
          <h1 className="title">VisionVault AI</h1>
          <p className="subtitle">Intelligent Human Detection and Cloud Storage Platform</p>
        </header>

        {/* Mode Tabs */}
        <div className="mode-tabs" role="tablist" aria-label="Upload mode">
          <button
            id="tab-image"
            role="tab"
            aria-selected={mode === 'image'}
            className={`mode-tab ${mode === 'image' ? 'active' : ''}`}
            onClick={() => switchMode('image')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Image
          </button>
          <button
            id="tab-video"
            role="tab"
            aria-selected={mode === 'video'}
            className={`mode-tab ${mode === 'video' ? 'active' : ''}`}
            onClick={() => switchMode('video')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            Video
          </button>
          <button
            id="tab-analytics"
            role="tab"
            aria-selected={mode === 'analytics'}
            className={`mode-tab ${mode === 'analytics' ? 'active' : ''}`}
            onClick={() => switchMode('analytics')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </button>


          <button
            id="tab-webcam"
            role="tab"
            aria-selected={mode === 'webcam'}
            className={`mode-tab ${mode === 'webcam' ? 'active' : ''}`}
            onClick={() => switchMode('webcam')}
          >
            Live Tracking
          </button>

          <button
            id="tab-logs"
            role="tab"
            aria-selected={mode === 'logs'}
            className={`mode-tab ${mode === 'logs' ? 'active' : ''}`}
            onClick={() => switchMode('logs')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Log Analysis
          </button>
        </div>

        {/* ── IMAGE MODE ──────────────────────────────────── */}
        {mode === 'image' && (
          <>
            <div className="card" role="tabpanel" aria-labelledby="tab-image">
              {/* Drop Zone */}
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload image drop zone"
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <div className="preview-container">
                    <img src={previewUrl} alt="Preview" className="preview-image" />
                    <div className="preview-overlay">
                      <span className="preview-filename">{selectedFile?.name}</span>
                      <span className="preview-size">{(selectedFile?.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <div className="upload-icon-wrapper">
                      <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="drop-label">Drag and drop your image here</p>
                    <p className="drop-sublabel">or click to browse files</p>
                    <div className="file-types">JPEG · PNG · WEBP · GIF · up to 10 MB</div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                id="file-input"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden-input"
                aria-label="Image file input"
              />

              <div className="button-row">
                {selectedFile && !isLoading && (
                  <button id="btn-change" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                    Change Image
                  </button>
                )}
                <button
                  id="btn-upload"
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={!selectedFile || isLoading}
                  aria-label="Analyze and upload image"
                >
                  {isLoading ? (
                    <><span className="spinner" aria-hidden="true" /><span>Processing...</span></>
                  ) : (
                    <span>Analyze &amp; Upload</span>
                  )}
                </button>
              </div>
            </div>

            {/* Image Loading Card */}
            {isLoading && (
              <div className="card status-card loading-card" role="status" aria-live="polite">
                <div className="status-icon-wrapper pulse">👁️</div>
                <div className="status-text">
                  <h2 className="status-title">Analyzing image</h2>
                  <p className="status-description">Gemini 2.5 Flash is examining the image details...</p>
                </div>
                <div className="progress-bar"><div className="progress-fill" /></div>
              </div>
            )}

            {/* Image Result Card */}
            {result && !isLoading && (
              <div className={`card result-card ${result.humanDetected ? 'success' : 'neutral'}`} role="region" aria-label="Analysis result">
                <div className="result-header">
                  <div className={`result-badge ${result.humanDetected ? 'badge-success' : 'badge-neutral'}`}>
                    {result.humanDetected
                      ? `✓ ${result.humanCount} ${result.humanCount === 1 ? 'Face' : 'Faces'} Detected`
                      : '✕ No Human Found'}
                  </div>
                </div>

                <p className="result-message">{result.message}</p>

                {result.humanDetected && Array.isArray(result.faces) && result.faces.length > 0 && (
                  <div className="face-list">
                    {result.faces.map(face => (
                      <div key={face.faceIndex} className="face-item">
                        <div className="face-item-header">
                          <span className="face-item-number">Face #{face.faceIndex}</span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <div
                              className={`result-badge ${face.isNew ? 'badge-success' : 'badge-neutral'}`}
                              style={{ fontSize: '0.7rem', padding: '3px 10px' }}
                            >
                              {face.isNew ? '✨ New' : '🔁 Recurring'}
                            </div>
                            <div
                              className="result-badge badge-neutral"
                              style={{ fontSize: '0.7rem', padding: '3px 10px', borderColor: 'var(--primary-accent)', color: 'var(--primary-accent)' }}
                            >
                              {face.confidence}%
                            </div>
                            {!face.isNew && (
                              <div
                                className="result-badge badge-neutral"
                                style={{ fontSize: '0.7rem', padding: '3px 10px' }}
                              >
                                Seen {face.uploadCount}×
                              </div>
                            )}
                          </div>
                        </div>

                        {face.s3Url && (
                          <div className="s3-url-box" style={{ marginBottom: 0 }}>
                            <p className="s3-label">Stored at AWS S3</p>
                            <div className="s3-link-container">
                              <a href={face.s3Url} target="_blank" rel="noopener noreferrer" className="s3-link">
                                {face.s3Url}
                              </a>
                              <button
                                onClick={() => copyToClipboard(face.s3Url, `face-${face.faceIndex}`)}
                                className="btn-copy"
                                title="Copy to clipboard"
                                aria-label={`Copy S3 URL for face ${face.faceIndex}`}
                              >
                                {copiedId === `face-${face.faceIndex}` ? (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}><polyline points="20 6 9 17 4 12" /></svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button id="btn-reset" className="btn btn-outline" onClick={handleReset}>Clear and Reset</button>
              </div>
            )}

            {/* Image Error Card */}
            {error && !isLoading && (
              <div className="card error-card" role="alert" aria-live="assertive">
                <div className="error-badge">Upload Failed</div>
                <p className="error-message">{error}</p>
                <button id="btn-retry" className="btn btn-outline" onClick={handleReset}>Try Again</button>
              </div>
            )}
          </>
        )}

        {/* ── VIDEO MODE ──────────────────────────────────── */}
        {mode === 'video' && (
          <>
            <div className="card" role="tabpanel" aria-labelledby="tab-video">
              {/* Video Drop Zone */}
              <div
                className={`drop-zone ${videoIsDragging ? 'dragging' : ''} ${videoFile ? 'has-file' : ''}`}
                onDragOver={handleVideoDragOver}
                onDragLeave={handleVideoDragLeave}
                onDrop={handleVideoDrop}
                onClick={() => !videoFile && videoInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload video drop zone"
                onKeyDown={(e) => e.key === 'Enter' && videoInputRef.current?.click()}
              >
                {videoFile ? (
                  <div className="video-selected-state">
                    <div className="video-icon-wrapper">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary-accent)' }}>
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                    </div>
                    <p className="drop-label" style={{ marginTop: '12px' }}>{videoFile.name}</p>
                    <p className="drop-sublabel">{(videoFile.size / 1024 / 1024).toFixed(2)} MB · Ready to analyze</p>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <div className="upload-icon-wrapper">
                      <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                    </div>
                    <p className="drop-label">Drag and drop your video here</p>
                    <p className="drop-sublabel">or click to browse files</p>
                    <div className="file-types">MP4 · MOV · MKV · WEBM · up to 100 MB</div>
                  </div>
                )}
              </div>

              <input
                ref={videoInputRef}
                type="file"
                id="video-file-input"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
                onChange={handleVideoFileChange}
                className="hidden-input"
                aria-label="Video file input"
              />

              <div className="button-row">
                {videoFile && !videoIsLoading && (
                  <button id="btn-change-video" className="btn btn-secondary" onClick={() => videoInputRef.current?.click()}>
                    Change Video
                  </button>
                )}
                <button
                  id="btn-upload-video"
                  className="btn btn-primary"
                  onClick={handleVideoUpload}
                  disabled={!videoFile || videoIsLoading}
                  aria-label="Analyze video"
                >
                  {videoIsLoading ? (
                    <><span className="spinner" aria-hidden="true" /><span>Processing frames...</span></>
                  ) : (
                    <span>Analyze Video</span>
                  )}
                </button>
              </div>
            </div>

            {/* Video Loading Card */}
            {videoIsLoading && (
              <div className="card status-card loading-card" role="status" aria-live="polite">
                <div className="status-icon-wrapper pulse">🎬</div>
                <div className="status-text">
                  <h2 className="status-title">Analyzing video frames</h2>
                  <p className="status-description">Extracting frames and running face detection. This may take a moment...</p>
                </div>
                <div className="progress-bar"><div className="progress-fill" /></div>
              </div>
            )}

            {/* Video Result Card */}
            {videoResult && !videoIsLoading && (
              <div className="card result-card success" role="region" aria-label="Video analysis result">
                <div className="result-header">
                  <div className="result-badge badge-success">✓ Video Analysis Complete</div>
                </div>

                <p className="result-message">{videoResult.message}</p>

                {videoResult.summary && (
                  <div className="video-summary-grid">
                    <div className="video-stat-card">
                      <div className="video-stat-value">{videoResult.summary.totalFramesAnalyzed}</div>
                      <div className="video-stat-label">Frames Analyzed</div>
                    </div>
                    <div className="video-stat-card">
                      <div className="video-stat-value" style={{ color: 'var(--success)' }}>{videoResult.summary.humansDetectedCount}</div>
                      <div className="video-stat-label">Humans Detected</div>
                    </div>
                    <div className="video-stat-card">
                      <div className="video-stat-value" style={{ color: 'var(--primary-accent)' }}>{videoResult.summary.facesRegistered.length}</div>
                      <div className="video-stat-label">New Faces Stored</div>
                    </div>
                    <div className="video-stat-card">
                      <div className="video-stat-value" style={{ color: '#B0C4DE' }}>{videoResult.summary.facesRecognized.length}</div>
                      <div className="video-stat-label">Recurring Faces</div>
                    </div>
                  </div>
                )}

                <button id="btn-video-reset" className="btn btn-outline" onClick={handleVideoReset} style={{ marginTop: '8px' }}>
                  Clear and Reset
                </button>
              </div>
            )}

            {/* Video Error Card */}
            {videoError && !videoIsLoading && (
              <div className="card error-card" role="alert" aria-live="assertive">
                <div className="error-badge">Video Processing Failed</div>
                <p className="error-message">{videoError}</p>
                <button id="btn-video-retry" className="btn btn-outline" onClick={handleVideoReset}>Try Again</button>
              </div>
            )}
          </>
        )}

        {/* ── ANALYTICS MODE ────────────────────────────────── */}
        {mode === 'analytics' && (
          <div className="dashboard-layout">
            {/* KPI Metrics */}
            <div className="dashboard-stats">
              <div className="dashboard-card">
                <div className="dashboard-card-val">
                  {analyticsSummary ? analyticsSummary.totalSessions : '0'}
                </div>
                <div className="dashboard-card-label">Total Detections</div>
              </div>
              <div className="dashboard-card">
                <div className="dashboard-card-val" style={{ color: 'var(--success)' }}>
                  {analyticsSummary ? analyticsSummary.totalUniquePeople : '0'}
                </div>
                <div className="dashboard-card-label">Unique Identities</div>
              </div>
              <div className="dashboard-card">
                <div className="dashboard-card-val" style={{ color: 'var(--primary-accent)' }}>
                  {analyticsSummary ? analyticsSummary.totalFacesDetected : '0'}
                </div>
                <div className="dashboard-card-label">Faces Registered</div>
              </div>
              <div className="dashboard-card">
                <div className="dashboard-card-val" style={{ color: '#B0C4DE' }}>
                  {analyticsSummary ? analyticsSummary.totalVideosAnalyzed : '0'}
                </div>
                <div className="dashboard-card-label">Videos Analyzed</div>
              </div>
            </div>

            {/* Grid for Charts & Identities */}
            <div className="dashboard-grid">
              {/* Traffic Chart */}
              <div className="dashboard-panel">
                <h3 className="dashboard-panel-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  Activity over Time (Detections)
                </h3>
                {analyticsLoading ? (
                  <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading activity data...</p>
                ) : analyticsTraffic.length > 0 ? (
                  <div className="chart-container">
                    {analyticsTraffic.map((day, idx) => {
                      const maxVal = Math.max(...analyticsTraffic.map(d => d.peopleCount), 1);
                      const heightPercent = Math.min(100, Math.max(10, (day.peopleCount / maxVal) * 100));
                      return (
                        <div key={idx} className="chart-bar-wrapper">
                          <div
                            className="chart-bar"
                            style={{ height: `${heightPercent}%` }}
                          >
                            <div className="chart-bar-tooltip">
                              {day.peopleCount} people ({day.imageCount} img, {day.videoCount} vid)
                            </div>
                          </div>
                          <div className="chart-x-label">{day.date}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No traffic history available.</p>
                )}
              </div>

              {/* All Identities — with names, photos, and unknown name input */}
              <div className="dashboard-panel" style={{ gridColumn: '1 / -1' }}>
                <h3 className="dashboard-panel-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  All Detected Identities
                </h3>
                {analyticsLoading ? (
                  <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading identities...</p>
                ) : analyticsIdentities.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {analyticsIdentities.map((identity, idx) => {
                      const isKnown = !!identity.name;
                      const initial = isKnown ? identity.name[0].toUpperCase() : '?';
                      const displayName = identity.name || 'Unknown';
                      return (
                        <div key={identity.id} style={{
                          background: '#0d1117',
                          border: `1px solid ${isKnown ? '#065f46' : '#1f2937'}`,
                          borderRadius: '12px', padding: '14px', display: 'flex',
                          flexDirection: 'column', gap: '10px',
                        }}>
                          {/* Top row: avatar + name + appearances */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Face photo or initial avatar */}
                            {identity.canonicalFaceUrl ? (
                              <img
                                src={identity.canonicalFaceUrl}
                                alt={displayName}
                                onError={e => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                style={{
                                  width: '48px', height: '48px', borderRadius: '50%',
                                  objectFit: 'cover', border: `2px solid ${isKnown ? '#34d399' : '#374151'}`,
                                  flexShrink: 0,
                                }}
                              />
                            ) : null}
                            <div style={{
                              width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
                              background: isKnown ? '#064e3b' : '#1f2937',
                              display: identity.canonicalFaceUrl ? 'none' : 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: '1.1rem',
                              color: isKnown ? '#34d399' : '#9ca3af',
                              border: `2px solid ${isKnown ? '#065f46' : '#374151'}`,
                            }}>
                              {initial}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#f9fafb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {isKnown ? identity.name : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Unknown</span>}
                              </p>
                              <p style={{ margin: 0, fontSize: '0.68rem', color: '#4b5563', fontFamily: 'monospace' }}>{identity.id}</p>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#60a5fa' }}>{identity.totalAppearances}</span>
                              <p style={{ margin: 0, fontSize: '0.65rem', color: '#6b7280' }}>appearances</p>
                            </div>
                          </div>

                          {/* Entry/exit counts if available */}
                          {(identity.entryCount !== null || identity.exitCount !== null) && (
                            <div style={{ display: 'flex', gap: '10px' }}>
                              {identity.entryCount !== null && (
                                <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                                  ▲ {identity.entryCount} {identity.entryCount === 1 ? 'entry' : 'entries'}
                                </span>
                              )}
                              {identity.exitCount > 0 && (
                                <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 600 }}>
                                  ▼ exited {identity.exitCount} {identity.exitCount === 1 ? 'time' : 'times'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Last seen */}
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#4b5563' }}>
                            Last seen: {identity.lastSeen || 'N/A'}
                          </p>

                          {/* Name input for unknowns */}
                          {!isKnown && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <input
                                type="text"
                                placeholder="Name this person..."
                                id={`analytics-name-${identity.id}`}
                                style={{
                                  flex: 1, background: '#1f2937', border: '1px solid #374151',
                                  borderRadius: '6px', padding: '5px 10px', fontSize: '0.8rem',
                                  color: '#fff', outline: 'none',
                                }}
                                onKeyDown={async e => {
                                  if (e.key !== 'Enter') return;
                                  const name = e.target.value.trim();
                                  if (!name) return;
                                  const btn = e.target.nextSibling;
                                  try {
                                    const res = await fetch('/api/history/update-name', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ identityId: identity.id, newName: name }),
                                    });
                                    const data = await res.json();
                                    if (data.success) { btn.textContent = '✅'; setTimeout(() => fetchAnalytics(), 1500); }
                                    else { btn.textContent = '❌'; }
                                  } catch { btn.textContent = '❌'; }
                                }}
                              />
                              <button
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem',
                                  fontWeight: 700, cursor: 'pointer', border: 'none',
                                  background: '#1d4ed8', color: '#fff',
                                }}
                                onClick={async (e) => {
                                  const input = document.getElementById(`analytics-name-${identity.id}`);
                                  const name = (input?.value || '').trim();
                                  if (!name) return;
                                  try {
                                    const res = await fetch('/api/history/update-name', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ identityId: identity.id, newName: name }),
                                    });
                                    const data = await res.json();
                                    e.target.textContent = data.success ? '✅' : '❌';
                                    if (data.success) setTimeout(() => fetchAnalytics(), 1500);
                                  } catch { e.target.textContent = '❌'; }
                                }}
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    No identities yet. Run a live session or upload an image/video to begin tracking.
                  </p>
                )}
              </div>
            </div>

            {/* Session Logs Panel */}
            <div className="dashboard-panel sessions-log-panel">
              <h3 className="dashboard-panel-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Detailed Session Logs (PostgreSQL History)
              </h3>
              {analyticsLoading ? (
                <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading sessions...</p>
              ) : sessionsLog.length > 0 ? (
                <div className="sessions-table-wrapper">
                  <table className="sessions-table">
                    <thead>
                      <tr>
                        <th>Filename</th>
                        <th>Type</th>
                        <th>Processed At</th>
                        <th>People Count</th>
                        <th>Average Conf</th>
                        <th>S3 link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsLog.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: '600' }}>{s.filename}</td>
                          <td>
                            <span className={`session-row-type ${s.type}`}>
                              {s.type}
                            </span>
                          </td>
                          <td>{s.processedAt}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span>{s.peopleCount} people ({s.uniqueIdentitiesCount} unique)</span>
                              {s.people && s.people.length > 0 && (
                                <div className="session-people-mini-list">
                                  {s.people.filter(p => p.s3CropUrl).map((p, pidx) => (
                                    <img
                                      key={pidx}
                                      src={p.s3CropUrl}
                                      alt={p.identityId}
                                      title={`${p.identityId} (Conf: ${p.averageConfidence}%)`}
                                      className="session-people-mini-item"
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{
                              color: s.averageConfidence >= 85 ? 'var(--success)' :
                                s.averageConfidence >= 75 ? 'var(--primary-accent)' : 'var(--text-muted)',
                              fontWeight: '700'
                            }}>
                              {s.averageConfidence}%
                            </span>
                          </td>
                          <td>
                            {s.s3Url ? (
                              <a href={s.s3Url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-accent)', textDecoration: 'underline' }}>
                                View Original
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No upload sessions recorded in PostgreSQL.</p>
              )}
            </div>
          </div>
        )}

        {/* ── LIVE WEBCAM MODE ──────────────────────────────── */}
        {mode === 'webcam' && (
          <div role="tabpanel" aria-labelledby="tab-webcam">
            <FaceTrackingDashboard />
          </div>
        )}

        {/* ── LOG ANALYSIS MODE ─────────────────────────────── */}
        {mode === 'logs' && (
          <div role="tabpanel" aria-labelledby="tab-logs">
            <LogAnalysisDashboard />
          </div>
        )}

        {/* Upload History Section (hide on Analytics view) */}
        {mode !== 'analytics' && (
          <section className="history-section">
            <div className="history-header">
              <h2 className="history-title">Vault History</h2>
              {history.length > 0 && (
                <button onClick={clearAllHistory} className="btn-clear-history" aria-label="Clear all upload history">
                  Clear History
                </button>
              )}
            </div>

            <div className="history-grid">
              {history.length > 0 ? (
                history.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className={`history-item-badge ${item.type === 'video-face' ? 'badge-video' : ''}`}>
                      {item.type === 'video-face' ? '🎬 Video Face' : 'Saved'}
                    </div>
                    <div className="history-img-wrapper">
                      <img src={item.s3Url} alt={item.filename} className="history-img" loading="lazy" />
                    </div>
                    <div className="history-info">
                      <div className="history-meta-row">
                        <div className="history-name" title={item.filename}>{item.filename}</div>
                        {item.confidence && (
                          <div className="history-confidence" title="Confidence Score">{item.confidence}%</div>
                        )}
                      </div>
                      <div className="history-date">{item.timestamp}</div>
                      <div className="history-actions">
                        <a href={item.s3Url} target="_blank" rel="noopener noreferrer" className="history-link">
                          Open S3
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => copyToClipboard(item.s3Url, item.id)} className="btn-copy" title="Copy Link" aria-label="Copy S3 URL from history">
                            {copiedId === item.id ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            )}
                          </button>
                          <button onClick={(e) => deleteHistoryItem(item.id, e)} className="btn-delete-item" title="Delete from history" aria-label="Delete history item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="history-empty">
                  <div className="history-empty-icon">📂</div>
                  <p>Vault is empty. Stored images will appear here.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="footer">
          <p>
            Powered by{' '}
            <span className="tech-badge">Google Gemini 2.5 Flash</span>
            {' '}·{' '}
            <span className="tech-badge">AWS S3</span>
            {' '}·{' '}
            <span className="tech-badge">React</span>
          </p>
        </footer>

      </main>
    </div>
  );
}

export default App;
