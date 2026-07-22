import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox, EmptyState } from '../components';

interface Messaggio {
  id: number; testo: string; created_at: string; autore: string; mio: boolean;
}

function quando(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const stesso = d.toDateString() === oggi.toDateString();
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return stesso ? ora : `${d.toLocaleDateString('it-IT')} ${ora}`;
}

export default function Bacheca() {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function carica() {
    try {
      setMessaggi(await api<Messaggio[]>('/bacheca'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carica(); }, []);

  async function invia() {
    if (!testo.trim()) return;
    setInvio(true);
    setError(null);
    try {
      haptic.success();
      const m = await api<Messaggio>('/bacheca', { method: 'POST', body: { testo } });
      setMessaggi((l) => [m, ...l]);
      setTesto('');
      taRef.current?.focus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInvio(false);
    }
  }

  if (loading) return <><PageHeader title="Bacheca" /><Spinner /></>;

  return (
    <>
      <PageHeader title="Bacheca" />
      <ErrorBox error={error} />

      <div className="composer">
        <textarea
          ref={taRef}
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Scrivi a tutta la famiglia…"
        />
        <button onClick={invia} disabled={invio || !testo.trim()}>Invia</button>
      </div>
      <p className="note" style={{ marginTop: 0, marginBottom: 14 }}>
        Il messaggio compare qui e viene inoltrato dal bot in chat a tutti e 4 (con notifica push).
      </p>

      {messaggi.length === 0 ? (
        <EmptyState emoji="📣" text="Ancora nessun messaggio" />
      ) : (
        messaggi.map((m) => (
          <div key={m.id} className={`msg ${m.mio ? 'mine' : ''}`}>
            <div className="msg-head">
              <b>{m.mio ? 'Tu' : m.autore}</b>
              <span>{quando(m.created_at)}</span>
            </div>
            <div className="msg-body">{m.testo}</div>
          </div>
        ))
      )}
    </>
  );
}
