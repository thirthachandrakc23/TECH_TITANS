# DigitalVision Testing Guide

> **Important Testing Rule:**
> A feature is considered "working" only after it has been tested by a team member and the result has been recorded in this document.

---

## Getting Started

### How to Run the App
To start the local development server:
```bash
cd frontend
npm install
npm run dev
```
Open your browser and navigate to: [http://localhost:5173](http://localhost:5173)

### How to Build
To create a production build and check for errors:
```bash
npm run build
```
*(Check the terminal output to ensure the build completes with zero errors).*

To preview and test the production build locally:
```bash
npm run preview
```

### How to Lint
To verify code formatting and identify potential code quality issues:
```bash
npm run lint
```

---

## Manual Test Cases

### Stage 1 Test Cases

| ID | Feature | Steps | Expected Result | Actual Result | Pass/Fail | Device/Browser | Tester |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-001** | Page loads | Open http://localhost:5173 | Page displays without errors | Not yet tested | Pending | | |
| **TC-002** | Single h1 | Inspect page | Exactly one h1 element with text 'DigitalVision' | Not yet tested | Pending | | |
| **TC-003** | Skip link | Press Tab on page load | 'Skip to main content' link appears and is visible | Not yet tested | Pending | | |
| **TC-004** | Keyboard focus | Tab through all elements | Focus outline visible on every focusable element | Not yet tested | Pending | | |
| **TC-005** | Build passes | Run `npm run build` | Build completes without errors | Not yet tested | Pending | | |
| **TC-006** | Dark mode | Set OS to dark mode | Page uses dark color scheme with readable contrast | Not yet tested | Pending | | |

---

## Accessibility Checklist Skeleton

Ensure accessibility checks are executed against the UI as components are developed:

- [ ] **Keyboard-only navigation:** all interactive elements reachable
- [ ] **Screen reader:** meaningful content announced in logical order
- [ ] **Zoom 200%:** no horizontal scrolling, content readable
- [ ] **Contrast:** text contrast at least 4.5:1 against background
- [ ] **Focus visibility:** clearly visible focus indicators
- [ ] **Reduced motion:** animations disabled when `prefers-reduced-motion` is set
