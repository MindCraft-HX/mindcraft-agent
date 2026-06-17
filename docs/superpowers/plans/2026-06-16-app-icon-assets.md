# App Icon Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a black-and-white Windows app icon from the existing white SVG logo and replace the too-small transparent PNG assets.

**Architecture:** Keep the original transparent white SVG untouched. Add a deterministic build script that creates a dedicated app-icon SVG, renders PNG sizes through Electron, validates the pixel coverage, and syncs current runtime copies under `dist/` when that folder exists.

**Tech Stack:** Node.js, Electron renderer capture, node:test.

---

### Task 1: Add Icon Asset Checks

**Files:**
- Create: `test/icon-assets.test.js`

- [ ] Add tests that assert `public/logos/v3/white-app-icon.svg`, `public/logo-white.png`, and `public/logo-white-64.png` exist with the expected black/white asset properties.

### Task 2: Add Icon Generator

**Files:**
- Create: `build/icon-assets.js`
- Modify: `package.json`

- [ ] Implement a script that reads `public/logos/v3/white.svg`, writes `public/logos/v3/white-app-icon.svg`, renders 256 and 64 PNG outputs, and validates output dimensions/coverage.
- [ ] Add `build:icons` npm script.

### Task 3: Generate Assets And Verify

**Files:**
- Modify: `public/logo-white.png`
- Modify: `public/logo-white-64.png`
- Create: `public/logos/v3/white-app-icon.svg`

- [ ] Run the new icon generator.
- [ ] Run the icon tests.
- [ ] Run production build to refresh `dist/` and confirm the app still builds.
