import { Router } from 'express';
import { query } from '../db';
import type { AuthedRequest } from '../auth';
import { sendMessage } from '../telegram';
import { escapeHtml } from '../util';

const router = Router();

// Feed della bacheca: ultimi messaggi con nome dell'autore.
router.get('/', async (_req: AuthedRequest, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT b.*, u.first_name AS autore_first, u.username AS autore_user
       FROM bacheca b JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC LIMIT 100`
    );
    res.json(rows.map((b) => ({
      id: b.id,
      testo: b.testo,
      created_at: b.created_at,
      autore: b.autore_first || b.autore_user || `Utente ${b.user_id}`,
      mio: b.user_id === _req.userId,
    })));
  } catch (e) { next(e); }
});

// Nuovo messaggio: salva in bacheca e lo inoltra come broadcast a tutti e 4
// (così arriva la notifica push nativa di Telegram a ciascuno).
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const testo = typeof b.testo === 'string' ? b.testo.trim() : '';
    if (!testo) return res.status(400).json({ error: 'Messaggio vuoto' });

    const rows = await query<{ id: number }>(
      `INSERT INTO bacheca (user_id, testo) VALUES ($1, $2) RETURNING id`,
      [req.userId, testo]
    );

    const autore = await query<any>(`SELECT first_name, username FROM users WHERE id = $1`, [req.userId]);
    const autoreNome = autore[0] ? (autore[0].first_name || autore[0].username || 'qualcuno') : 'qualcuno';

    const utenti = await query<{ telegram_id: string }>(`SELECT telegram_id FROM users`);
    const messaggio = `📣 <b>Bacheca</b> — ${escapeHtml(autoreNome)}\n\n${escapeHtml(testo)}`;
    for (const u of utenti) {
      await sendMessage(Number(u.telegram_id), messaggio);
    }

    const created = await query<any>(
      `SELECT b.*, u.first_name AS autore_first, u.username AS autore_user
       FROM bacheca b JOIN users u ON u.id = b.user_id WHERE b.id = $1`,
      [rows[0].id]
    );
    const c = created[0];
    res.status(201).json({
      id: c.id,
      testo: c.testo,
      created_at: c.created_at,
      autore: c.autore_first || c.autore_user,
      mio: true,
    });
  } catch (e) { next(e); }
});

export default router;
