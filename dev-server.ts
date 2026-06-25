/**
 * 本地开发 API 服务器
 * 用于在 Vite dev 模式下提供 /api/search-ust 接口
 *
 * 使用方式:
 *   npm run dev:api
 *   npm run dev
 */
import 'dotenv/config';
import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSearchUst } from './api/lib/search-ust-handler';

const app = express();
const PORT = Number(process.env.DEV_API_PORT || 3001);

app.get('/api/search-ust', async (req, res) => {
  await handleSearchUst(req as unknown as VercelRequest, res as unknown as VercelResponse);
});

const server = app.listen(PORT, () => {
  console.log(`\n🔍 Dev API server running at http://localhost:${PORT}`);
  console.log(`   搜索: GET /api/search-ust?action=search&q=曲名&page=1`);
  console.log(`   下载: GET /api/search-ust?action=fetch&url=https://bowlroll.net/file/...\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Stop the other dev:api process, or set DEV_API_PORT to a free port in .env\n`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});
