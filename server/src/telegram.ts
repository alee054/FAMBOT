const API_BASE = 'https://api.telegram.org';

// Invia un messaggio e restituisce il message_id del messaggio inviato
// (serve per collegare le risposte al thread della bacheca), o null se non
// inviato (token assente o errore).
export async function sendMessage(chatId: number, text: string): Promise<number | null> {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.log(`[telegram] BOT_TOKEN assente, messaggio non inviato a ${chatId}: ${text}`);
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error(`[telegram] sendMessage fallito (${res.status}): ${await res.text()}`);
      return null;
    }
    const data: any = await res.json();
    return data?.result?.message_id ?? null;
  } catch (err) {
    console.error('[telegram] errore di rete su sendMessage:', err);
    return null;
  }
}

// Rimuove un eventuale webhook: il bot usa il long polling (getUpdates), e i due
// metodi sono mutuamente esclusivi.
export async function deleteWebhook(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${API_BASE}/bot${token}/deleteWebhook`);
  } catch {
    /* non bloccante */
  }
}

// Long polling: attende (fino a `timeout` secondi) nuovi messaggi dal bot.
export async function getUpdates(offset: number, timeout: number): Promise<any[]> {
  const token = process.env.BOT_TOKEN;
  if (!token) return [];
  const allowed = encodeURIComponent('["message"]');
  const url = `${API_BASE}/bot${token}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=${allowed}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getUpdates ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return Array.isArray(data.result) ? data.result : [];
}
