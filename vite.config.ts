import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Run the `api/` serverless function during `npm run dev`.
 *
 * On Vercel this route is handled by the platform. Locally there is nothing to
 * handle it, so without this the AI assist would only ever work in production —
 * which is exactly the kind of thing you discover while recording a demo.
 *
 * The key is read from `.env` here, in the Node process. It is deliberately not
 * a `VITE_`-prefixed variable, so it can never be inlined into client code.
 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'taskfence-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/understand', async (req, res) => {
        if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)

        try {
          const mod = await server.ssrLoadModule('/api/understand.ts')
          const request = new Request('http://localhost/api/understand', {
            method: req.method ?? 'POST',
            headers: { 'content-type': 'application/json' },
            body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
          })
          const response: Response = await mod.default(request)
          res.statusCode = response.status
          res.setHeader('content-type', 'application/json')
          res.end(await response.text())
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'dev-api', message: String(err) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
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
}))
