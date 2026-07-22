const API_BASE = 'https://api.telegram.org';

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.log(`[telegram] BOT_TOKEN assente, messaggio non inviato a ${chatId}: ${text}`);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error(`[telegram] sendMessage fallito (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error('[telegram] errore di rete su sendMessage:', err);
  }
}
