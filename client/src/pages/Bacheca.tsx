import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox, EmptyState } from '../components';

interface Nodo {
  id: number; testo: string; created_at: string;
  autore: string; mio: boolean; via: string; risposte: Nodo[];
}

const POLL_MS = 6000;

function quando(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const stesso = d.toDateString() === oggi.toDateString();
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return stesso ? ora : `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${ora}`;
}

function Bolla({ n }: { n: Nodo }) {
  return (
    <div className={`bubble ${n.mio ? 'mine' : ''}`}>
      <div className="bubble-head">
        <b>{n.mio ? 'Tu' : n.autore}</b>
        <span>{quando(n.created_at)}</span>
        {n.via === 'telegram' && <span className="via" title="Scritto da Telegram">💬</span>}
      </div>
      <div className="bubble-body">{n.testo}</div>
    </div>
  );
}

function Thread({ n, onReply }: { n: Nodo; onReply: (rootId: number, testo: string) => Promise<void> }) {
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);

  async function invia() {
    if (!testo.trim() || invio) return;
    setInvio(true);
    try {
      await onReply(n.id, testo.trim());
      setTesto('');
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="thread">
      <Bolla n={n} />
      {n.risposte.length > 0 && (
        <div className="risposte">
          {n.risposte.map((r) => <Bolla key={r.id} n={r} />)}
        </div>
      )}
      <div className="reply-box">
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') invia(); }}
          placeholder="Rispondi…"
        />
        <button onClick={invia} disabled={invio || !testo.trim()}>Invia</button>
      </div>
    </div>
  );
}

export default function Bacheca() {
  const [thread, setThread] = useState<Nodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const digitando = useRef(false);

  const carica = useCallback(async () => {
    try {
      setThread(await api<Nodo[]>('/bacheca'));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    (async () => { await carica(); setLoading(false); })();
    const iv = setInterval(() => {
      if (!document.hidden && !digitando.current) carica();
    }, POLL_MS);
    const onFocus = () => { if (!digitando.current) carica(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [carica]);

  async function inviaNuovo() {
    if (!testo.trim()) return;
    setInvio(true); setError(null);
    try {
      haptic.success();
      await api('/bacheca', { method: 'POST', body: { testo: testo.trim() } });
      setTesto('');
      taRef.current?.focus();
      await carica();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInvio(false);
    }
  }

  async function inviaRisposta(rootId: number, t: string) {
    setError(null);
    try {
      haptic.light();
      await api('/bacheca', { method: 'POST', body: { testo: t, parent_id: rootId } });
      await carica();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) return <><PageHeader title="Bacheca" /><Spinner /></>;

  return (
    <>
      <PageHeader title="💬 Bacheca" />
      <ErrorBox error={error} />

      <div className="composer">
        <textarea
          ref={taRef}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onFocus={() => { digitando.current = true; }}
          onBlur={() => { digitando.current = false; }}
          placeholder="Scrivi a tutta la famiglia…"
        />
        <button onClick={inviaNuovo} disabled={invio || !testo.trim()}>Invia</button>
      </div>
      <p className="note" style={{ marginTop: 0, marginBottom: 16 }}>
        Arriva a tutti come messaggio del bot (con notifica). Chi risponde — anche
        direttamente da Telegram — compare qui nella conversazione.
        I messaggi si cancellano da soli dopo 24 ore.
      </p>

      {thread.length === 0 ? (
        <EmptyState emoji="📣" text="Ancora nessun messaggio" />
      ) : (
        thread.map((n) => <Thread key={n.id} n={n} onReply={inviaRisposta} />)
      )}
    </>
  );
}
