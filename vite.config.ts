import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const apiPort = env.DEV_API_PORT || '3001';
  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      // @ffmpeg/ffmpeg 内部通过 new Worker(new URL(...)) 加载 worker，
      // 被 Vite 预打包后 worker.js 会 404，导致开发环境 FFmpeg 永远加载失败
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // 代理 /api/ 请求到本地 Express 服务或 Vercel 部署地址。
      // 在线搜索 UST 功能需另开 `npm run dev:api`；主功能不依赖此代理。
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
