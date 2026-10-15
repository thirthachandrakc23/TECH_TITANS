/**
 * DigitalVision — Accessible Surroundings Assistant
 *
 * Real working frontend for visually impaired users.
 * Combines high-contrast mobile-first UI, Web Speech API announcements,
 * live camera feed, and real browser-based COCO-SSD object detection.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startCamera,
  stopCamera,
  getVideoStream,
} from '../camera/cameraService.js';
import {
  loadDetectionModel,
  detectObjects,
  isModelReady,
} from '../services/detectionService.js';
import {
  speak,
  stopSpeaking,
  setVoiceMuted,
  getVoiceMuted,
  formatSurroundingsDescription,
} from '../services/speechService.js';

const WELCOME_SPEECH =
  'Welcome to DigitalVision. A camera-based surroundings assistant for visually impaired users. Touch the screen or press the large button to understand your surroundings.';

export default function HomePage() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState(null);

  const [detectedObjects, setDetectedObjects] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(
    'Touch the start button below to activate the camera and understand your surroundings.'
  );
  const [voiceMuted, setVoiceMutedState] = useState(getVoiceMuted());

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const lastSpokenLabelsRef = useRef('');
  const lastSpokenTimeRef = useRef(0);
  const hasSpokenWelcomeRef = useRef(false);

  // Play welcome speech on initial page load / after first user gesture (satisfies autoplay policy)
  useEffect(() => {
    if (hasSpokenWelcomeRef.current) return;

    const triggerWelcome = () => {
      if (hasSpokenWelcomeRef.current) return;
      hasSpokenWelcomeRef.current = true;
      speak(WELCOME_SPEECH, { interrupt: false });
      window.removeEventListener('pointerdown', triggerWelcome);
      window.removeEventListener('keydown', triggerWelcome);
    };

    // Attempt immediate speech (works in browsers that permit synthesis on load)
    speak(WELCOME_SPEECH, { interrupt: false })
      .then(() => {
        hasSpokenWelcomeRef.current = true;
      })
      .catch(() => {
        // Fall back to first interaction listener if autoplay is restricted
      });

    window.addEventListener('pointerdown', triggerWelcome, { once: true });
    window.addEventListener('keydown', triggerWelcome, { once: true });

    return () => {
      window.removeEventListener('pointerdown', triggerWelcome);
      window.removeEventListener('keydown', triggerWelcome);
      stopSpeaking();
    };
  }, []);

  // Cleanup camera and intervals on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      stopCamera();
      stopSpeaking();
    };
  }, []);

  // Draw bounding boxes on canvas over live camera feed
  const drawDetections = useCallback((predictions) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const pred of predictions) {
      const [x, y, width, height] = pred.bbox;

      // High-contrast neon bounding box
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Label background badge
      const labelText = `${pred.label} (${pred.score}%)`;
      ctx.font = 'bold 15px system-ui, sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagY = y > 26 ? y - 24 : y;

      ctx.fillStyle = 'rgba(11, 15, 25, 0.9)';
      ctx.fillRect(x, tagY, textWidth + 14, 22);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x + 7, tagY + 16);
    }
  }, []);

  // Start continuous detection loop on active camera feed
  const runDetectionCycle = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      return;
    }

    const predictions = await detectObjects(video);
    setDetectedObjects(predictions);
    drawDetections(predictions);

    if (predictions.length > 0) {
      // Build signature of detected labels to detect changes in surroundings
      const currentSignature = predictions
        .map((p) => `${p.label}:${p.location}`)
        .sort()
        .join('|');

      const now = Date.now();
      const hasChanged = currentSignature !== lastSpokenLabelsRef.current;
      const cooldownElapsed = now - lastSpokenTimeRef.current > 12000; // 12-second cooldown if view is static

      if (hasChanged || cooldownElapsed) {
        const description = formatSurroundingsDescription(predictions);
        setLastSpoken(description);
        lastSpokenLabelsRef.current = currentSignature;
        lastSpokenTimeRef.current = now;
        speak(description);
      }
    } else {
      // If nothing detected for over 15 seconds after previous detections, update status
      const now = Date.now();
      if (lastSpokenLabelsRef.current !== '' && now - lastSpokenTimeRef.current > 15000) {
        lastSpokenLabelsRef.current = '';
        lastSpokenTimeRef.current = now;
        const msg = 'No distinct objects currently detected in view.';
        setLastSpoken(msg);
        speak(msg);
      }
    }
  }, [drawDetections]);

  // Handle Start Camera & Surroundings Detection
  const handleStartDetection = async () => {
    setCameraStarting(true);
    setCameraError(null);
    setModelError(null);

    // Request rear-facing camera access
    const success = await startCamera({ facingMode: 'environment' });

    if (!success) {
      setCameraStarting(false);
      const errMsg =
        'Camera permission was denied or no camera device is available. Please allow camera permissions in your browser.';
      setCameraError(errMsg);
      speak(errMsg);
      return;
    }

    setCameraActive(true);
    setCameraStarting(false);

    // Bind stream to visible video element
    const stream = getVideoStream();
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (e) {
        console.warn('Video play interrupted:', e);
      }
    }

    // Load pretrained COCO-SSD model if not yet loaded
    if (!isModelReady()) {
      try {
        setModelLoading(true);
        speak('Camera active. Loading AI detection model.');
        await loadDetectionModel();
        setModelLoading(false);
        speak('AI detection ready. Scanning your surroundings now.');
      } catch (err) {
        setModelLoading(false);
        const errText = `Detection model could not be loaded: ${err.message || 'Network error'}. Real camera feed is active.`;
        setModelError(errText);
        speak(errText);
      }
    } else {
      speak('Camera active. Scanning your surroundings.');
    }

    // Start periodic detection loop every 800ms
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    detectionIntervalRef.current = setInterval(runDetectionCycle, 800);
  };

  // Handle Stop Camera
  const handleStopCamera = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    stopCamera();
    stopSpeaking();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    setCameraActive(false);
    setDetectedObjects([]);
    lastSpokenLabelsRef.current = '';
    const stopMsg = 'Surroundings detection stopped. Camera deactivated.';
    setLastSpoken(stopMsg);
    speak(stopMsg);
  };

  // Repeat description on demand
  const handleRepeatDescription = () => {
    if (lastSpoken) {
      speak(lastSpoken, { interrupt: true });
    } else {
      speak('No surroundings description available yet.');
    }
  };

  // Toggle voice mute
  const handleToggleVoice = () => {
    const nextMuted = setVoiceMuted();
    setVoiceMutedState(nextMuted);
    if (!nextMuted) {
      speak('Voice announcements resumed.');
    }
  };

  return (
    <div className="app-container">
      <a href="#main-action" className="skip-link">
        Skip to main action
      </a>

      {/* Header */}
      <header className="app-header">
        <div className="brand-badge" role="status">
          <span className="dot" aria-hidden="true"></span>
          <span>Assistive Surroundings Aid</span>
        </div>
        <h1 className="app-title">DigitalVision</h1>
        <p className="app-subtitle">
          Real-time camera detection and spoken guidance for visually impaired users
        </p>
      </header>

      {/* Main Interactive Region */}
      <main className="app-main" id="main-content">
        {/* Welcome Announcement Region */}
        <section
          className="guidance-box"
          aria-labelledby="welcome-heading"
          role="region"
        >
          <h2 id="welcome-heading" className="sr-only">
            Surroundings Option
          </h2>
          <p>
            <strong>Available Option:</strong> Understand my surroundings.
          </p>
          <p className="guidance-instruction">
            Press the large button below to open the camera and receive spoken descriptions of objects around you.
          </p>
        </section>

        {/* Error Banners */}
        {cameraError && (
          <div className="alert-card error" role="alert" aria-live="assertive">
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
              ⚠️
            </span>
            <div>
              <strong>Camera Error:</strong> {cameraError}
            </div>
          </div>
        )}

        {modelError && (
          <div className="alert-card warning" role="alert" aria-live="polite">
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
              ⚠️
            </span>
            <div>
              <strong>Model Notice:</strong> {modelError}
            </div>
          </div>
        )}

        {/* Dynamic State: Inactive vs Active Camera */}
        {!cameraActive ? (
          <>
            {/* Glowing Orb & Pulsing Audio Visualizer */}
            <div
              className="orb-section"
              aria-hidden="true"
              role="presentation"
            >
              <div className="orb-wrapper">
                <div className="pulse-ring delay-2"></div>
                <div className="pulse-ring delay-1"></div>
                <div className="pulse-ring"></div>
                <div className="orb-core">
                  <span style={{ fontSize: '2.5rem' }}>📷</span>
                </div>
              </div>

              {/* Pulsing Audio Visualizer */}
              <div className="visualizer-container playing" aria-hidden="true">
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
                <div className="visualizer-bar"></div>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="hero-action-section">
              <button
                id="main-action"
                className="btn-hero"
                onClick={handleStartDetection}
                disabled={cameraStarting}
                aria-label="Touch to start surroundings detection"
              >
                <span aria-hidden="true" style={{ fontSize: '1.8rem' }}>
                  👁️
                </span>
                <span>
                  {cameraStarting
                    ? 'Starting Camera...'
                    : 'Touch to start surroundings detection'}
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Live Camera Feed & Canvas Overlay */}
            <div className="camera-card" aria-label="Live camera feed showing detected surroundings">
              <div className="camera-status-pill">
                <span className="indicator-dot" aria-hidden="true"></span>
                <span>
                  {modelLoading
                    ? 'Loading AI Model...'
                    : `Live Detection (${detectedObjects.length} in view)`}
                </span>
              </div>

              <video
                ref={videoRef}
                className="camera-video"
                autoPlay
                playsInline
                muted
                aria-label="Camera live preview"
              ></video>

              <canvas ref={canvasRef} className="camera-overlay" aria-hidden="true"></canvas>
            </div>

            {/* Controls Row */}
            <div className="controls-row" role="toolbar" aria-label="Surroundings Controls">
              <button
                className="btn btn-danger"
                onClick={handleStopCamera}
                aria-label="Stop Camera"
              >
                <span aria-hidden="true">⏹️</span>
                <span>Stop Camera</span>
              </button>

              <button
                className="btn btn-primary"
                onClick={handleRepeatDescription}
                aria-label="Repeat Last Spoken Description"
              >
                <span aria-hidden="true">🔄</span>
                <span>Repeat Description</span>
              </button>

              <button
                className="btn"
                onClick={handleToggleVoice}
                aria-label={voiceMuted ? 'Resume Voice Announcements' : 'Pause Voice Announcements'}
              >
                <span aria-hidden="true">{voiceMuted ? '🔇' : '🔊'}</span>
                <span>{voiceMuted ? 'Resume Voice' : 'Pause Voice'}</span>
              </button>
            </div>

            {/* Live Detections List */}
            {detectedObjects.length > 0 && (
              <section className="detections-panel" aria-labelledby="detections-title">
                <div className="detections-heading">
                  <h3 id="detections-title">Detected Objects in View</h3>
                  <span className="location-pill">Real-Time</span>
                </div>
                <div className="detections-grid">
                  {detectedObjects.map((obj, idx) => (
                    <div className="detection-chip" key={`${obj.label}-${idx}`}>
                      <span className="chip-label">{obj.label}</span>
                      <div className="chip-meta">
                        <span>Confidence: {obj.score}%</span>
                        <span className="location-pill">{obj.location}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Live Spoken Caption Banner */}
        <section
          className="caption-banner"
          aria-live="polite"
          role="status"
          aria-label="Spoken surroundings description"
        >
          <span className="caption-icon" aria-hidden="true">
            💬
          </span>
          <div className="caption-text">{lastSpoken}</div>
        </section>
      </main>

      {/* Footer & Assistive Disclaimer */}
      <footer className="app-footer">
        <p>
          <strong>Assistive Notice:</strong> DigitalVision is an environmental awareness aid. Standard monocular camera feeds cannot measure depth or guarantee collision avoidance. Always use traditional mobility aids.
        </p>
        <p style={{ marginTop: '0.25rem', opacity: 0.75 }}>
          TECH TITANS — HACK ATTACK 2026
        </p>
      </footer>
    </div>
  );
}
