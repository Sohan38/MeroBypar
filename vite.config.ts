import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT || 5173);

  return {
    base: mode === 'electron' ? './' : '/',
    plugins: [
      react(),
      tailwindcss(),
      ...(mode !== 'electron' ? [
        VitePWA({
          injectRegister: null,
          registerType: 'autoUpdate',
          manifest: {
            name: 'Sohan Manager',
            short_name: 'Sohan',
            description: 'Business Management App',
            theme_color: '#0d6e8a',
            background_color: '#ffffff',
            display: 'standalone',
            orientation: 'portrait',
            start_url: '/',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*$/i,
                handler: 'CacheFirst',
              },
            ],
          },
        })
      ] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@assets': fileURLToPath(new URL('./attached_assets', import.meta.url)),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: fileURLToPath(new URL('.', import.meta.url)),
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
