# RealEditPDF

> **Free, 100% Client-Side PDF Editor & Document Suite**  
> Fast, private, and unlimited — edit, sign, redact, merge, split, compress, and convert PDFs directly in your browser with zero server uploads.

---

## 🔒 Privacy-First Architecture

Unlike traditional online PDF tools that upload sensitive files to remote servers, **RealEditPDF runs 100% client-side**.

- **Zero Server Uploads**: Your files never leave your device. All parsing, rendering, manipulation, and downloading happen locally in your browser memory.
- **No Limits or Paywalls**: No artificial page limits, file size restrictions, watermarks, or account registration required.
- **Enterprise-Grade Privacy**: Safe for confidential business documents, legal contracts, medical records, and tax filings.

---

## ✨ Features

- **📝 In-Browser PDF Editor**: Add text, shapes, callouts, and notes to any PDF document with intuitive placement and formatting controls.
- **✍️ E-Signatures**: Draw hand-drawn signatures with stroke smoothing, choose from signature font styles, or upload signature stamps.
- **🛡️ Redaction & Masking**: Permanently black out or redact sensitive data, personal identifiers, and financial info before sharing.
- **🗜️ PDF Compression**: Reduce document file sizes directly in-browser while preserving visual quality and readability.
- **📑 Merge PDFs**: Combine multiple PDF files into a single document with interactive page reordering.
- **✂️ Split & Extract**: Split large documents or extract specific page ranges into new standalone PDFs.
- **🖼️ PDF to Images**: Export PDF pages into high-resolution PNG or JPEG images.
- **🌐 Multilingual Support (i18n)**: Fully localized in 8 languages with localized URLs and SEO hreflang tags:
  - English (`en`), Español (`es`), 日本語 (`ja`), Français (`fr`), Deutsch (`de`), Português (`pt`), 한국어 (`ko`), Italiano (`it`).
- **🌓 Dark & Light Modes**: Responsive, modern user interface optimized for desktop, tablet, and mobile browsers.

---

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/) — Fast, modern web framework with static rendering and optimized client hydration.
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) — Modern CSS utility framework with CSS-first configuration and dark mode support.
- **PDF Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) — Mozilla's HTML5 canvas-based PDF reader.
- **PDF Manipulation**: [pdf-lib](https://pdf-lib.js.org/) — Pure JavaScript PDF creation and manipulation library.
- **WebAssembly & Canvas**: Client-side WASM and HTML5 Canvas pipelines for fast image processing, rasterization, and signature smoothing.
- **Typography & Icons**: `@fontsource/geist-sans`, `@fontsource/geist-mono`, and curated signature web fonts.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v22.12.0` or higher
- **npm** (or `pnpm` / `yarn` / `bun`)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/RealEditPdf.git
cd RealEditPdf
npm install
```

### Development Server

Start the local Astro development server:

```bash
npm run dev
```

Or start in background mode (recommended when managing long-running processes):

```bash
astro dev --background
```

Open your browser at [http://localhost:4321](http://localhost:4321) to view the application.

### Building for Production

Create an optimized static build:

```bash
npm run build
```

The output will be placed in the `./dist/` directory, ready to deploy to any static host (Cloudflare Pages, Vercel, Netlify, GitHub Pages, etc.).

### Previewing the Production Build

Test your production bundle locally:

```bash
npm run preview
```

---

## 📂 Project Structure

```text
├── public/                # Static assets (favicons, sitemap.xml, robots.txt)
├── src/
│   ├── components/        # UI components (Navbar, Tools, Footer, i18n, etc.)
│   ├── i18n/              # Language dictionaries, route mappings, and translation utils
│   ├── layouts/           # Page layouts (Layout.astro with SEO, canonicals, hreflang)
│   ├── pages/             # Astro routes:
│   │   ├── index.astro    # English root editor
│   │   ├── [lang]/        # Localized routes for es, ja, fr, de, pt, ko, it
│   │   └── ...            # Feature routes (compress, merge, split, sign, etc.)
│   └── styles/            # Global stylesheets & Tailwind configuration
├── astro.config.mjs       # Astro configuration
└── package.json           # Scripts and dependencies
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
