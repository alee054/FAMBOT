import { Router } from 'express';
import { query } from '../db';
import type { AuthedRequest } from '../auth';
import { isValidTime, isValidDate } from '../util';

const router = Router();

async function caricaPromemoria(id: number): Promise<any | null> {
  const rows = await query<any>(
    `SELECT p.*, d.first_name AS dest_first, d.username AS dest_user
     FROM promemoria p JOIN users d ON d.id = p.destinatario_id
     WHERE p.id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const p = rows[0];
  return { ...p, destinatario: p.dest_first || p.dest_user || `Utente ${p.destinatario_id}` };
}

// Elenco: i promemoria creati da me (con nome del destinatario).
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT p.*, d.first_name AS dest_first, d.username AS dest_user
       FROM promemoria p JOIN users d ON d.id = p.destinatario_id
       WHERE p.user_id = $1
       ORDER BY p.attivo DESC, p.orario`,
      [req.userId]
    );
    res.json(rows.map((p) => ({ ...p, destinatario: p.dest_first || p.dest_user || `Utente ${p.destinatario_id}` })));
  } catch (e) { next(e); }
});

router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const testo = typeof b.testo === 'string' ? b.testo.trim() : '';
    if (!testo) return res.status(400).json({ error: 'Testo obbligatorio' });
    if (!isValidTime(b.orario)) return res.status(400).json({ error: 'Orario non valido (HH:MM)' });

    const destinatarioId = Number(b.destinatario_id);
    if (!Number.isInteger(destinatarioId)) return res.status(400).json({ error: 'Destinatario non valido' });
    const dest = await query<{ id: number }>(`SELECT id FROM users WHERE id = $1`, [destinatarioId]);
    if (dest.length === 0) return res.status(400).json({ error: 'Destinatario inesistente' });

    const ricorrenza = b.ricorrenza === 'una_tantum' ? 'una_tantum' : 'giornaliero';
    let data: string | null = null;
    if (ricorrenza === 'una_tantum') {
      if (!isValidDate(b.data)) return res.status(400).json({ error: 'Data non valida (YYYY-MM-DD)' });
      data = b.data;
    }

    const rows = await query<{ id: number }>(
      `INSERT INTO promemoria (user_id, destinatario_id, testo, data, orario, ricorrenza)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.userId, destinatarioId, testo, data, b.orario, ricorrenza]
    );
    res.status(201).json(await caricaPromemoria(rows[0].id));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query<any>(`SELECT * FROM promemoria WHERE id = $1 AND user_id = $2`, [id, req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Promemoria non trovato' });
    const p = rows[0];
    const b = req.body ?? {};

    const testo = b.testo !== undefined ? String(b.testo).trim() : p.testo;
    if (!testo) return res.status(400).json({ error: 'Testo obbligatorio' });
    const orario = b.orario !== undefined ? b.orario : p.orario;
    if (!isValidTime(orario)) return res.status(400).json({ error: 'Orario non valido (HH:MM)' });
    const attivo = b.attivo !== undefined ? Boolean(b.attivo) : p.attivo;
    const ricorrenza = b.ricorrenza !== undefined
      ? (b.ricorrenza === 'una_tantum' ? 'una_tantum' : 'giornaliero')
      : p.ricorrenza;

    let data = p.data;
    if (b.data !== undefined) {
      if (ricorrenza === 'una_tantum' && !isValidDate(b.data)) {
        return res.status(400).json({ error: 'Data non valida (YYYY-MM-DD)' });
      }
      data = ricorrenza === 'una_tantum' ? b.data : null;
    } else if (ricorrenza === 'giornaliero') {
      data = null;
    }

    let destinatarioId = p.destinatario_id;
    if (b.destinatario_id !== undefined) {
      destinatarioId = Number(b.destinatario_id);
      const dest = await query<{ id: number }>(`SELECT id FROM users WHERE id = $1`, [destinatarioId]);
      if (dest.length === 0) return res.status(400).json({ error: 'Destinatario inesistente' });
    }

    await query(
      `UPDATE promemoria SET testo = $1, orario = $2, attivo = $3, ricorrenza = $4, data = $5, destinatario_id = $6
       WHERE id = $7`,
      [testo, orario, attivo, ricorrenza, data, destinatarioId, id]
    );
    res.json(await caricaPromemoria(id));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await query<{ id: number }>(
      `DELETE FROM promemoria WHERE id = $1 AND user_id = $2 RETURNING id`,
      [Number(req.params.id), req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Promemoria non trovato' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
