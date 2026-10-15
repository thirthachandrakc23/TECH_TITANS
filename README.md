# DigitalVision

**AI-Powered Environmental Awareness and Navigation for the Visually Impaired**

> *Team: TECH TITANS — HACK ATTACK 2026*

---

## Current Status

**Stage 1: project scaffold only.** No camera, detection, or speech features exist yet. The application currently displays a placeholder page describing planned functionality.

---

## Problem Statement

Visually impaired users need accessible, real-time information about their surroundings. DigitalVision aims to use a device camera combined with browser-based object detection and text-to-speech to describe nearby objects aloud — all running entirely in the browser with no server, no accounts, and no cost.

---

## Technology Choices

| Technology | Why |
|---|---|
| **React + Vite** | Fast development with hot module replacement; lightweight production builds |
| **JavaScript (no TypeScript)** | Lower learning curve for the team; faster iteration during a hackathon |
| **Plain CSS** | Full control, no framework lock-in, accessibility-first custom properties |
| **Browser-based pretrained detection** (planned) | Free, runs offline in the browser, no API keys or server needed |
| **Browser text-to-speech** (planned) | Built into every modern browser, zero dependencies |
| **OCR** (optional, planned) | Read printed text from camera frames for additional context |
| **No backend or database** | Keeps the project simple, private (no data leaves the device), and free to host as a static site |

---

## Prerequisites

- **Node.js** ≥ 18.0.0 (v24.x recommended; the installed Vite 8 requires Node 18+)
- **npm** ≥ 9.0.0
- **Git**

---

## Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd TECH_TITANS

# 2. Install dependencies
cd frontend
npm install

# 3. Start the development server
npm run dev
# Opens at http://localhost:5173

# 4. Build for production
npm run build

# 5. Preview the production build locally
npm run preview
```

---

## Repository Structure

```
TECH_TITANS/                    (repository root)
├── frontend/                   React + Vite application
│   ├── public/                 Static assets
│   ├── src/
│   │   ├── components/         Reusable UI components
│   │   ├── pages/              Page-level components
│   │   │   └── HomePage.jsx    Placeholder landing page
│   │   ├── services/           Camera, detection, speech modules (planned)
│   │   ├── styles/
│   │   │   └── global.css      Global styles and CSS custom properties
│   │   ├── App.jsx             Root application component
│   │   └── main.jsx            Entry point
│   ├── index.html              HTML shell
│   ├── package.json            Dependencies and scripts
│   └── vite.config.js          Vite configuration
├── docs/                       Project documentation
│   ├── architecture.md         Architecture overview
│   ├── api-contract.md         Service layer contract (draft)
│   ├── testing.md              Testing guide and checklist
│   └── demo-script.md          Demo preparation template
├── .gitignore                  Git ignore rules
└── README.md                   This file
```

---

## Team Roles and Responsibilities

> **Note:** These are suggested assignments to be confirmed by the Team Lead.

| Role | Person | Primary Areas |
|---|---|---|
| **Team Lead** | TBD | Root config, `App.jsx`, `main.jsx`, `docs/architecture.md`, Git workflow, integration, deployment |
| **Frontend Developer** | TBD | `src/components/`, `src/pages/`, `src/styles/` |
| **AI Developer** | TBD | `src/services/` (camera, detection, speech, OCR modules) |
| **QA / Documentation** | TBD | `docs/testing.md`, `docs/demo-script.md`, README polish, accessibility testing |

---

## Planned Development Stages

All stages below are **planned, not done**, unless marked otherwise.

1. **Stage 1 — Project setup and scaffold** ✅ *(this stage — completed)*
2. **Stage 2 — Camera access** — Request permission, display live video feed
3. **Stage 3 — Object detection** — Integrate a free pretrained browser-based model to detect objects in camera frames
4. **Stage 4 — Speech output** — Generate spoken descriptions of detected objects using the Web Speech API
5. **Stage 5 — Accessibility polish and error states** — Keyboard navigation, screen reader support, error messages, edge cases
6. **Stage 6 — Optional OCR** — Read printed text from camera frames
7. **Stage 7 — Deployment over HTTPS and demo preparation** — Host as a static site with HTTPS (required for camera access), prepare and rehearse the demo

---

## Limitations

> **These are fundamental constraints, not bugs to be fixed.**

- **HTTPS required:** Browser camera access requires HTTPS (or `localhost`). The deployed site must use HTTPS.
- **User permission required:** The browser will prompt the user to allow camera access. If denied, the app cannot function.
- **Basic detection only:** Pretrained browser-based object detection cannot measure distance, guarantee collision avoidance, or provide safe navigation guidance.
- **Not a safety device:** DigitalVision is an assistive aid. It must not be relied on for safe movement or obstacle avoidance. Users should always use established mobility aids.
- **Browser compatibility:** Features depend on browser support for WebRTC (camera), Web Speech API (TTS), and WebGL/WASM (detection model). Not all browsers support all features.
- **Performance varies:** Detection speed depends on the user's device hardware. Older or low-powered devices may experience delays.

---

## License

TBD — to be decided by the team.
