import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/ai';

/** В dev-режиме AI-эндпоинты обслуживает сам Vite — отдельный сервер не нужен. */
function aiApi(): Plugin {
  return {
    name: 'taste-clash-ai-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApi(req, res).then((handled) => handled || next(), next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApi(req, res).then((handled) => handled || next(), next);
      });
    },
  };
}

// Spotify больше не принимает `localhost` в Redirect URI — только loopback-IP.
export default defineConfig(({ mode }) => {
  // Серверные переменные (без префикса VITE_) в бандл не попадают — только в process.env.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  return {
    plugins: [react(), aiApi()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});
