import { query } from './db';
import { sendMessage, getUpdates, deleteWebhook } from './telegram';
import { escapeHtml } from './util';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Invia un post/risposta della bacheca a tutti i familiari (tranne chi l'ha
// scritto) e memorizza, per ogni messaggio inviato dal bot, a quale thread
// (post radice) appartiene: così le risposte che arrivano da Telegram si
// riagganciano alla conversazione giusta.
export async function broadcastBacheca(opts: {
  rootId: number;
  actorTelegramId: number | null;
  autoreNome: string;
  testo: string;
  isReply: boolean;
}): Promise<void> {
  const utenti = await query<{ telegram_id: string }>(`SELECT telegram_id FROM users`);
  const header = opts.isReply
    ? `↩️ <b>${escapeHtml(opts.autoreNome)}</b> ha risposto in bacheca`
    : `📣 <b>Bacheca</b> — ${escapeHtml(opts.autoreNome)}`;
  const messaggio = `${header}\n\n${escapeHtml(opts.testo)}\n\n<i>Rispondi a questo messaggio per continuare qui e nell'app.</i>`;

  for (const u of utenti) {
    const tgid = Number(u.telegram_id);
    if (opts.actorTelegramId !== null && tgid === opts.actorTelegramId) continue;
    const messageId = await sendMessage(tgid, messaggio);
    if (messageId != null) {
      await query(
        `INSERT INTO bacheca_msg_map (telegram_id, message_id, root_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id, message_id) DO UPDATE SET root_id = $3`,
        [tgid, messageId, opts.rootId]
      );
    }
  }
}

// Gestisce un messaggio ricevuto dal bot in chat privata.
async function processMessage(msg: any): Promise<void> {
  if (!msg || typeof msg.text !== 'string') return;
  const from = msg.from;
  const chatId = msg.chat?.id;
  if (!from || chatId == null) return;
  const text = msg.text.trim();
  if (!text) return;

  // Solo le persone di casa (già registrate aprendo l'app) interagiscono.
  const users = await query<any>(
    `SELECT id, first_name, username FROM users WHERE telegram_id = $1`,
    [from.id]
  );
  if (users.length === 0) {
    await sendMessage(
      chatId,
      "👋 Questo è il bot di famiglia. Apri l'app dal pulsante del menu qui sotto per iniziare."
    );
    return;
  }
  const user = users[0];
  const autoreNome = user.first_name || user.username || 'qualcuno';

  if (text.startsWith('/')) {
    if (/^\/start\b/.test(text)) {
      await sendMessage(
        chatId,
        "👋 Ciao! Scrivi qui per pubblicare un messaggio in <b>bacheca</b> per tutta la famiglia, " +
          "oppure <b>rispondi</b> a un messaggio del bot per continuare la conversazione (comparirà anche nell'app). " +
          "Per la lista della spesa e i promemoria apri l'app dal pulsante del menu."
      );
    }
    return;
  }

  // È una risposta a un messaggio del bot? Aggancia al thread relativo.
  let rootId: number | null = null;
  if (msg.reply_to_message?.message_id != null) {
    const map = await query<{ root_id: number }>(
      `SELECT root_id FROM bacheca_msg_map WHERE telegram_id = $1 AND message_id = $2`,
      [from.id, msg.reply_to_message.message_id]
    );
    if (map.length > 0) rootId = map[0].root_id;
  }

  const inserted = await query<{ id: number }>(
    `INSERT INTO bacheca (user_id, testo, parent_id, via) VALUES ($1, $2, $3, 'telegram') RETURNING id`,
    [user.id, text, rootId]
  );
  const postId = inserted[0].id;
  const threadRoot = rootId ?? postId;

  await broadcastBacheca({
    rootId: threadRoot,
    actorTelegramId: Number(from.id),
    autoreNome,
    testo: text,
    isReply: rootId !== null,
  });
}

async function caricaOffset(): Promise<number> {
  const r = await query<{ value: string }>(`SELECT value FROM bot_state WHERE key = 'update_offset'`);
  return r.length ? Number(r[0].value) || 0 : 0;
}

async function salvaOffset(offset: number): Promise<void> {
  await query(
    `INSERT INTO bot_state (key, value) VALUES ('update_offset', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [String(offset)]
  );
}

let polling = false;

// Avvia il long polling del bot. Senza BOT_TOKEN non parte (es. sviluppo locale):
// l'app funziona comunque, ma la chat bidirezionale è disponibile solo col bot vero.
export function startBotPolling(): void {
  if (!process.env.BOT_TOKEN) {
    console.log('[bot] BOT_TOKEN assente: chat bidirezionale disattivata (polling non avviato)');
    return;
  }
  if (polling) return;
  polling = true;

  (async () => {
    await deleteWebhook();
    let offset = await caricaOffset();
    console.log(`[bot] polling avviato (offset ${offset})`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const updates = await getUpdates(offset, 30);
        for (const up of updates) {
          offset = Math.max(offset, up.update_id + 1);
          try {
            await processMessage(up.message);
          } catch (e) {
            console.error('[bot] errore processando update:', e);
          }
        }
        if (updates.length > 0) await salvaOffset(offset);
      } catch (e) {
        console.error('[bot] errore polling:', e);
        await sleep(3000);
      }
    }
  })();
}
