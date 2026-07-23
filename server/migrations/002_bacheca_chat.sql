-- La bacheca diventa una chat bidirezionale che passa dal bot.
-- Ogni post può avere risposte (thread) e le risposte possono arrivare anche
-- da Telegram (rispondendo a un messaggio del bot in chat privata).

-- parent_id: se valorizzato, questo record è una risposta al post indicato.
-- via: 'app' se scritto dalla Mini App, 'telegram' se arrivato dalla chat col bot.
ALTER TABLE bacheca ADD COLUMN parent_id INTEGER;
ALTER TABLE bacheca ADD COLUMN via TEXT NOT NULL DEFAULT 'app';

-- Per ogni messaggio che il bot invia in una chat, teniamo a quale thread
-- (post radice) appartiene. Così quando un familiare risponde a quel messaggio
-- da Telegram sappiamo a quale conversazione della bacheca agganciare la risposta.
CREATE TABLE bacheca_msg_map (
  telegram_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  root_id INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, message_id)
);

-- Stato del bot: offset di getUpdates, per non riprocessare i messaggi al riavvio.
CREATE TABLE bot_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
