-- Utenti: le (fino a) 4 persone di casa, riconosciute dal loro account Telegram.
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  first_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liste della spesa condivise.
-- stato:
--   'bozza'   -> in composizione, non ancora inviata a nessuno
--   'attiva'  -> inviata a un destinatario, modificabile per 24h
--   'storico' -> archiviata (sola lettura) dopo 24h dall'invio
CREATE TABLE liste (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  titolo TEXT NOT NULL DEFAULT 'Lista della spesa',
  stato TEXT NOT NULL DEFAULT 'bozza',
  destinatario_id INTEGER REFERENCES users(id),
  inviata_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Voci/prodotti di una lista.
CREATE TABLE voci (
  id SERIAL PRIMARY KEY,
  lista_id INTEGER NOT NULL REFERENCES liste(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  quantita TEXT,
  spuntato BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storico prodotti per i suggerimenti/autocomplete: ogni prodotto mai aggiunto
-- da chiunque, con quante volte è stato usato (per ordinare i suggeriti).
-- nome_norm è la chiave normalizzata (minuscolo/trim), nome è la forma da mostrare.
CREATE TABLE prodotti_storico (
  id SERIAL PRIMARY KEY,
  nome_norm TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  usi INTEGER NOT NULL DEFAULT 1,
  ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Promemoria personali con destinatario specifico (una delle 4 persone).
-- ricorrenza:
--   'una_tantum' -> una sola volta, in una data precisa (campo data)
--   'giornaliero'-> ogni giorno all'orario indicato
CREATE TABLE promemoria (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  destinatario_id INTEGER NOT NULL REFERENCES users(id),
  testo TEXT NOT NULL,
  data DATE,
  orario TEXT NOT NULL,
  ricorrenza TEXT NOT NULL DEFAULT 'giornaliero',
  attivo BOOLEAN NOT NULL DEFAULT true,
  ultimo_invio TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bacheca: messaggi visibili nell'app e inoltrati come broadcast a tutti e 4.
CREATE TABLE bacheca (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  testo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
