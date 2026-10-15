/**
 * DigitalVision — Accessible Surroundings & Vision Assistant
 *
 * Real working frontend for visually impaired users.
 * Combines high-contrast mobile-first UI, Web Speech API announcements,
 * live camera feed (with front/back camera support & mirroring),
 * real-time browser-based TensorFlow.js COCO-SSD object/face detection,
 * and backend multimodal AI integration.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startCamera,
  stopCamera,
  getVideoStream,
  captureFrame,
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
  playAudioCue,
  triggerHaptic,
  formatAggregatedScanDescription,
} from '../services/speechService.js';
import { analyzeImage } from '../ai/vision.js';

const WELCOME_SPEECH =
  'Welcome to DigitalVision. Tap anywhere on your screen to activate the camera and understand your surroundings.';

export default function HomePage() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // Default to front camera so face shows on webcams/phones

  const [modelLoading, setModelLoading] = useState(() => !isModelReady());
  const [modelReady, setModelReady] = useState(isModelReady());
  const [modelError, setModelError] = useState(null);

  const [detectedObjects, setDetectedObjects] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(
    'Tap anywhere on the screen to activate the camera and understand your surroundings.'
  );
  const [voiceMuted, setVoiceMutedState] = useState(getVoiceMuted());
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  // 5-Second Surroundings Scan Engine State
  const [scanPhase, setScanPhase] = useState('idle'); // 'idle' | 'scanning' | 'speaking' | 'paused' | 'ready'
  const [scanCountdown, setScanCountdown] = useState(5);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const hasSpokenWelcomeRef = useRef(false);

  // 10-Second Scan Accumulator Refs
  const scanAccumulatorRef = useRef(new Map());
  const scanFramesCountRef = useRef(0);
  const scanTimerRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const scanPhaseRef = useRef('idle');
  const autoScanEnabledRef = useRef(true);
  const cameraActiveRef = useRef(false);

  // Keep ref sync with state for rAF and timers
  useEffect(() => {
    scanPhaseRef.current = scanPhase;
  }, [scanPhase]);

  useEffect(() => {
    autoScanEnabledRef.current = autoScanEnabled;
  }, [autoScanEnabled]);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

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

  // Preload detection model in background on initial page mount so detection is instant
  useEffect(() => {
    let isCancelled = false;

    if (!isModelReady()) {
      loadDetectionModel()
        .then(() => {
          if (!isCancelled) {
            setModelLoading(false);
            setModelReady(true);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setModelLoading(false);
            console.warn('[DigitalVision] Model background preload notice:', err);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  // Bind media stream to visible video element reliably
  const bindStreamToVideo = useCallback((targetEl) => {
    const el = targetEl || videoRef.current;
    if (!el) return;

    const stream = getVideoStream();
    if (stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.muted = true;
      el.defaultMuted = true;
      el.play().catch((err) => {
        console.warn('[DigitalVision] Video playback notice:', err);
      });
    }
  }, []);

  // Re-bind stream whenever cameraActive state changes
  useEffect(() => {
    if (cameraActive) {
      bindStreamToVideo();
    }
  }, [cameraActive, bindStreamToVideo]);

  // Cleanup camera, animations, and speech on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
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

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const pred of predictions) {
      const [x, y, width, height] = pred.bbox;
      const isPerson = pred.label.toLowerCase() === 'person';

      // Neon bounding box: emerald green for person/face, cyan for general objects
      ctx.strokeStyle = isPerson ? '#00ff88' : '#00e5ff';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);

      // Label background badge
      const displayLabel = isPerson ? `👤 Person / Face (${pred.score}%)` : `${pred.label} (${pred.score}%)`;
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      const textWidth = ctx.measureText(displayLabel).width;
      const tagY = y > 30 ? y - 28 : y;

      ctx.fillStyle = 'rgba(11, 15, 25, 0.9)';
      ctx.fillRect(x, tagY, textWidth + 16, 26);

      // Label text
      ctx.fillStyle = isPerson ? '#00ff88' : '#ffffff';
      ctx.fillText(displayLabel, x + 8, tagY + 18);
    }
  }, []);

  const startScanCycleRef = useRef(null);

  // Complete the 5-second scanning cycle and vocalize aggregated summary
  const finishScanCycle = useCallback(async () => {
    if (!cameraActiveRef.current) return;

    setScanPhase('speaking');
    scanPhaseRef.current = 'speaking';

    playAudioCue('complete');
    triggerHaptic([80, 40, 80]);

    const summary = formatAggregatedScanDescription(
      scanAccumulatorRef.current,
      scanFramesCountRef.current
    );

    setLastSpoken(summary);

    // Speak without being interrupted by frame detections
    await speak(summary, { interrupt: true });

    // After speech ends, if auto-scan is active, enter quiet pause before next scan
    if (autoScanEnabledRef.current && cameraActiveRef.current) {
      setScanPhase('paused');
      scanPhaseRef.current = 'paused';

      pauseTimerRef.current = setTimeout(() => {
        if (cameraActiveRef.current && autoScanEnabledRef.current && startScanCycleRef.current) {
          startScanCycleRef.current();
        }
      }, 3000); // 3s quiet time so the user can process what was said
    } else {
      setScanPhase('ready');
      scanPhaseRef.current = 'ready';
    }
  }, []);

  // Trigger a full 5-second surroundings scanning cycle
  const startScanCycle = useCallback(() => {
    if (!cameraActiveRef.current) return;

    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    setScanPhase('scanning');
    scanPhaseRef.current = 'scanning';
    setScanCountdown(5);
    scanAccumulatorRef.current = new Map();
    scanFramesCountRef.current = 0;

    playAudioCue('start');
    triggerHaptic([60]);

    let remaining = 5;
    scanTimerRef.current = setInterval(() => {
      remaining -= 1;
      setScanCountdown(remaining);

      // Subtle auditory ticks at 3s and 2s so blind users know scanning is actively underway
      if (remaining === 3 || remaining === 2) {
        playAudioCue('tick');
        triggerHaptic([30]);
      }

      if (remaining <= 0) {
        if (scanTimerRef.current) {
          clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        finishScanCycle();
      }
    }, 1000);
  }, [finishScanCycle]);

  useEffect(() => {
    startScanCycleRef.current = startScanCycle;
  }, [startScanCycle]);

  // Continuous frame analysis loop: renders live boxes and accumulates 10s scan data
  useEffect(() => {
    if (!cameraActive) return;

    let animId = null;

    const detectFrame = async () => {
      const video = videoRef.current;
      const now = Date.now();

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        isModelReady() &&
        !isDetectingRef.current &&
        now - lastDetectionTimeRef.current >= 350
      ) {
        isDetectingRef.current = true;
        lastDetectionTimeRef.current = now;

        try {
          const predictions = await detectObjects(video, 0.35);
          setDetectedObjects(predictions);
          drawDetections(predictions);

          // If currently in the 10-second scanning phase, accumulate detections across frames!
          if (scanPhaseRef.current === 'scanning' && predictions.length > 0) {
            scanFramesCountRef.current += 1;
            const frameCounts = new Map();

            for (const pred of predictions) {
              frameCounts.set(pred.label, (frameCounts.get(pred.label) || 0) + 1);

              let entry = scanAccumulatorRef.current.get(pred.label);
              if (!entry) {
                entry = {
                  frameCount: 0,
                  maxCountInFrame: 0,
                  locations: new Map(),
                  maxScore: 0,
                };
                scanAccumulatorRef.current.set(pred.label, entry);
              }

              entry.frameCount += 1;
              entry.maxScore = Math.max(entry.maxScore, pred.score);
              const locCount = entry.locations.get(pred.location) || 0;
              entry.locations.set(pred.location, locCount + 1);
            }

            for (const [lbl, cnt] of frameCounts.entries()) {
              const entry = scanAccumulatorRef.current.get(lbl);
              if (entry) {
                entry.maxCountInFrame = Math.max(entry.maxCountInFrame, cnt);
              }
            }
          }
          // NOTICE: NO speak() calls here! Speech is triggered ONLY by the 10s scan aggregation.
          // This completely prevents overlapping, stuttering, and voice jitter!
        } catch (err) {
          console.warn('[DigitalVision] Detection frame error:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }

      animId = requestAnimationFrame(detectFrame);
    };

    animId = requestAnimationFrame(detectFrame);

    return () => {
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [cameraActive, drawDetections]);

  // Handle Start Camera & Surroundings Detection
  const handleStartDetection = async (chosenFacingMode) => {
    const targetFacing = chosenFacingMode || facingMode;
    setCameraStarting(true);
    setCameraError(null);
    setModelError(null);

    // Stop previous stream to guarantee clean renegotiation
    stopCamera();

    const success = await startCamera({ facingMode: targetFacing });

    if (!success) {
      setCameraStarting(false);
      const errMsg =
        'Camera permission was denied or no camera device is available. Please check browser permissions and allow camera access.';
      setCameraError(errMsg);
      speak(errMsg);
      return;
    }

    setCameraActive(true);
    cameraActiveRef.current = true;
    setCameraStarting(false);

    // Ensure video element receives stream as soon as mounted
    setTimeout(() => {
      bindStreamToVideo();
    }, 50);

    // Load pretrained COCO-SSD model if not yet loaded
    if (!isModelReady()) {
      try {
        setModelLoading(true);
        speak('Camera active. Loading AI detection model.');
        await loadDetectionModel();
        setModelLoading(false);
        setModelReady(true);
        await speak('AI detection ready. Starting 5-second surroundings scan.');
        if (cameraActiveRef.current && startScanCycleRef.current) {
          startScanCycleRef.current();
        }
      } catch (err) {
        setModelLoading(false);
        const errText = `Detection model could not be loaded: ${err.message || 'Network error'}. Live camera feed is active.`;
        setModelError(errText);
        speak(errText);
      }
    } else {
      speak(
        targetFacing === 'user'
          ? 'Front camera active. Starting 5-second surroundings scan.'
          : 'Surroundings camera active. Starting 5-second scan. Move camera slowly.'
      );
      setTimeout(() => {
        if (cameraActiveRef.current && startScanCycleRef.current) {
          startScanCycleRef.current();
        }
      }, 1500);
    }
  };

  // Flip Camera (Front / Back switch)
  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (cameraActive) {
      setCameraStarting(true);
      await startCamera({ facingMode: nextMode });
      setCameraStarting(false);
      setTimeout(() => {
        bindStreamToVideo();
      }, 50);
      speak(
        nextMode === 'user'
          ? 'Switched to front face camera. Starting fresh scan.'
          : 'Switched to rear surroundings camera. Starting fresh scan.'
      );
      setTimeout(() => {
        if (cameraActiveRef.current && startScanCycleRef.current) {
          startScanCycleRef.current();
        }
      }, 1200);
    }
  };

  // Deep Gemini AI Scene Scan
  const handleDeepAiAnalysis = async () => {
    if (!cameraActive) {
      speak('Please start the camera first.');
      return;
    }

    setIsAnalyzingAi(true);
    speak('Analyzing full scene with Deep AI.');

    try {
      const frameBase64 = captureFrame(videoRef.current);
      if (!frameBase64) {
        throw new Error('Unable to capture camera frame. Ensure camera is active.');
      }

      const result = await analyzeImage({
        imageBase64: frameBase64,
        intent: 'DESCRIBE_SURROUNDINGS',
      });

      if (result && result.speech && result.speech !== 'Analysis unavailable.') {
        setLastSpoken(result.speech);
        speak(result.speech);
      } else {
        const notice =
          'Deep AI cloud analysis requires the backend server running with GEMINI_API_KEY. Real-time on-device AI is currently active.';
        setLastSpoken(notice);
        speak(notice);
      }
    } catch (err) {
      const notice = `Deep AI analysis notice: ${err.message || 'Server unavailable'}. Real-time detection active.`;
      setLastSpoken(notice);
      speak(notice);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Handle Stop Camera
  const handleStopCamera = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    setScanPhase('idle');
    scanPhaseRef.current = 'idle';
    cameraActiveRef.current = false;

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
          Real-time AI camera detection and spoken guidance for visually impaired users
        </p>

        {/* AI Readiness Pill */}
        <div
          className={`ai-status-badge ${modelLoading ? 'loading' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span>{modelLoading ? '⏳' : modelReady ? '⚡' : '🤖'}</span>
          <span>
            {modelLoading
              ? 'Loading AI Model...'
              : modelReady
              ? 'TensorFlow AI Engine: Ready'
              : 'AI Engine: Standby'}
          </span>
        </div>
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
            Tap anywhere on the screen below to open the camera and receive 5-second spoken surroundings descriptions.
          </p>
        </section>

        {/* Error Banners */}
        {cameraError && (
          <div className="alert-card error" role="alert" aria-live="assertive">
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>
              ⚠️
            </span>
            <div>
              <strong>Camera Access Notice:</strong> {cameraError}
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Tip: Click the camera / lock icon in your browser address bar to allow camera access, then try again.
              </div>
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

        {/* Camera Facing Selector (Front Face Camera vs Back Surroundings Camera) */}
        <div
          className="facing-selector"
          role="radiogroup"
          aria-label="Camera Facing Selection"
        >
          <button
            type="button"
            className={`mode-pill ${facingMode === 'user' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setFacingMode('user');
              if (cameraActive) handleStartDetection('user');
            }}
            aria-checked={facingMode === 'user'}
            role="radio"
          >
            <span>👤 Front Camera (Face / Selfie)</span>
          </button>
          <button
            type="button"
            className={`mode-pill ${facingMode === 'environment' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setFacingMode('environment');
              if (cameraActive) handleStartDetection('environment');
            }}
            aria-checked={facingMode === 'environment'}
            role="radio"
          >
            <span>📷 Back Camera (Surroundings)</span>
          </button>
        </div>

        {/* Dynamic State: Inactive (Tap Anywhere) vs Active Camera */}
        {!cameraActive ? (
          <div
            id="main-action"
            className="tap-to-start-screen"
            role="button"
            tabIndex={0}
            onClick={() => !cameraStarting && handleStartDetection(facingMode)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                if (!cameraStarting) handleStartDetection(facingMode);
              }
            }}
            aria-label={`Tap anywhere on the screen to start detection using ${
              facingMode === 'user' ? 'front face camera' : 'rear surroundings camera'
            }`}
          >
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
                  <span style={{ fontSize: '2.5rem' }}>
                    {facingMode === 'user' ? '👤' : '📷'}
                  </span>
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

            {/* Tap Anywhere Accessible Banner */}
            <div className="tap-prompt-container">
              <div className="tap-pulse-icon" aria-hidden="true">
                👆
              </div>
              <h2 className="tap-prompt-title">
                {cameraStarting ? 'Starting Camera...' : 'Tap Anywhere to Start'}
              </h2>
              <p className="tap-prompt-subtitle">
                {cameraStarting
                  ? 'Accessing camera and initializing surroundings AI...'
                  : `Touch or click anywhere on the screen to begin 5-second surroundings scanning (${
                      facingMode === 'user' ? 'Front / Face' : 'Rear / Surroundings'
                    })`}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 5-Second Surroundings Scan Status & Progress Card */}
            <div
              className="scan-status-card"
              role="region"
              aria-label="5-second surroundings scan progress"
            >
              <div className="scan-status-header">
                <div
                  className={`scan-badge ${scanPhase}`}
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden="true">
                    {scanPhase === 'scanning'
                      ? '⏱️'
                      : scanPhase === 'speaking'
                      ? '🗣️'
                      : scanPhase === 'paused'
                      ? '⏸️'
                      : '✅'}
                  </span>
                  <span>
                    {scanPhase === 'scanning'
                      ? `Scanning surroundings: ${scanCountdown}s remaining...`
                      : scanPhase === 'speaking'
                      ? 'Describing surroundings aloud...'
                      : scanPhase === 'paused'
                      ? 'Quiet pause (preparing next scan)...'
                      : 'Ready for 5-second scan'}
                  </span>
                </div>

                {scanPhase === 'scanning' && (
                  <span className="scan-countdown-text" aria-hidden="true">
                    {scanCountdown}s
                  </span>
                )}
              </div>

              {/* Accessible High-Contrast Progress Bar */}
              <div
                className="scan-progress-container"
                role="progressbar"
                aria-valuenow={scanPhase === 'scanning' ? 5 - scanCountdown : 5}
                aria-valuemin={0}
                aria-valuemax={5}
                aria-label={`Surroundings scan ${scanPhase === 'scanning' ? `${5 - scanCountdown} of 5 seconds` : scanPhase}`}
              >
                <div
                  className={`scan-progress-bar ${scanPhase === 'speaking' ? 'speaking' : ''}`}
                  style={{
                    width:
                      scanPhase === 'scanning'
                        ? `${((5 - scanCountdown) / 5) * 100}%`
                        : scanPhase === 'speaking'
                        ? '100%'
                        : '0%',
                  }}
                ></div>
              </div>
            </div>

            {/* Live Camera Feed & Canvas Overlay */}
            <div
              className="camera-card"
              aria-label="Live camera feed showing detected surroundings"
            >
              <div className="camera-status-pill">
                <span className="indicator-dot" aria-hidden="true"></span>
                <span>
                  {modelLoading
                    ? 'Loading AI Model...'
                    : `Live: ${facingMode === 'user' ? 'Front (Face)' : 'Rear (Surroundings)'} (${detectedObjects.length} in view)`}
                </span>
              </div>

              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && cameraActive) {
                    bindStreamToVideo(el);
                  }
                }}
                onLoadedMetadata={() => bindStreamToVideo()}
                onCanPlay={() => bindStreamToVideo()}
                className={`camera-video ${facingMode === 'user' ? 'mirrored' : ''}`}
                autoPlay
                playsInline
                muted
                aria-label="Camera live preview"
              ></video>

              <canvas
                ref={canvasRef}
                className={`camera-overlay ${facingMode === 'user' ? 'mirrored' : ''}`}
                aria-hidden="true"
              ></canvas>
            </div>

            {/* Controls Row */}
            <div
              className="controls-row"
              role="toolbar"
              aria-label="Surroundings Controls"
            >
              {/* Primary 5-Second Scan Button */}
              <button
                className="btn btn-scan-now"
                onClick={startScanCycle}
                aria-label="Trigger immediate 5-second surroundings scan"
              >
                <span aria-hidden="true">🔍</span>
                <span>Scan Now (5s)</span>
              </button>

              {/* Continuous Auto-Scan Toggle */}
              <button
                className={`btn btn-autocycle ${autoScanEnabled ? 'active' : ''}`}
                onClick={() => {
                  const nextVal = !autoScanEnabled;
                  setAutoScanEnabled(nextVal);
                  speak(
                    nextVal
                      ? 'Continuous 5-second auto-scan enabled.'
                      : 'Auto-scan paused. Press Scan Now button to scan when ready.'
                  );
                }}
                aria-label={
                  autoScanEnabled
                    ? 'Continuous 5-second auto-scan is active. Press to pause automatic cycling.'
                    : 'Continuous auto-scan is paused. Press to resume automatic cycling.'
                }
              >
                <span aria-hidden="true">{autoScanEnabled ? '🔄' : '⏸️'}</span>
                <span>{autoScanEnabled ? 'Auto-Scan: ON' : 'Auto-Scan: OFF'}</span>
              </button>

              <button
                className="btn btn-danger"
                onClick={handleStopCamera}
                aria-label="Stop Camera"
              >
                <span aria-hidden="true">⏹️</span>
                <span>Stop Camera</span>
              </button>

              <button
                className="btn btn-flip"
                onClick={handleFlipCamera}
                disabled={cameraStarting}
                aria-label={`Flip to ${facingMode === 'user' ? 'Rear Camera' : 'Front Face Camera'}`}
              >
                <span aria-hidden="true">🔄</span>
                <span>
                  {facingMode === 'user' ? 'Flip to Rear' : 'Flip to Front (Face)'}
                </span>
              </button>

              <button
                className="btn btn-primary"
                onClick={handleRepeatDescription}
                aria-label="Repeat Last Spoken Description"
              >
                <span aria-hidden="true">🔁</span>
                <span>Repeat</span>
              </button>

              <button
                className="btn btn-ai"
                onClick={handleDeepAiAnalysis}
                disabled={isAnalyzingAi}
                aria-label="Deep AI Scene Analysis"
              >
                <span aria-hidden="true">🧠</span>
                <span>{isAnalyzingAi ? 'Analyzing...' : 'Deep AI Scan'}</span>
              </button>

              <button
                className="btn"
                onClick={handleToggleVoice}
                aria-label={
                  voiceMuted ? 'Resume Voice Announcements' : 'Pause Voice Announcements'
                }
              >
                <span aria-hidden="true">{voiceMuted ? '🔇' : '🔊'}</span>
                <span>{voiceMuted ? 'Resume Voice' : 'Pause Voice'}</span>
              </button>
            </div>

            {/* Live Detections List */}
            {detectedObjects.length > 0 && (
              <section
                className="detections-panel"
                aria-labelledby="detections-title"
              >
                <div className="detections-heading">
                  <h3 id="detections-title">Detected Objects & People in View</h3>
                  <span className="location-pill">Real-Time AI</span>
                </div>
                <div className="detections-grid">
                  {detectedObjects.map((obj, idx) => {
                    const isPerson = obj.label.toLowerCase() === 'person';
                    return (
                      <div
                        className="detection-chip"
                        key={`${obj.label}-${idx}`}
                        style={
                          isPerson
                            ? { borderColor: '#00ff88', boxShadow: '0 0 10px rgba(0,255,136,0.2)' }
                            : {}
                        }
                      >
                        <span className="chip-label">
                          {isPerson ? '👤 Person / Face' : obj.label}
                        </span>
                        <div className="chip-meta">
                          <span>Confidence: {obj.score}%</span>
                          <span className="location-pill">{obj.location}</span>
                        </div>
                      </div>
                    );
                  })}
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
