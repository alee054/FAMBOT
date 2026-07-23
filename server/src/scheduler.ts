import cron from 'node-cron';
import { query } from './db';
import { sendMessage } from './telegram';
import { hhmmInTz, todayInTz, escapeHtml } from './util';

const TZ = 'Europe/Rome';

async function inviaPromemoria(): Promise<void> {
  const rows = await query<any>(
    `SELECT p.*, u.telegram_id
     FROM promemoria p
     JOIN users u ON u.id = p.destinatario_id
     WHERE p.attivo = true`
  );
  const oraCorrente = hhmmInTz(TZ);
  const oggi = todayInTz(TZ);

  for (const p of rows) {
    if (p.orario !== oraCorrente) continue;

    if (p.ricorrenza === 'una_tantum') {
      // Solo nella data prevista.
      const dataPrevista = p.data instanceof Date
        ? p.data.toISOString().slice(0, 10)
        : String(p.data).slice(0, 10);
      if (dataPrevista !== oggi) continue;
    } else {
      // Giornaliero: evita doppi invii nello stesso giorno.
      if (p.ultimo_invio) {
        const ultimoGiorno = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(p.ultimo_invio));
        if (ultimoGiorno === oggi) continue;
      }
    }

    await sendMessage(Number(p.telegram_id), `⏰ <b>Promemoria</b>\n${escapeHtml(p.testo)}`);

    if (p.ricorrenza === 'una_tantum') {
      await query(`UPDATE promemoria SET attivo = false, ultimo_invio = now() WHERE id = $1`, [p.id]);
    } else {
      await query(`UPDATE promemoria SET ultimo_invio = now() WHERE id = $1`, [p.id]);
    }
  }
}

// Sposta in "storico" le liste inviate da più di 24 ore.
async function archiviaListeScadute(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await query(
    `UPDATE liste SET stato = 'storico', updated_at = now()
     WHERE stato = 'attiva' AND inviata_at IS NOT NULL AND inviata_at < $1`,
    [cutoff]
  );
}

// La bacheca è una chat "usa e getta": i messaggi più vecchi di 24 ore
// spariscono da soli, insieme alle mappature dei messaggi del bot ormai orfane.
async function pulisciBacheca(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await query(`DELETE FROM bacheca WHERE created_at < $1`, [cutoff]);
  await query(`DELETE FROM bacheca_msg_map WHERE created_at < $1`, [cutoff]);
}

export function startScheduler(): void {
  cron.schedule('* * * * *', async () => {
    try {
      await inviaPromemoria();
      await archiviaListeScadute();
      await pulisciBacheca();
    } catch (err) {
      console.error('[scheduler] errore:', err);
    }
  });
  console.log('[scheduler] attivo (controllo ogni minuto)');
}
