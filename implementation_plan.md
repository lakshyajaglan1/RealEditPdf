# Watermark Under Original Text & Freeform Rotation Plan

## Goal Description
Enhance the watermark feature in RealFileEdit so that:
1. **Under Original Text**: Watermarks can appear positioned underneath the original text of the PDF (both in the visual interactive canvas with multiply blend mode and in exported PDFs by prepending the watermark content stream in `pdf-lib`).
2. **Rotate Button & Freeform Rotation**: Watermarks feature an on-element quick rotate button, a top rotation handle with continuous smooth mouse-drag rotation to any angle (0° to 360°), mouse wheel scroll rotation, and full angle controls (slider, numeric degree input, quick presets) in both the Watermark Modal and the editor property inspector.

---

## Proposed Changes

### 1. Watermark Modal
#### [MODIFY] [`WatermarkModal.astro`](file:///var/home/lakshya/Documents/realfileedit.com/src/components/editor/WatermarkModal.astro)
- Add **Layering option**:
  - "Under original PDF text (Behind content)" [Default / Recommended]
  - "Over original PDF text (Above content)"
- Upgrade **Rotation Angle controls**:
  - Quick preset buttons: `-45° (Diagonal)`, `0° (Horizontal)`, `45° (Diagonal Up)`, `90° (Vertical)`
  - Continuous angle slider (`-180°` to `180°` or `0°` to `360°`)
  - Direct numeric angle input (`°`)
  - Live interactive preview card displaying the rotated text with chosen opacity and color
- Add page scope options:
  - "Apply to All Pages"
  - "Apply to Current Page Only"

### 2. Editor Toolbar & Property Inspector
#### [MODIFY] [`EditorToolbar.astro`](file:///var/home/lakshya/Documents/realfileedit.com/src/components/editor/EditorToolbar.astro)
- Ensure rotation controls (`btn-prop-rotate-ccw`, `prop-rotate-slider`, `btn-prop-rotate-cw`, `prop-rotate-angle`, `btn-prop-rotate-reset`) and opacity controls are shown when a watermark is selected in the inspector.
- Add a quick "Layer: Behind / In Front" toggle button when watermark is selected.

### 3. Editor Engine & PDF Export
#### [MODIFY] [`PdfEditor.astro`](file:///var/home/lakshya/Documents/realfileedit.com/src/components/editor/PdfEditor.astro)
- **Watermark Annotation Structure**:
  - Store `type: 'watermark'`, `text`, `rotation`, `opacity`, `color`, `fontSize`, `underText: boolean`.
- **Interactive Layer Rendering**:
  - Wrap watermarks in `.annot-rot-wrapper` with `transform: rotate(...)`.
  - Apply `mix-blend-mode: multiply` when `underText` is true so that existing dark text and graphics on the page stay crisp and visible over the watermark.
  - Render an on-element **Rotate Button** (`.annot-rotate-btn`) for quick incremental rotation.
  - Render top-center **Rotation Handle & Stem** (`.annot-rotate-handle`) enabling continuous 360° mouse drag rotation with a live angle badge (`XX°`).
  - Enable mouse wheel rotation on hover.
  - Enable dragging and resizing handles.
- **Watermark Modal Logic**:
  - Connect new sliders, numeric inputs, preset buttons, live preview, and page scope buttons.
- **PDF-Lib Export Engine**:
  - When rendering annotations for export:
    - For watermarks (and rotated text): calculate exact center-offset rotated coordinates `rotate: degrees(-rotDeg)`.
    - If `underText === true`: create a dedicated content stream, draw the watermark, and prepend it to index 0 of `page.node.Contents()`, placing it beneath the original PDF content.

---

## Verification Plan

### Automated / Build Verification
- Run `npm run build` to ensure clean TypeScript/Astro compilation without syntax errors.

### Browser Testing & Visual Verification
- Start/check `astro dev` server.
- Load a PDF document with text in the browser.
- Open Watermark Modal:
  - Test adjusting angle slider, typing custom angle (e.g., `35°`), changing opacity, choosing "Under original PDF text".
  - Apply to document.
- Verify in editor:
  - Watermark renders tilted at the specified angle.
  - Watermark appears under the document text (text is visible over the watermark).
  - Click the **Rotate button** directly on the watermark.
  - Drag the **top rotation knob** to rotate to arbitrary angles.
  - Test the toolbar rotation slider and input.
- Export / Download PDF:
  - Download the modified PDF and inspect: the watermark is permanently rendered under the original PDF text at the exact chosen rotation angle.
