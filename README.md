# Casa — Bot Telegram + Mini App di famiglia

Mini App Telegram (WebApp) a uso privato per 4 persone di casa. Login automatico
tramite Telegram `initData` (HMAC-SHA256 validato lato server, niente password).

Tre funzioni:
- **Lista della spesa** condivisa, con prodotti suggeriti dallo storico di tutti,
  invio a un destinatario scelto e auto-archiviazione dopo 24h.
- **Promemoria** personali, inviati dal bot a una persona specifica all'orario impostato.
- **Bacheca**: i messaggi compaiono nell'app e vengono inoltrati in chat a tutti e 4.

## Struttura

```
├── client/                 # Frontend: React + Vite + TypeScript
│   └── src/
│       ├── telegram.ts     # SDK Telegram (BackButton, haptic, tema)
│       ├── api.ts          # Fetch wrapper: manda initData in Authorization
│       ├── components.tsx  # Componenti condivisi + bottom nav (3 tab)
│       └── pages/          # Liste, ListaDettaglio, Storico, Promemoria, Bacheca
└── server/                 # Backend: Node.js + Express + TypeScript
    ├── migrations/         # Schema Postgres (applicato in automatico all'avvio)
    └── src/
        ├── auth.ts         # Validazione HMAC di initData + limite 4 utenti
        ├── db.ts           # Postgres (Railway) o pg-mem in-memory (sviluppo)
        ├── scheduler.ts    # Cron: promemoria + auto-archivio liste dopo 24h
        ├── telegram.ts     # Invio messaggi via Bot API
        └── routes/         # /api/users, /liste, /promemoria, /bacheca
```

In produzione un solo servizio: Express espone le API e serve anche il build del frontend.

## Sviluppo locale

```bash
npm install
npm run build --workspace=client        # build del frontend
$env:DEV_BYPASS_AUTH="1"; npm run dev    # PowerShell — server su :3000
```

Apri `http://localhost:3000`. Senza `DATABASE_URL` si usa un Postgres in-memory
(pg-mem): i dati si perdono al riavvio. `DEV_BYPASS_AUTH=1` entra con un utente
finto senza passare da Telegram (ignorato in produzione).

Per lavorare sul frontend con hot-reload: `npm run dev:client` (Vite su :5173, proxy verso :3000).

## Variabili d'ambiente

Copia `.env.example` in `.env` (che **non** va committato) e compila:

| Variabile | A cosa serve |
|---|---|
| `BOT_TOKEN` | token del bot (BotFather): valida gli accessi e invia i messaggi |
| `ALLOWED_TELEGRAM_IDS` | i 4 Telegram id ammessi, separati da virgola |
| `DATABASE_URL` | Postgres in produzione (assente in locale → pg-mem) |
| `PORT` | porta del server (default 3000) |
| `DEV_BYPASS_AUTH` | `1` solo in sviluppo per saltare l'autenticazione |

### Chi può entrare

L'app è chiusa a 4 persone. Due livelli di protezione:
1. Se imposti `ALLOWED_TELEGRAM_IDS`, solo quegli id entrano (consigliato).
2. In ogni caso vale il tetto di 4 utenti: i primi 4 che entrano restano gli unici;
   il quinto viene rifiutato.

Per scoprire i Telegram id: fai scrivere a ciascuno a `@userinfobot`, oppure lascia
che i 4 aprano l'app per primi.

## Deploy su Railway

1. Metti il progetto su GitHub (`git init && git add . && git commit`).
2. Railway → New Project → Deploy from GitHub repo. Usa `npm run build` + `npm start`.
3. Aggiungi un database PostgreSQL e collega `DATABASE_URL` con `${{Postgres.DATABASE_URL}}`.
4. Imposta `BOT_TOKEN`, `ALLOWED_TELEGRAM_IDS`, `NODE_ENV=production`.
5. Settings → Networking → Generate Domain (serve HTTPS, incluso).

## Collegare la Mini App al bot (BotFather)

1. `@BotFather` → `/mybots` → il tuo bot → Bot Settings → Menu Button → Configure.
2. Incolla l'URL Railway e dai un nome al bottone.
3. Il bottone in basso nella chat del bot apre la Mini App.

> Il `BOT_TOKEN` sul server deve essere lo stesso bot da cui apri la Mini App,
> altrimenti la validazione di initData fallisce con 401.
