# Rhinestone Vectorizer

A browser-based tool that converts photos of rhinestone/hotfix bead patterns into precision SVG files ready for CorelDRAW, Illustrator, or Inkscape.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Automatic bead detection** — works on green, pink, and any colored fabric background
- **Sub-pixel precision** — parabolic peak fitting for accurate circle positioning
- **Sensitivity control** — 1-10 slider to tune detection for difficult images
- **Guaranteed no overlap** — mathematically prevents circles from ever overlapping
- **Real-world units** — outputs SVG with exact physical dimensions (inches/mm)
- **Two export modes** — circles-only SVG for cutting, or SVG with embedded photo
- **Interactive editing** — add or remove beads manually with click/tap
- **Mobile friendly** — responsive layout, touch support, iOS Safari compatible

## Live Demo

After deployment, your tool will be at: `https://YOUR-USERNAME.github.io/rhinestone-vectorizer/`

## Quick Start (Local Development)

```bash
# Clone the repo
git clone https://github.com/YOUR-USERNAME/rhinestone-vectorizer.git
cd rhinestone-vectorizer

# Install dependencies
npm install

# Start dev server (opens http://localhost:5173)
npm run dev
```

Or just double-click **`start.bat`** (Windows) or run **`./start.sh`** (Mac/Linux).

## Deployment

See [DEPLOY.md](./DEPLOY.md) for step-by-step GitHub Pages instructions.

Quick version:
1. Update the `base` path in `vite.config.js` to match your repo name
2. Push to GitHub
3. Enable Pages with "GitHub Actions" as source
4. Done — live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`

## How to Use

1. **Upload** a photo (drag-drop, file picker, or Ctrl+V paste)
2. The tool auto-detects all beads as circles
3. **Adjust** the Sensitivity slider if beads are missed or extras appear
4. **Set circle size** — px, mm, or inches; presets for common sizes (1mm, 2mm, 3mm)
5. **Edit** manually with Add/Delete modes (keys: `A`/`D`)
6. **Set DPI** to match your source image (default 96)
7. **Download SVG** — circles only, or with image embedded for reference

## Tech Stack

- **React 18** + **Vite 5** — fast modern build
- **HTML5 Canvas** — image processing in pure JavaScript
- **No external image libraries** — algorithms written from scratch
- **iOS Safari compatible** — manual box blur (no CSS filter dependency)

## Algorithm Pipeline

1. Multi-pass Gaussian blur (3× box blur for iOS compatibility)
2. Median background sampling from image edges
3. Bead probability map (chroma + brightness scoring)
4. Local maxima peak detection with sensitivity threshold
5. Iterative weighted centroid + parabolic sub-pixel refinement
6. Two-pronged outlier removal (isolation + duplicate detection)
7. Mathematically-safe radius calculation (no overlap guarantee)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | View mode |
| `A` | Add bead mode |
| `D` | Delete bead mode |
| `1` `2` `3` | Split / Overlay / SVG view |
| `Ctrl+Z` | Undo |

## Browser Support

- Chrome / Edge 90+
- Firefox 88+
- Safari 14+ (including iOS Safari)

## License

MIT — free to use, modify, distribute.

## Credits

Built for Krushnavi Laser & CNC.
