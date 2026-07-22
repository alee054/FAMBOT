import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { query } from './db';

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface AuthedRequest extends Request {
  userId?: number;
  telegramId?: number;
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

// L'app è pensata per una sola famiglia: al massimo 4 persone.
const MAX_USERS = 4;

export function validateInitData(initData: string, botToken: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  let b: Buffer;
  try {
    b = Buffer.from(hash, 'hex');
  } catch {
    return null;
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') || '');
    if (!user || typeof user.id !== 'number') return null;
    return user as TelegramUser;
  } catch {
    return null;
  }
}

// Registra o aggiorna l'utente. Restituisce null se l'accesso va negato
// perché la "casa" è già piena (4 utenti registrati e questo non è tra loro).
async function upsertUser(tg: TelegramUser): Promise<number | null> {
  const existing = await query<{ id: number }>(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [tg.id]
  );
  if (existing.length === 0) {
    const count = await query<{ n: string }>(`SELECT COUNT(*) AS n FROM users`);
    if (Number(count[0].n) >= MAX_USERS) return null;
  }
  const rows = await query<{ id: number }>(
    `INSERT INTO users (telegram_id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id)
     DO UPDATE SET first_name = $2, username = $3
     RETURNING id`,
    [tg.id, tg.first_name ?? null, tg.username ?? null]
  );
  return rows[0].id;
}

// Piccola cache per non fare l'upsert a ogni singola richiesta.
const userCache = new Map<number, { userId: number; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Se impostato, SOLO questi Telegram id possono usare l'app. È il modo
// consigliato per chiudere l'app alle 4 persone di casa. Se non è impostato
// vale comunque il tetto di MAX_USERS: i primi 4 che entrano restano gli unici.
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number)
  .filter((n) => Number.isFinite(n));

export function authMiddleware() {
  const botToken = process.env.BOT_TOKEN || '';
  const devBypass = process.env.DEV_BYPASS_AUTH === '1' && process.env.NODE_ENV !== 'production';

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      let tgUser: TelegramUser | null = null;

      const header = req.header('Authorization') || '';
      const initData = header.startsWith('tma ') ? header.slice(4) : '';

      if (initData && botToken) {
        tgUser = validateInitData(initData, botToken);
      }
      if (!tgUser && devBypass) {
        tgUser = { id: 1, first_name: 'Dev', username: 'dev' };
      }
      if (!tgUser) {
        return res.status(401).json({ error: 'initData non valida' });
      }
      if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(tgUser.id)) {
        return res.status(403).json({ error: 'Accesso non autorizzato' });
      }

      const cached = userCache.get(tgUser.id);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        req.userId = cached.userId;
      } else {
        const userId = await upsertUser(tgUser);
        if (userId === null) {
          return res.status(403).json({ error: 'Numero massimo di utenti raggiunto' });
        }
        req.userId = userId;
        userCache.set(tgUser.id, { userId, at: Date.now() });
      }
      req.telegramId = tgUser.id;
      next();
    } catch (err) {
      next(err);
    }
  };
}
