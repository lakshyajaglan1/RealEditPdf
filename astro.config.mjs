// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://realeditpdf.com',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['pdfjs-dist', 'pdf-lib', 'canvas-confetti'],
    },
  },
});
