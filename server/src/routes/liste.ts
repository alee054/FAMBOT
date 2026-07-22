import { Router } from 'express';
import { query } from '../db';
import type { AuthedRequest } from '../auth';
import { sendMessage } from '../telegram';
import { escapeHtml } from '../util';

const router = Router();

function normalizza(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Registra il prodotto nello storico condiviso (per i suggerimenti futuri).
async function registraProdotto(nome: string): Promise<void> {
  const norm = normalizza(nome);
  if (!norm) return;
  await query(
    `INSERT INTO prodotti_storico (nome_norm, nome)
     VALUES ($1, $2)
     ON CONFLICT (nome_norm)
     DO UPDATE SET usi = prodotti_storico.usi + 1, ultimo_uso = now(), nome = $2`,
    [norm, nome.trim()]
  );
}

async function caricaLista(id: number): Promise<any | null> {
  const rows = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const lista = rows[0];
  const voci = await query<any>(
    `SELECT * FROM voci WHERE lista_id = $1 ORDER BY created_at, id`,
    [id]
  );
  let destinatario = null;
  if (lista.destinatario_id) {
    const d = await query<any>(`SELECT id, first_name, username FROM users WHERE id = $1`, [lista.destinatario_id]);
    if (d[0]) destinatario = { id: d[0].id, nome: d[0].first_name || d[0].username || `Utente ${d[0].id}` };
  }
  const autore = await query<any>(`SELECT first_name, username FROM users WHERE id = $1`, [lista.user_id]);
  return {
    ...lista,
    autore: autore[0] ? (autore[0].first_name || autore[0].username) : null,
    destinatario,
    voci,
  };
}

// ---- Elenco liste (attive/bozze + storico) ----
router.get('/', async (_req: AuthedRequest, res, next) => {
  try {
    const liste = await query<any>(
      `SELECT l.id, l.titolo, l.stato, l.destinatario_id, l.inviata_at, l.updated_at,
              u.first_name AS autore_first, u.username AS autore_user,
              d.first_name AS dest_first, d.username AS dest_user,
              COUNT(v.id) AS n_voci
       FROM liste l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN users d ON d.id = l.destinatario_id
       LEFT JOIN voci v ON v.lista_id = l.id
       GROUP BY l.id, l.titolo, l.stato, l.destinatario_id, l.inviata_at, l.updated_at,
                u.first_name, u.username, d.first_name, d.username
       ORDER BY l.updated_at DESC`
    );
    res.json(
      liste.map((l) => ({
        id: l.id,
        titolo: l.titolo,
        stato: l.stato,
        n_voci: Number(l.n_voci),
        inviata_at: l.inviata_at,
        updated_at: l.updated_at,
        autore: l.autore_first || l.autore_user || null,
        destinatario: l.dest_first || l.dest_user || null,
      }))
    );
  } catch (e) { next(e); }
});

// ---- Suggerimenti prodotti (autocomplete dallo storico condiviso) ----
router.get('/suggerimenti', async (req: AuthedRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? normalizza(req.query.q) : '';
    const rows = q
      ? await query<{ nome: string }>(
          `SELECT nome FROM prodotti_storico WHERE nome_norm LIKE $1
           ORDER BY usi DESC, ultimo_uso DESC LIMIT 12`,
          [`%${q}%`]
        )
      : await query<{ nome: string }>(
          `SELECT nome FROM prodotti_storico ORDER BY usi DESC, ultimo_uso DESC LIMIT 12`
        );
    res.json(rows.map((r) => r.nome));
  } catch (e) { next(e); }
});

// ---- Dettaglio lista ----
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const lista = await caricaLista(Number(req.params.id));
    if (!lista) return res.status(404).json({ error: 'Lista non trovata' });
    res.json(lista);
  } catch (e) { next(e); }
});

// ---- Crea nuova lista (bozza) ----
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const titolo = typeof b.titolo === 'string' && b.titolo.trim() ? b.titolo.trim() : 'Lista della spesa';
    const rows = await query<any>(
      `INSERT INTO liste (user_id, titolo) VALUES ($1, $2) RETURNING id`,
      [req.userId, titolo]
    );
    const lista = await caricaLista(rows[0].id);
    res.status(201).json(lista);
  } catch (e) { next(e); }
});

// ---- Rinomina lista ----
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    if (rows[0].stato === 'storico') return res.status(409).json({ error: 'Lista archiviata (sola lettura)' });
    const b = req.body ?? {};
    const titolo = typeof b.titolo === 'string' && b.titolo.trim() ? b.titolo.trim() : rows[0].titolo;
    await query(`UPDATE liste SET titolo = $1, updated_at = now() WHERE id = $2`, [titolo, id]);
    res.json(await caricaLista(id));
  } catch (e) { next(e); }
});

// ---- Elimina lista ----
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await query<{ id: number }>(`DELETE FROM liste WHERE id = $1 RETURNING id`, [Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Aggiungi voce ----
router.post('/:id/voci', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    if (rows[0].stato === 'storico') return res.status(409).json({ error: 'Lista archiviata (sola lettura)' });
    const b = req.body ?? {};
    const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
    if (!nome) return res.status(400).json({ error: 'Nome prodotto obbligatorio' });
    const quantita = typeof b.quantita === 'string' && b.quantita.trim() ? b.quantita.trim() : null;
    await query(
      `INSERT INTO voci (lista_id, nome, quantita) VALUES ($1, $2, $3)`,
      [id, nome, quantita]
    );
    await query(`UPDATE liste SET updated_at = now() WHERE id = $1`, [id]);
    await registraProdotto(nome);
    res.status(201).json(await caricaLista(id));
  } catch (e) { next(e); }
});

// ---- Modifica voce (spunta / rinomina / quantità) ----
router.patch('/:id/voci/:vid', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const vid = Number(req.params.vid);
    const liste = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
    if (liste.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    if (liste[0].stato === 'storico') return res.status(409).json({ error: 'Lista archiviata (sola lettura)' });
    const voci = await query<any>(`SELECT * FROM voci WHERE id = $1 AND lista_id = $2`, [vid, id]);
    if (voci.length === 0) return res.status(404).json({ error: 'Voce non trovata' });
    const v = voci[0];
    const b = req.body ?? {};
    const nome = b.nome !== undefined ? String(b.nome).trim() : v.nome;
    if (!nome) return res.status(400).json({ error: 'Nome prodotto obbligatorio' });
    const quantita = b.quantita !== undefined
      ? (String(b.quantita).trim() || null)
      : v.quantita;
    const spuntato = b.spuntato !== undefined ? Boolean(b.spuntato) : v.spuntato;
    await query(
      `UPDATE voci SET nome = $1, quantita = $2, spuntato = $3 WHERE id = $4`,
      [nome, quantita, spuntato, vid]
    );
    await query(`UPDATE liste SET updated_at = now() WHERE id = $1`, [id]);
    res.json(await caricaLista(id));
  } catch (e) { next(e); }
});

// ---- Elimina voce ----
router.delete('/:id/voci/:vid', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const vid = Number(req.params.vid);
    const liste = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
    if (liste.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    if (liste[0].stato === 'storico') return res.status(409).json({ error: 'Lista archiviata (sola lettura)' });
    await query(`DELETE FROM voci WHERE id = $1 AND lista_id = $2`, [vid, id]);
    await query(`UPDATE liste SET updated_at = now() WHERE id = $1`, [id]);
    res.json(await caricaLista(id));
  } catch (e) { next(e); }
});

// ---- Invia la lista a un destinatario ----
// Imposta stato 'attiva' e (ri)manda il messaggio Telegram al destinatario scelto.
router.post('/:id/invia', async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const liste = await query<any>(`SELECT * FROM liste WHERE id = $1`, [id]);
    if (liste.length === 0) return res.status(404).json({ error: 'Lista non trovata' });
    if (liste[0].stato === 'storico') return res.status(409).json({ error: 'Lista archiviata (sola lettura)' });

    const destinatarioId = Number((req.body ?? {}).destinatario_id);
    if (!Number.isInteger(destinatarioId)) return res.status(400).json({ error: 'Destinatario non valido' });
    const dest = await query<any>(`SELECT id, telegram_id, first_name, username FROM users WHERE id = $1`, [destinatarioId]);
    if (dest.length === 0) return res.status(400).json({ error: 'Destinatario inesistente' });

    const voci = await query<any>(`SELECT * FROM voci WHERE lista_id = $1 ORDER BY created_at, id`, [id]);
    if (voci.length === 0) return res.status(400).json({ error: 'La lista è vuota' });

    const autore = await query<any>(`SELECT first_name, username FROM users WHERE id = $1`, [liste[0].user_id]);
    const autoreNome = autore[0] ? (autore[0].first_name || autore[0].username || 'qualcuno') : 'qualcuno';

    // È già attiva? è un re-invio, altrimenti primo invio.
    const primoInvio = liste[0].stato !== 'attiva';
    await query(
      `UPDATE liste SET stato = 'attiva', destinatario_id = $1, inviata_at = now(), updated_at = now() WHERE id = $2`,
      [destinatarioId, id]
    );

    const testo = formattaMessaggioLista(liste[0].titolo, voci, autoreNome, primoInvio);
    await sendMessage(Number(dest[0].telegram_id), testo);

    res.json(await caricaLista(id));
  } catch (e) { next(e); }
});

function formattaMessaggioLista(titolo: string, voci: any[], autore: string, primoInvio: boolean): string {
  const righe = voci.map((v) => {
    const q = v.quantita ? ` <i>(${escapeHtml(v.quantita)})</i>` : '';
    return `☐ ${escapeHtml(v.nome)}${q}`;
  });
  const intestazione = primoInvio
    ? `🛒 <b>${escapeHtml(titolo)}</b>\nda ${escapeHtml(autore)}`
    : `🛒 <b>${escapeHtml(titolo)}</b> (aggiornata)\nda ${escapeHtml(autore)}`;
  return `${intestazione}\n\n${righe.join('\n')}`;
}

export default router;
