import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { publicDemoSnapshot } from './pages/snapshot';

const web = fileURLToPath(new URL('.', import.meta.url));
const base = process.env.PAGES_BASE_PATH || '/idx-lens/';
if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..')) {
  throw new Error('PAGES_BASE_PATH must be an absolute URL path ending with /');
}
const snapshot = JSON.stringify(publicDemoSnapshot());

export default defineConfig({
  root: resolve(web, 'pages'), base,
  envDir: resolve(web, 'pages'), envPrefix: 'IDX_LENS_PUBLIC_',
  publicDir: resolve(web, 'public'),
  resolve: { alias: [
    { find: 'next/dynamic', replacement: resolve(web, 'pages/dynamic.tsx') },
    { find: '@', replacement: web },
  ] },
  plugins: [react(), {
    name: 'idx-lens-public-snapshot',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== `${base}data/market.json` && path !== '/data/market.json') return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(snapshot);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/market.json', source: snapshot });
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
    },
  }],
  build: { outDir: resolve(web, 'dist-pages'), emptyOutDir: true },
});
