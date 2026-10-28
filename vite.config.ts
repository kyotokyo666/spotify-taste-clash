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
  // Серверные переменные в бандл не попадают — только в process.env.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  // В браузер пробрасываем поимённо, а не через envPrefix: иначе в бандл утечёт любой SPOTIFY_*,
  // например случайно добавленный SPOTIFY_CLIENT_SECRET. Client ID при PKCE публичен.
  const exposed = (name: string) => JSON.stringify(process.env[name] ?? env[name] ?? '');
  return {
    plugins: [react(), aiApi()],
    define: {
      'import.meta.env.SPOTIFY_CLIENT_ID': exposed('SPOTIFY_CLIENT_ID'),
      'import.meta.env.SPOTIFY_REDIRECT_URI': exposed('SPOTIFY_REDIRECT_URI'),
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});
