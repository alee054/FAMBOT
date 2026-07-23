import { Router } from 'express';
import { query } from '../db';
import type { AuthedRequest } from '../auth';
import { broadcastBacheca } from '../botChat';

const router = Router();

interface Nodo {
  id: number;
  testo: string;
  created_at: string;
  autore: string;
  mio: boolean;
  via: string;
  risposte: Nodo[];
}

function tempo(v: any): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Feed della bacheca come thread: ogni post radice con le sue risposte in ordine
// cronologico. I thread sono ordinati per ultima attività (il più recente sopra).
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await query<any>(
      `SELECT b.id, b.testo, b.created_at, b.user_id, b.parent_id, b.via,
              u.first_name AS autore_first, u.username AS autore_user
       FROM bacheca b JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at ASC`
    );

    const byId = new Map<number, Nodo>();
    const shape = (b: any): Nodo => ({
      id: b.id,
      testo: b.testo,
      created_at: b.created_at,
      autore: b.autore_first || b.autore_user || `Utente ${b.user_id}`,
      mio: b.user_id === req.userId,
      via: b.via || 'app',
      risposte: [],
    });

    for (const b of rows) byId.set(b.id, shape(b));

    const roots: Nodo[] = [];
    for (const b of rows) {
      const nodo = byId.get(b.id)!;
      if (b.parent_id && byId.has(b.parent_id)) {
        byId.get(b.parent_id)!.risposte.push(nodo);
      } else {
        roots.push(nodo);
      }
    }

    const ultimaAttivita = (n: Nodo): number =>
      Math.max(tempo(n.created_at), ...n.risposte.map((r) => tempo(r.created_at)));
    roots.sort((a, b) => ultimaAttivita(b) - ultimaAttivita(a));

    res.json(roots);
  } catch (e) {
    next(e);
  }
});

// Nuovo messaggio o risposta. Se `parent_id` è presente è una risposta a un
// thread; altrimenti è un nuovo post. In entrambi i casi il bot lo inoltra agli
// altri familiari (con notifica push), collegando le eventuali risposte da Telegram.
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const testo = typeof b.testo === 'string' ? b.testo.trim() : '';
    if (!testo) return res.status(400).json({ error: 'Messaggio vuoto' });

    // La risposta si aggancia sempre al post radice del thread.
    let parentId: number | null = null;
    if (b.parent_id != null) {
      const pid = Number(b.parent_id);
      const parent = await query<any>(`SELECT id, parent_id FROM bacheca WHERE id = $1`, [pid]);
      if (parent.length === 0) return res.status(400).json({ error: 'Messaggio a cui rispondere non trovato' });
      parentId = parent[0].parent_id ?? parent[0].id;
    }

    const inserted = await query<any>(
      `INSERT INTO bacheca (user_id, testo, parent_id, via) VALUES ($1, $2, $3, 'app')
       RETURNING id, created_at`,
      [req.userId, testo, parentId]
    );
    const postId = inserted[0].id;
    const threadRoot = parentId ?? postId;

    const autore = await query<any>(`SELECT first_name, username FROM users WHERE id = $1`, [req.userId]);
    const autoreNome = autore[0] ? (autore[0].first_name || autore[0].username || 'qualcuno') : 'qualcuno';

    await broadcastBacheca({
      rootId: threadRoot,
      actorTelegramId: req.telegramId ?? null,
      autoreNome,
      testo,
      isReply: parentId !== null,
    });

    res.status(201).json({
      id: postId,
      testo,
      created_at: inserted[0].created_at,
      autore: autoreNome,
      mio: true,
      via: 'app',
      parent_id: parentId,
      risposte: [],
    });
  } catch (e) {
    next(e);
  }
});

export default router;
