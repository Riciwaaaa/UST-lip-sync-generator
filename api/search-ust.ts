import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSearchUst } from './lib/search-ust-handler.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleSearchUst(req, res);
}
