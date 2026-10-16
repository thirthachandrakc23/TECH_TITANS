/**
 * DigitalVision — Accessible Voice-First Assistive Vision Hub
 *
 * Real working frontend for visually impaired users.
 * Driven entirely by voice commands:
 * - Assistant directly invites conversation upon opening
 * - No buttons needed to choose options; the user's voice selects and activates modes
 * - Free in-browser SpeechRecognition + SpeechSynthesis + Web Audio API cues
 * - Book Reading Mode: Free in-browser Tesseract OCR reading pages aloud
 * - Navigation Mode: Place-to-place directional walking guidance with obstacle avoidance
 * - Surroundings Description Mode: Multi-frame scene scanning with TensorFlow.js COCO-SSD
 * - Object & Washroom Finder Modes
 * - Global hands-free voice control ("read book", "navigate to kitchen", "stop", "help")
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startCamera,
  stopCamera,
  getVideoStream,
  isCameraActive,
} from '../camera/cameraService.js';
import {
  loadDetectionModel,
  detectObjects,
  isModelReady,
} from '../services/detectionService.js';
import {
  startListening,
  stopListening,
  speak,
  stopSpeaking,
  playAudioCue,
  triggerHaptic,
  initWaveform,
} from '../audio/audioService.js';
import { interpretVoiceCommand } from '../services/localIntentService.js';
import { readBookPage } from '../services/bookReaderService.js';
import { evaluateNavigationGuidance } from '../services/navigationService.js';
import { formatAggregatedScanDescription } from '../services/speechService.js';
import {
  DESCRIBE_SURROUNDINGS,
  READ_TEXT,
  FIND_OBJECT,
  FIND_WASHROOM,
  NAVIGATE_HELP,
  OBSTACLE_CHECK,
  STOP,
  REPEAT,
  HELP,
  CHAT,
} from '../core/intents.js';

const INITIAL_WELCOME =
  'Welcome to DigitalVision. I am your voice assistant, and I am listening. Tell me what you would like to do — such as navigate to a room, read a book, describe your surroundings, or find an object.';

export default function HomePage() {
  // Voice & Conversation States
  const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'listening' | 'processing' | 'speaking'
  const [activeMode, setActiveMode] = useState('conversation'); // 'conversation' | 'navigating' | 'reading' | 'scanning' | 'searching'
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantSpeech, setAssistantSpeech] = useState(INITIAL_WELCOME);
  const [hasStartedVoice, setHasStartedVoice] = useState(false);

  // Camera & Detection States
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // default to rear surroundings camera for assistive use
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [modelLoading, setModelLoading] = useState(() => !isModelReady());

  // Book Reader States
  const [bookText, setBookText] = useState('');
  const [isReadingPage, setIsReadingPage] = useState(false);

  // Navigation States
  const [navDestination, setNavDestination] = useState('');
  const [navAdvice, setNavAdvice] = useState('Checking walking path...');
  const [navDirection, setNavDirection] = useState('straight');
  const [navUrgent, setNavUrgent] = useState(false);

  // Surroundings Scan States
  const [scanCountdown, setScanCountdown] = useState(5);
  const [scanPhase, setScanPhase] = useState('idle');

  // Object Finder State
  const [searchTarget, setSearchTarget] = useState('');

  // DOM Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const handleVoiceCommandRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const lastNavAdviceTimeRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const isReadingRef = useRef(false);
  const hasSpokenWelcomeRef = useRef(false);

  // Multi-frame Scan Accumulators
  const scanAccumulatorRef = useRef(new Map());
  const scanFramesCountRef = useRef(0);
  const scanTimerRef = useRef(null);

  // Bind video stream to element
  const bindStream = useCallback((el) => {
    const video = el || videoRef.current;
    if (!video) return;
    const stream = getVideoStream();
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.defaultMuted = true;
      video.play().catch(() => {});
    }
  }, []);

  // Initialize Waveform Canvas visualizer
  useEffect(() => {
    let cleanup = null;
    if (waveformCanvasRef.current) {
      waveformCanvasRef.current.width = 480;
      waveformCanvasRef.current.height = 60;
      cleanup = initWaveform(waveformCanvasRef.current);
    }
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Preload COCO-SSD detection model in background
  useEffect(() => {
    if (!isModelReady()) {
      loadDetectionModel()
        .then(() => setModelLoading(false))
        .catch(() => setModelLoading(false));
    }
  }, []);

  // Voice Interaction & Autonomous Welcoming
  const startVoiceConversation = useCallback(async () => {
    setHasStartedVoice(true);
    setVoiceState('speaking');

    // Speak initial welcome announcement hands-free
    await speak(INITIAL_WELCOME, { interrupt: true });

    // Open microphone and begin hands-free continuous listening loop
    setVoiceState('listening');
    startListening({
      onTranscript: (transcript, isFinal) => {
        setUserTranscript(transcript);
        if (isFinal) {
          handleVoiceCommandRef.current?.(transcript);
        }
      },
      onStateChange: (state) => {
        setVoiceState(state);
      },
    });
  }, []);

  // Auto-trigger welcome on load (or fall back to first gesture to satisfy browser autoplay policy)
  useEffect(() => {
    if (hasSpokenWelcomeRef.current) return;

    const triggerOnGesture = () => {
      if (hasSpokenWelcomeRef.current) return;
      hasSpokenWelcomeRef.current = true;
      startVoiceConversation();
      window.removeEventListener('pointerdown', triggerOnGesture);
      window.removeEventListener('keydown', triggerOnGesture);
    };

    // Attempt direct speech (supported by some browsers)
    speak(INITIAL_WELCOME, { interrupt: false })
      .then(() => {
        hasSpokenWelcomeRef.current = true;
        setHasStartedVoice(true);
        startListening({
          onTranscript: (transcript, isFinal) => {
            setUserTranscript(transcript);
            if (isFinal) handleVoiceCommandRef.current?.(transcript);
          },
          onStateChange: (state) => setVoiceState(state),
        });
      })
      .catch(() => {
        // Fall back to first interaction gesture
      });

    window.addEventListener('pointerdown', triggerOnGesture, { once: true });
    window.addEventListener('keydown', triggerOnGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', triggerOnGesture);
      window.removeEventListener('keydown', triggerOnGesture);
      stopListening();
      stopSpeaking();
    };
  }, [startVoiceConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn on device camera
  const activateCamera = useCallback(async (facing = 'environment') => {
    if (isCameraActive()) {
      bindStream();
      return true;
    }
    const success = await startCamera({ facingMode: facing });
    if (success) {
      setCameraActive(true);
      setTimeout(() => bindStream(), 60);
    }
    return success;
  }, [bindStream]);

  // Turn off device camera
  const deactivateCamera = useCallback(() => {
    stopCamera();
    setCameraActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  // 1. EXECUTE: BOOK READING MODE
  const executeBookReadingMode = useCallback(async () => {
    setActiveMode('reading');
    isReadingRef.current = true;
    isNavigatingRef.current = false;
    setBookText('Hold book or page steady in front of camera...');

    await activateCamera('environment');

    const promptText =
      'Book reading mode active. Please hold your book or page steady in front of the camera. Reading now...';
    setAssistantSpeech(promptText);
    await speak(promptText, { interrupt: true });

    // Give user 1.2s to align page
    setTimeout(async () => {
      if (!isReadingRef.current) return;

      setIsReadingPage(true);
      playAudioCue('book_snap');
      triggerHaptic([60, 40, 60]);

      const result = await readBookPage(videoRef.current);
      setIsReadingPage(false);

      if (result.success && result.text) {
        setBookText(result.text);
        const speechOutput = `Reading page. ${result.text}. Finished reading page. Say read next page, or say stop.`;
        setAssistantSpeech(speechOutput);
        await speak(speechOutput, { interrupt: true });
      } else {
        const retryMsg =
          'No clear text detected. Please bring the book slightly closer, hold the page flat, and say read page again.';
        setAssistantSpeech(retryMsg);
        await speak(retryMsg, { interrupt: true });
      }
    }, 1200);
  }, [activateCamera]);

  // 2. EXECUTE: NAVIGATION MODE
  const executeNavigationMode = useCallback(async (destination = '') => {
    setActiveMode('navigating');
    isNavigatingRef.current = true;
    isReadingRef.current = false;
    setNavDestination(destination);
    setNavAdvice('Scanning corridor and obstacles ahead...');

    await activateCamera('environment');

    const destMsg = destination
      ? `Starting navigation guidance for ${destination}. Walk forward slowly. I will guide your path and warn you of obstacles.`
      : 'Starting place-to-place navigation. Walk forward slowly. I will guide your path and warn you of obstacles.';

    setAssistantSpeech(destMsg);
    await speak(destMsg, { interrupt: true });
  }, [activateCamera]);

  // 3. EXECUTE: SURROUNDINGS SCAN MODE
  const executeSurroundingsScan = useCallback(async () => {
    setActiveMode('scanning');
    isNavigatingRef.current = false;
    isReadingRef.current = false;

    await activateCamera('environment');

    const startMsg = 'Starting 5-second surroundings scan. Please pan camera slowly around you.';
    setAssistantSpeech(startMsg);
    await speak(startMsg, { interrupt: true });

    setScanPhase('scanning');
    setScanCountdown(5);
    scanAccumulatorRef.current = new Map();
    scanFramesCountRef.current = 0;

    let remaining = 5;
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);

    scanTimerRef.current = setInterval(async () => {
      remaining -= 1;
      setScanCountdown(remaining);

      if (remaining === 3 || remaining === 2) {
        playAudioCue('tick');
      }

      if (remaining <= 0) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
        setScanPhase('speaking');

        playAudioCue('complete');
        const summary = formatAggregatedScanDescription(
          scanAccumulatorRef.current,
          scanFramesCountRef.current
        );

        setAssistantSpeech(summary);
        await speak(summary, { interrupt: true });

        const promptNext = 'Scan complete. What would you like to do next?';
        setAssistantSpeech(promptNext);
        await speak(promptNext, { interrupt: false });
        setActiveMode('conversation');
      }
    }, 1000);
  }, [activateCamera]);

  // 4. EXECUTE: FIND OBJECT / WASHROOM MODE
  const executeFindObjectMode = useCallback(async (target) => {
    setActiveMode('searching');
    setSearchTarget(target);
    isNavigatingRef.current = false;
    isReadingRef.current = false;

    await activateCamera('environment');

    const msg = `Looking for ${target}. Pan camera slowly around the room.`;
    setAssistantSpeech(msg);
    await speak(msg, { interrupt: true });
  }, [activateCamera]);

  // 5. EXECUTE: STOP ALL ACTIVE MODES
  const executeStop = useCallback(async () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    isNavigatingRef.current = false;
    isReadingRef.current = false;

    deactivateCamera();
    stopSpeaking();

    setActiveMode('conversation');
    const stopMsg = 'Stopped. I am listening. What would you like to do next?';
    setAssistantSpeech(stopMsg);
    playAudioCue('stop');
    await speak(stopMsg, { interrupt: true });
  }, [deactivateCamera]);

  // Handle Classified Voice Commands
  const handleVoiceCommand = useCallback(async (transcriptText) => {
    setVoiceState('processing');

    const result = await interpretVoiceCommand(transcriptText);
    const { intent, params = {}, reply } = result;

    switch (intent) {
      case STOP: {
        await executeStop();
        break;
      }

      case READ_TEXT: {
        await executeBookReadingMode();
        break;
      }

      case NAVIGATE_HELP: {
        const dest = params.destination || '';
        await executeNavigationMode(dest);
        break;
      }

      case DESCRIBE_SURROUNDINGS: {
        await executeSurroundingsScan();
        break;
      }

      case FIND_OBJECT: {
        const target = params.target || 'object';
        await executeFindObjectMode(target);
        break;
      }

      case FIND_WASHROOM: {
        await executeFindObjectMode('washroom or restroom');
        break;
      }

      case OBSTACLE_CHECK: {
        await executeNavigationMode('obstacle check');
        break;
      }

      case REPEAT: {
        await speak(assistantSpeech, { interrupt: true });
        break;
      }

      case HELP:
      case CHAT: {
        const responseText =
          reply ||
          'I am DigitalVision. You can say: read book, navigate to room, describe surroundings, find an object, or stop.';
        setAssistantSpeech(responseText);
        await speak(responseText, { interrupt: true });
        break;
      }

      default: {
        const unknownResponse =
          reply ||
          'I heard your command, but I did not recognize that option. You can say: read book, navigate, describe surroundings, or help.';
        setAssistantSpeech(unknownResponse);
        await speak(unknownResponse, { interrupt: true });
        break;
      }
    }
  }, [
    executeStop,
    executeBookReadingMode,
    executeNavigationMode,
    executeSurroundingsScan,
    executeFindObjectMode,
    assistantSpeech,
  ]);

  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  // Frame detection loop: draws boxes, feeds navigation advisor, accumulates scans, searches targets
  useEffect(() => {
    if (!cameraActive) return;

    let animId = null;

    const processFrame = async () => {
      const video = videoRef.current;
      const now = Date.now();

      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        isModelReady() &&
        !isDetectingRef.current &&
        now - lastDetectionTimeRef.current >= 300
      ) {
        isDetectingRef.current = true;
        lastDetectionTimeRef.current = now;

        try {
          const predictions = await detectObjects(video, 0.35);
          setDetectedObjects(predictions);

          // Draw Bounding Boxes on overlay canvas
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            const w = video.videoWidth || 640;
            const h = video.videoHeight || 480;

            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, w, h);

              // Draw navigation corridor guides if in navigation mode
              if (isNavigatingRef.current) {
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 8]);
                ctx.beginPath();
                ctx.moveTo(w * 0.33, 0);
                ctx.lineTo(w * 0.33, h);
                ctx.moveTo(w * 0.67, 0);
                ctx.lineTo(w * 0.67, h);
                ctx.stroke();
                ctx.setLineDash([]);
              }

              for (const pred of predictions) {
                const [x, y, width, height] = pred.bbox;
                const isPerson = pred.label.toLowerCase() === 'person';

                ctx.strokeStyle = isPerson ? '#00ff88' : '#00e5ff';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, width, height);

                const labelText = `${pred.label} (${pred.score}%)`;
                ctx.font = 'bold 16px system-ui, sans-serif';
                const tagW = ctx.measureText(labelText).width + 16;
                const tagY = y > 30 ? y - 28 : y;

                ctx.fillStyle = 'rgba(11, 15, 25, 0.9)';
                ctx.fillRect(x, tagY, tagW, 26);

                ctx.fillStyle = isPerson ? '#00ff88' : '#ffffff';
                ctx.fillText(labelText, x + 8, tagY + 18);
              }
            }
          }

          // 1. Navigation Mode Real-Time Evaluation
          if (isNavigatingRef.current && now - lastNavAdviceTimeRef.current >= 3200) {
            lastNavAdviceTimeRef.current = now;

            const guidance = evaluateNavigationGuidance(
              predictions,
              video.videoWidth,
              video.videoHeight,
              navDestination
            );

            setNavAdvice(guidance.spokenAdvice);
            setNavDirection(guidance.direction);
            setNavUrgent(guidance.isUrgent);

            playAudioCue('nav_ping');
            if (guidance.isUrgent) {
              playAudioCue('warning');
              triggerHaptic([100, 50, 100]);
            }

            speak(guidance.spokenAdvice, { interrupt: guidance.isUrgent });
          }

          // 2. Surroundings Scan Accumulation
          if (scanPhase === 'scanning' && predictions.length > 0) {
            scanFramesCountRef.current += 1;
            for (const pred of predictions) {
              let entry = scanAccumulatorRef.current.get(pred.label);
              if (!entry) {
                entry = { frameCount: 0, maxCountInFrame: 0, locations: new Map(), maxScore: 0 };
                scanAccumulatorRef.current.set(pred.label, entry);
              }
              entry.frameCount += 1;
              entry.maxScore = Math.max(entry.maxScore, pred.score);
              const loc = pred.location || 'center';
              entry.locations.set(loc, (entry.locations.get(loc) || 0) + 1);
            }
          }

          // 3. Object / Target Search Mode
          if (activeMode === 'searching' && searchTarget) {
            const matched = predictions.find((p) =>
              p.label.toLowerCase().includes(searchTarget.toLowerCase())
            );
            if (matched && now - lastNavAdviceTimeRef.current >= 4000) {
              lastNavAdviceTimeRef.current = now;
              playAudioCue('complete');
              triggerHaptic([80, 50, 80]);
              const foundMsg = `Found ${matched.label} on your ${matched.location}!`;
              setAssistantSpeech(foundMsg);
              speak(foundMsg, { interrupt: true });
            }
          }
        } catch (err) {
          console.warn('[DigitalVision] Frame processing error:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }

      animId = requestAnimationFrame(processFrame);
    };

    animId = requestAnimationFrame(processFrame);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [cameraActive, scanPhase, activeMode, searchTarget, navDestination]);

  // Flip Camera between front & rear
  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await startCamera({ facingMode: nextFacing });
    setTimeout(() => bindStream(), 50);
    speak(nextFacing === 'user' ? 'Switched to front camera.' : 'Switched to rear surroundings camera.');
  };

  // Screen Tap / Key gesture handler: interrupts speech and triggers voice listening
  const handleScreenInteraction = () => {
    if (activeMode !== 'conversation') {
      executeStop();
      return;
    }

    if (voiceState === 'speaking') {
      stopSpeaking();
      setVoiceState('listening');
      startListening({
        onTranscript: (t, isFinal) => {
          setUserTranscript(t);
          if (isFinal) handleVoiceCommand(t);
        },
        onStateChange: (s) => setVoiceState(s),
      });
      return;
    }

    if (!hasStartedVoice) {
      startVoiceConversation();
    } else {
      playAudioCue('listen_start');
      setVoiceState('listening');
      startListening({
        onTranscript: (t, isFinal) => {
          setUserTranscript(t);
          if (isFinal) handleVoiceCommand(t);
        },
        onStateChange: (s) => setVoiceState(s),
      });
    }
  };

  return (
    <div
      className="app-container"
      onClick={handleScreenInteraction}
      role="region"
      aria-label="DigitalVision Voice-Controlled Assistive Assistant"
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Semantic Top-Level Heading */}
      <header className="app-header">
        <h1 className="app-title">DigitalVision</h1>
      </header>

      <main className="app-main" id="main-content">
        {/* Voice Assistant Hub (No manual option buttons; purely voice-driven) */}
        <section
          className={`voice-assistant-hub ${voiceState} ${activeMode}`}
          aria-live="polite"
          role="region"
          aria-label="Voice conversation assistant"
        >
          {/* Glowing Animated Microphone Orb */}
          <div
            className={`mic-glow-orb ${voiceState} ${activeMode}`}
            aria-hidden="true"
          >
            {activeMode === 'reading'
              ? '📖'
              : activeMode === 'navigating'
              ? '🧭'
              : activeMode === 'scanning'
              ? '👁️'
              : voiceState === 'listening'
              ? '🎙️'
              : voiceState === 'speaking'
              ? '🗣️'
              : '✨'}
          </div>

          {/* Mode Status Pill */}
          <div className={`voice-mode-badge ${voiceState} ${activeMode}`}>
            <span className="indicator-dot" aria-hidden="true"></span>
            <span>
              {activeMode === 'reading'
                ? '📖 Book Reading Active'
                : activeMode === 'navigating'
                ? `🧭 Navigation Active: ${navDestination || 'Walking Guidance'}`
                : activeMode === 'scanning'
                ? `👁️ Scanning Surroundings (${scanCountdown}s)`
                : activeMode === 'searching'
                ? `🔍 Searching for: ${searchTarget}`
                : voiceState === 'listening'
                ? '🎙️ Listening to Your Voice...'
                : voiceState === 'processing'
                ? '⚙️ Understanding Command...'
                : voiceState === 'speaking'
                ? '💬 Speaking...'
                : '✨ Voice Ready — Speak Anytime'}
            </span>
          </div>

          {/* Prompt Title */}
          <h2 className="voice-prompt-title">
            {activeMode === 'reading'
              ? 'Reading Book / Document'
              : activeMode === 'navigating'
              ? 'Walking Navigation Guidance'
              : voiceState === 'listening'
              ? "I'm Listening. What Do You Need?"
              : 'Talk Directly with Your Voice'}
          </h2>

          <p className="voice-prompt-hint">
            {activeMode === 'reading'
              ? 'Hold book or document flat in front of camera. Say "read page", "read next page", or "stop".'
              : activeMode === 'navigating'
              ? 'Walk forward slowly. I will announce clear corridors and warning hazards. Say "stop" anytime.'
              : 'No buttons needed. Just say: "read book", "navigate to kitchen", "describe surroundings", or "find keys".'}
          </p>

          {/* Live Waveform Audio Visualizer Canvas */}
          <div className="waveform-box" aria-hidden="true">
            <canvas ref={waveformCanvasRef} className="waveform-canvas"></canvas>
          </div>

          {/* Live User Voice Transcript Bubble */}
          {userTranscript && (
            <div className="user-transcript-bubble" role="status" aria-label="What you said">
              <span className="transcript-speaker-icon" aria-hidden="true">
                🗣️
              </span>
              <div className="transcript-content">
                <div className="transcript-title">You Said</div>
                <div className="transcript-text">"{userTranscript}"</div>
              </div>
            </div>
          )}

          {/* Tap-Anywhere Accessibility Notice */}
          <div className="tap-to-talk-helper" aria-hidden="true">
            <span>👆 Tap anywhere on screen to speak, interrupt, or stop</span>
          </div>
        </section>

        {/* Live Active Navigation Guidance Card */}
        {activeMode === 'navigating' && (
          <section
            className={`nav-guidance-card ${navUrgent ? 'urgent' : ''}`}
            aria-live="assertive"
            role="alert"
          >
            <div className="nav-header">
              <span className="nav-destination-pill">
                Destination: {navDestination || 'Open Path'}
              </span>
              <span className="location-pill">
                {navUrgent ? '⚠️ HAZARD ALERT' : 'GUIDED CORRIDOR'}
              </span>
            </div>

            <div className="nav-direction-arrow">
              <span>
                {navDirection === 'straight'
                  ? '⬆️ Straight Ahead'
                  : navDirection === 'left'
                  ? '⬅️ Steer Left'
                  : navDirection === 'right'
                  ? '➡️ Steer Right'
                  : '🛑 Stop & Step Aside'}
              </span>
            </div>

            <div className="nav-advice-text">{navAdvice}</div>
          </section>
        )}

        {/* Live Book Reading OCR Display Card */}
        {activeMode === 'reading' && (
          <section
            className="book-reading-card"
            aria-live="polite"
            role="region"
            aria-label="Book page reader"
          >
            <div className="book-reading-header">
              <div className="book-reading-title">
                <span>📖</span>
                <span>{isReadingPage ? 'Reading page text...' : 'Page Content'}</span>
              </div>
              <span className="location-pill">Tesseract Free OCR</span>
            </div>

            <div className="book-text-display">
              {bookText || 'Position page in front of camera lens...'}
            </div>
          </section>
        )}

        {/* Live Camera View Card (Displayed whenever camera is active) */}
        {cameraActive && (
          <div
            className="camera-card"
            style={{ marginTop: '1rem' }}
            role="region"
            aria-label="Camera live preview"
          >
            <div className="camera-status-pill">
              <span className="indicator-dot" aria-hidden="true"></span>
              <span>
                {modelLoading
                  ? 'Loading AI...'
                  : `Camera Active: ${facingMode === 'environment' ? 'Surroundings (Rear)' : 'Front'} (${detectedObjects.length} items in view)`}
              </span>
            </div>

            <div className="camera-tap-hint" aria-hidden="true">
              <span>Tap to Stop</span>
            </div>

            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && cameraActive) bindStream(el);
              }}
              onLoadedMetadata={() => bindStream()}
              onCanPlay={() => bindStream()}
              className={`camera-video ${facingMode === 'user' ? 'mirrored' : ''}`}
              autoPlay
              playsInline
              muted
              aria-label="Camera feed"
            ></video>

            <canvas
              ref={canvasRef}
              className={`camera-overlay ${facingMode === 'user' ? 'mirrored' : ''}`}
              aria-hidden="true"
            ></canvas>
          </div>
        )}

        {/* Camera Flip Control (Optional helper for companion) */}
        {cameraActive && (
          <div className="controls-row" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-flip"
              onClick={handleFlipCamera}
              aria-label={`Switch to ${facingMode === 'environment' ? 'front camera' : 'rear camera'}`}
            >
              Switch to {facingMode === 'environment' ? 'Front Camera' : 'Surroundings Camera'}
            </button>
          </div>
        )}

        {/* Live Spoken Caption Banner */}
        <section
          className="caption-banner"
          aria-live="polite"
          role="status"
          aria-label="Assistant spoken reply"
        >
          <span className="caption-icon" aria-hidden="true">
            💬
          </span>
          <div className="caption-text">{assistantSpeech}</div>
        </section>
      </main>

      {/* Footer & Assistive Disclaimer */}
      <footer className="app-footer">
        <p>
          <strong>Assistive Notice:</strong> DigitalVision is an environmental awareness aid. Always use traditional mobility aids like a cane or guide dog.
        </p>
        <p style={{ marginTop: '0.25rem', opacity: 0.75 }}>
          TECH TITANS — HACK ATTACK 2026
        </p>
      </footer>
    </div>
  );
}
