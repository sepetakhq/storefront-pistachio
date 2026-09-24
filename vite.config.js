import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { seoDevPlugin } from '@sepetakhq/storefront-kit/vite';

// The API is proxied rather than called cross-origin. The backend resolves
// the tenant from the Host header, so `changeOrigin` stays false: Vite
// forwards Host as-is, the backend strips the port, and `pistachio.localhost` is the
// seeded domain for this shop.
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8090';
const devPort = Number(process.env.DEV_PORT) || 5181;
// The seeded domain for this shop; never `localhost`, which is Lily Alora's.
const host = 'pistachio.localhost';

export default defineConfig({
  // In CI sf-publish sets VITE_BASE to the CDN prefix of this build, so the
  // built index.html points at absolute asset URLs and the API can serve the
  // document from the template registry. Locally the build is root-relative.
  base: process.env.VITE_BASE || '/',
  // seoDevPlugin is serve-only: it fills the document head from the API so
  // `npm run dev` shows what the binary would serve, and returns the page
  // untouched when the API is not running.
  plugins: [react(), seoDevPlugin({ apiTarget, devPort, host })],
  // One React: the kit declares it as a peer, and a second copy resolved
  // through node_modules is how hooks break.
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.nip.io', '.localhost'],
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/robots.txt': { target: apiTarget, changeOrigin: false },
      '/sitemap.xml': { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
