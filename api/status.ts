// Функция Vercel: вся логика и маршрутизация — в server/ai.ts, общем с dev и prod-сервером.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from '../server/ai.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!(await handleApi(req, res))) res.writeHead(404).end();
}
