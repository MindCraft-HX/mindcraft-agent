# App Icon Design

## Goal

Fix the MindCraft-Agent Windows app and tray icon so it remains visible on white backgrounds and no longer looks smaller than neighboring tray icons.

## Design

Keep `public/logos/v3/white.svg` as the transparent white logo source. Add a separate app-icon SVG that uses the same white mark on a dark rounded square tile with a thin light edge. The app icon remains black and white, so it stays visually distinct from the color logo used by other MindCraft apps.

The generated PNG assets are:

- `public/logo-white.png`: 256x256 app icon used by Electron and electron-builder.
- `public/logo-white-64.png`: 64x64 app/fallback icon.

The dark tile fills most of the canvas so Windows does not visually shrink the icon because of transparent padding. The white mark is centered and scaled from the existing SVG path data.

## Verification

Automated checks should confirm the app-icon SVG exists, contains only neutral colors, uses the existing white-logo geometry, and generated PNGs are valid square PNGs. A generation-time pixel coverage check should prevent returning to the old mostly-transparent icon shape.
