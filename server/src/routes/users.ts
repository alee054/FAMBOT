import { Router } from 'express';
import { query } from '../db';
import type { AuthedRequest } from '../auth';

const router = Router();

// Elenco delle persone di casa (per scegliere destinatari di liste e promemoria).
// Include un flag "io" per identificare l'utente corrente lato client.
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await query<{ id: number; first_name: string | null; username: string | null }>(
      `SELECT id, first_name, username FROM users ORDER BY id`
    );
    res.json(
      rows.map((u) => ({
        id: u.id,
        nome: u.first_name || u.username || `Utente ${u.id}`,
        io: u.id === req.userId,
      }))
    );
  } catch (e) { next(e); }
});

export default router;
