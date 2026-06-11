import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';

const WebcamDetector = () => {
    const [cameraMode, setCameraMode] = useState('IDLE');
    const [liveFaceCount, setLiveFaceCount] = useState(0);
    const [systemStatus, setSystemStatus] = useState('System Offline');
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionReport, setSessionReport] = useState(null);

    const webcamRef = useRef(null);
    const intervalRef = useRef(null);

    // Memory lock references
    const lastFrameRef = useRef(null);
    const lastIdentityIdRef = useRef(null);
    const isLockedRef = useRef(false);

    const hasSceneChanged = (newImageSrc) => {
        return new Promise((resolve) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 24;

                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    resolve(true);
                    return;
                }

                ctx.drawImage(img, 0, 0, 32, 24);

                const imgData = ctx.getImageData(
                    0,
                    0,
                    32,
                    24
                ).data;

                if (!lastFrameRef.current) {
                    lastFrameRef.current = imgData;
                    resolve(true);
                    return;
                }

                let diff = 0;

                for (let i = 0; i < imgData.length; i += 4) {
                    diff += Math.abs(imgData[i] - lastFrameRef.current[i]);
                    diff += Math.abs(imgData[i + 1] - lastFrameRef.current[i + 1]);
                    diff += Math.abs(imgData[i + 2] - lastFrameRef.current[i + 2]);
                }

                lastFrameRef.current = imgData;

                const avgDiff = diff / (32 * 24 * 3);

                resolve(avgDiff > 18);
            };

            img.src = newImageSrc;
        });
    };

    const captureAndSendToYOLO = async () => {
        if (!webcamRef.current || cameraMode !== 'SCANNING') return;

        try {
            const imageSrc = webcamRef.current.getScreenshot();
            if (!imageSrc) return;

            const sceneChanged = await hasSceneChanged(imageSrc);

            if (isLockedRef.current && !sceneChanged) {
                console.log(
                    '[Lock Engaged] Face remains unchanged. Skipping backend upload.'
                );
                return;
            }

            const responseBlob = await fetch(imageSrc);
            const blob = await responseBlob.blob();

            const file = new File(
                [blob],
                `live_stream_${Date.now()}.jpg`,
                { type: 'image/jpeg' }
            );

            const formData = new FormData();
            formData.append('image', file);

            setIsProcessing(true);
            setIsProcessing(true);
            setSystemStatus('Transmission Processing...');

            // Fetch using the relative route so it matches Vite's proxy config
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            console.log('[YOLO Live Stream Response]', data);

            if (data.success) {
                const detectedFaces = data.faces || [];

                if (detectedFaces.length > 0) {
                    // Update count to the actual number of faces in this frame!
                    setLiveFaceCount(detectedFaces.length);

                    // Create a composite string of all current identities to lock onto
                    const currentIdentities = detectedFaces
                        .map(face => face.identityId)
                        .sort()
                        .join(',');

                    if (currentIdentities !== lastIdentityIdRef.current) {
                        lastIdentityIdRef.current = currentIdentities;
                    }

                    isLockedRef.current = true;
                    setSystemStatus(`🎯 Tracking ${detectedFaces.length} Face(s) (Locked)`);
                } else {
                    // No faces found - reset session tracking lock
                    isLockedRef.current = false;
                    lastIdentityIdRef.current = null;

                    setLiveFaceCount(0);
                    setSystemStatus('🎯 Live Feed Tracking (Scanning)');
                }
            }
        } catch (err) {
            console.error('[Webcam Stream Error]', err);
            setSystemStatus('⚠️ Pipeline Sync Error');
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (cameraMode === 'SCANNING') {
            setSystemStatus('🎯 Live Feed Tracking');
            // Scan every 2 seconds
            intervalRef.current = setInterval(
                captureAndSendToYOLO,
                2000
            );
        } else if (cameraMode === 'PAUSED') {
            setSystemStatus('⏸️ Capture Paused');
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        } else {
            setSystemStatus('System Offline');
            setLiveFaceCount(0);
            isLockedRef.current = false;
            lastIdentityIdRef.current = null;
            lastFrameRef.current = null;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [cameraMode]);

    const handleStartSession = async () => {
        try {
            await fetch('/api/start-stream-analysis', { method: 'POST' });
        } catch (err) {
            console.error('[Start Session Error]', err);
        }
        setCameraMode('SCANNING');
        setSessionReport(null);
    };

    const handleStopSession = async () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCameraMode('IDLE');
        setSystemStatus('⏳ Aggregating session data...');

        try {
            const res = await fetch('/api/stop-stream-analysis', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                setSessionReport(data.report);
                setSystemStatus(`✅ Session complete — ${data.report.uniqueFacesCount} unique face(s)`);
            }
        } catch (err) {
            console.error('[Stop Session Error]', err);
            setSystemStatus('⚠️ Failed to fetch session report');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-900 rounded-xl shadow-2xl max-w-2xl mx-auto border border-gray-800 text-white my-8">
            <h2 className="text-2xl font-bold mb-4 tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                VisionVault AI Live Cam Tracker
            </h2>

            {isProcessing && (
                <div className="mb-4 text-sm text-amber-400 animate-pulse">
                    Analyzing frame on backend...
                </div>
            )}
            {/* Camera Viewport Wrapper */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border-2 border-gray-700">
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{
                        width: 640,
                        height: 480,
                        facingMode: "user"
                    }}
                />
            </div>

            <div className="mt-4 flex gap-3">
                <button
                    onClick={handleStartSession}
                    className={`btn ${cameraMode === 'SCANNING' ? 'btn-primary' : 'btn-secondary'}`}
                >
                    Start
                </button>

                <button
                    onClick={() => setCameraMode('PAUSED')}
                    className={`btn ${cameraMode === 'PAUSED' ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={cameraMode === 'IDLE'}
                >
                    Pause
                </button>

                <button
                    onClick={handleStopSession}
                    className={`btn ${cameraMode === 'IDLE' ? 'btn-primary' : 'btn-secondary'}`}
                >
                    Stop
                </button>
            </div>

            {/* Metric Dashboard Reads */}
            <div className="mt-6 w-full flex justify-around bg-gray-950 p-4 rounded-lg border border-gray-800">
                <div className="text-center">
                    <span className="text-xs text-gray-400 block uppercase tracking-widest">
                        System Status
                    </span>
                    <span className="text-sm font-semibold">
                        {systemStatus}
                    </span>
                </div>

                <div className="border-r border-gray-800" />

                <div className="text-center">
                    <span className="text-xs text-gray-400 block uppercase tracking-widest">
                        Faces Detected
                    </span>
                    <span className="text-xl font-black text-blue-400">
                        {liveFaceCount}
                    </span>
                </div>
            </div>

            {/* Session Report */}
            {sessionReport && (
                <div className="mt-6 w-full bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <h3 className="text-lg font-bold mb-3 text-emerald-400">Session Summary</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-gray-900 p-3 rounded">
                            <span className="text-xs text-gray-400 block">Duration</span>
                            <span className="font-semibold">{sessionReport.durationSec} sec</span>
                        </div>
                        <div className="bg-gray-900 p-3 rounded">
                            <span className="text-xs text-gray-400 block">Total Entries</span>
                            <span className="font-semibold text-blue-400">{sessionReport.totalEntries}</span>
                        </div>
                        <div className="bg-gray-900 p-3 rounded">
                            <span className="text-xs text-gray-400 block">Total Exits</span>
                            <span className="font-semibold text-red-400">{sessionReport.totalExits}</span>
                        </div>
                        <div className="bg-gray-900 p-3 rounded">
                            <span className="text-xs text-gray-400 block">Unique Faces</span>
                            <span className="font-semibold text-purple-400">{sessionReport.uniqueFacesCount}</span>
                        </div>
                    </div>

                    {sessionReport.faces && sessionReport.faces.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2 text-gray-300">Face Activity</h4>
                            <div className="space-y-2">
                                {sessionReport.faces.map((face, i) => (
                                    <div key={i} className="flex items-center justify-between bg-gray-900 p-2 rounded">
                                        <div className="flex items-center gap-3">
                                            {face.s3Url && (
                                                <img src={face.s3Url} alt="face" className="w-8 h-8 rounded-full object-cover border border-gray-700" />
                                            )}
                                            <span className="text-xs font-mono text-gray-400">{face.identityId.substring(0, 10)}...</span>
                                        </div>
                                        <div className="text-xs text-right">
                                            <div><span className="text-gray-500">Seen:</span> {face.appearanceCount} times</div>
                                            <div><span className="text-gray-500">Crossed:</span> {face.crossings} times</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WebcamDetector;