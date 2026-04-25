# transform-and-crop

A browser-based image editor built with React that allows transforming, cropping, resizing, and exporting images in various formats.

## Project Overview

**Purpose:** Client-side image manipulation tool (no server uploads - all processing happens in the browser)

**Tech Stack:**
- React 18.3.1
- TypeScript
- Vite 5.4.10 (build tool)
- Bootstrap 5.3.3 (UI framework)
- pdf-lib (PDF export)
- gifenc (GIF export)
- UTIF (TIFF support)
- bmp-js (BMP encoding)

## How It Works

### Core Pipeline (`src/imagePipeline.ts`)

1. **Image Loading**: Uses browser's `Image` API to load files into HTMLImageElement
2. **Transform**: Applies rotation (0°, 90°, 180°, 270°) and flips (horizontal/vertical)
3. **Crop**: Interactive selection region on canvas, converted between canvas coords and image coords
4. **Resize**: Scale output dimensions (10%-400%)
5. **Export**: Render final canvas and encode to desired format

### Key Functions

| Function | Purpose |
|----------|---------|
| `transformedDimensions()` | Calculate dimensions after rotation |
| `fitTransformedRect()` | Fit image into viewport with aspect ratio |
| `drawTransformedImage()` | Draw rotated/flipped image to canvas |
| `canvasRectToCrop()` | Convert canvas selection to image crop coords |
| `cropToCanvasRect()` | Convert image crop coords to canvas selection |
| `renderExportCanvas()` | Create final output canvas with all transforms |
| `canvasToBlob()` | Convert canvas to blob with fallback handling |

### Export Formats (`src/ImageEditor.tsx`)

- **PNG** - Lossless, supports transparency
- **JPG/JPEG** - Lossy, quality slider (50-100%)
- **WEBP** - Modern format, quality slider
- **AVIF** - Next-gen format
- **GIF** - Indexed color, animated support
- **BMP** - Raw 32-bit BGRA (custom encoder in `src/encoders/bmp.ts`)
- **SVG** - Embeds PNG as base64
- **TIFF** - Uses UTIF library
- **PDF** - Single page PDF with embedded JPEG

## Project Structure

```
src/
├── App.tsx              # Main app shell with navbar/footer
├── ImageEditor.tsx      # Main editor component (1245 lines)
├── imagePipeline.ts     # Core image processing functions
├── index.css            # Global styles
├── main.tsx             # React entry point
└── encoders/
    └── bmp.ts           # Custom BMP encoder
```

## Supported Input Formats

`.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.gif`, `.bmp`, `.svg`, `.tif`, `.tiff`, `.pdf`

## Usage

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Key Features

- **Drag & drop** - Drop images onto the editor stage
- **Interactive crop** - Draw selection rectangle, move/resize with handles
- **Aspect ratio lock** - Maintains proportions during resize
- **Live preview** - Real-time preview of output
- **Quality control** - Adjustable quality for lossy formats
- **Responsive** - Works on desktop and mobile

## Browser Support

Uses Canvas 2D API. All processing happens client-side - no data leaves the browser.