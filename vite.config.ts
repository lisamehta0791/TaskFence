import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Each of these must stay in its own chunk, not be folded into
            // `vendor` — vendor is loaded on first paint, and these three are
            // all loaded on demand: three.js when a 3D container scrolls into
            // view, pdf.js only when someone actually uploads a PDF.
            if (id.includes('pdfjs-dist')) return 'pdfjs'
            if (id.includes('three') || id.includes('@react-three')) return 'three'
            if (id.includes('motion') || id.includes('framer')) return 'motion'
            return 'vendor'
          }
        },
      },
    },
  },
})
