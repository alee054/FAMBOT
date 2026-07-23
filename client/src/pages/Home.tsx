import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox, EmptyState } from '../components';

interface Voce { id: number; nome: string; quantita: string | null; spuntato: boolean; }
interface Persona { id: number; nome: string; io: boolean; }
interface Lista {
  id: number; titolo: string; stato: 'bozza' | 'attiva' | 'storico';
  destinatario: { id: number; nome: string } | null;
  autore: string | null; inviata_at: string | null; voci: Voce[];
}
interface ListaSummary { id: number; stato: string; }

const POLL_MS = 6000;

function scadenza(inviata_at: string): string {
  const fine = new Date(inviata_at).getTime() + 24 * 3600 * 1000;
  const restano = fine - Date.now();
  if (restano <= 0) return 'sta per archiviarsi';
  const ore = Math.floor(restano / 3600000);
  const min = Math.floor((restano % 3600000) / 60000);
  return ore >= 1 ? `modificabile ancora ${ore}h` : `modificabile ancora ${min} min`;
}

/* ---------------- Card di una singola lista (interattiva) ---------------- */

function ListaCard({ listaId, persone, onChange }: {
  listaId: number;
  persone: Persona[];
  onChange: () => void;
}) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [quantita, setQuantita] = useState('');
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [destId, setDestId] = useState<number | ''>('');
  const [inviando, setInviando] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);
  // Mentre l'utente sta scrivendo non ricarichiamo (per non cancellargli il testo).
  const digitando = useRef(false);

  const caricaLista = useCallback(async () => {
    try {
      const l = await api<Lista>(`/liste/${listaId}`);
      setLista(l);
      setDestId((cur) => (cur === '' && l.destinatario ? l.destinatario.id : cur));
    } catch (e: any) {
      setError(e.message);
    }
  }, [listaId]);

  async function caricaSuggerimenti(q: string) {
    try {
      setSuggerimenti(await api<string[]>(`/liste/suggerimenti?q=${encodeURIComponent(q)}`));
    } catch { /* ignora */ }
  }

  useEffect(() => {
    caricaLista();
    caricaSuggerimenti('');
    const iv = setInterval(() => {
      if (!document.hidden && !digitando.current) caricaLista();
    }, POLL_MS);
    const onFocus = () => { if (!digitando.current) caricaLista(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [caricaLista]);

  const nomiInLista = useMemo(
    () => new Set((lista?.voci ?? []).map((v) => v.nome.trim().toLowerCase())),
    [lista]
  );
  const chips = suggerimenti.filter((s) => !nomiInLista.has(s.trim().toLowerCase())).slice(0, 8);

  async function aggiungi(nomeProdotto: string, q?: string) {
    const n = nomeProdotto.trim();
    if (!n) return;
    setError(null);
    try {
      haptic.light();
      const l = await api<Lista>(`/liste/${listaId}/voci`, {
        method: 'POST', body: { nome: n, quantita: q ?? '' },
      });
      setLista(l);
      setNome(''); setQuantita('');
      nomeRef.current?.focus();
      caricaSuggerimenti('');
    } catch (e: any) { setError(e.message); }
  }

  async function toggle(v: Voce) {
    try {
      haptic.light();
      const l = await api<Lista>(`/liste/${listaId}/voci/${v.id}`, {
        method: 'PATCH', body: { spuntato: !v.spuntato },
      });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function elimina(v: Voce) {
    try {
      const l = await api<Lista>(`/liste/${listaId}/voci/${v.id}`, { method: 'DELETE' });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function rinomina(titolo: string) {
    if (!lista || titolo.trim() === lista.titolo || !titolo.trim()) return;
    try {
      const l = await api<Lista>(`/liste/${listaId}`, { method: 'PATCH', body: { titolo } });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function eliminaLista() {
    if (!confirm('Eliminare questa lista?')) return;
    try {
      await api(`/liste/${listaId}`, { method: 'DELETE' });
      onChange();
    } catch (e: any) { setError(e.message); }
  }

  async function invia() {
    if (destId === '') { setError('Scegli a chi mandarla'); return; }
    setInviando(true); setError(null);
    try {
      haptic.success();
      const l = await api<Lista>(`/liste/${listaId}/invia`, {
        method: 'POST', body: { destinatario_id: destId },
      });
      setLista(l);
    } catch (e: any) { setError(e.message); }
    finally { setInviando(false); }
  }

  async function copia() {
    if (!lista) return;
    const righe = lista.voci.map((v) => `- ${v.nome}${v.quantita ? ` (${v.quantita})` : ''}`);
    try {
      await navigator.clipboard.writeText(`${lista.titolo}\n${righe.join('\n')}`);
      setCopiato(true); haptic.success();
      setTimeout(() => setCopiato(false), 1800);
    } catch { setError('Copia non riuscita'); }
  }

  if (!lista) return <div className="card"><Spinner /></div>;

  const restano = lista.voci.filter((v) => !v.spuntato).length;

  return (
    <div className="card">
      <input
        className="lista-titolo"
        defaultValue={lista.titolo}
        key={lista.titolo}
        onFocus={() => { digitando.current = true; }}
        onBlur={(e) => { digitando.current = false; rinomina(e.target.value); }}
        placeholder="Titolo della lista"
      />
      <p className="lista-meta">
        {lista.autore && <>di <b>{lista.autore}</b> · </>}
        {lista.voci.length} {lista.voci.length === 1 ? 'prodotto' : 'prodotti'}
        {restano > 0 && lista.voci.length > 0 ? ` · ${restano} da prendere` : ''}
        {lista.stato === 'attiva' && (
          <> · <span className="pill attiva">inviata{lista.destinatario ? ` a ${lista.destinatario.nome}` : ''}</span></>
        )}
      </p>

      <ErrorBox error={error} />

      <div className="add-voce">
        <input
          ref={nomeRef}
          className="nome"
          placeholder="Aggiungi prodotto…"
          value={nome}
          onFocus={() => { digitando.current = true; }}
          onBlur={() => { digitando.current = false; }}
          onChange={(e) => { setNome(e.target.value); caricaSuggerimenti(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') aggiungi(nome, quantita); }}
        />
        <input
          className="q"
          placeholder="Qtà"
          value={quantita}
          onFocus={() => { digitando.current = true; }}
          onBlur={() => { digitando.current = false; }}
          onChange={(e) => setQuantita(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aggiungi(nome, quantita); }}
        />
        <button onClick={() => aggiungi(nome, quantita)} aria-label="Aggiungi">+</button>
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((s) => (
            <button key={s} className="chip" onClick={() => aggiungi(s)}>+ {s}</button>
          ))}
        </div>
      )}

      <div className="voci-box">
        {lista.voci.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>Ancora nessun prodotto</div>
        ) : (
          lista.voci.map((v) => (
            <div key={v.id} className={`voce ${v.spuntato ? 'done' : ''}`}>
              <button className="voce-tap" onClick={() => toggle(v)}>
                <span className={`check ${v.spuntato ? 'on' : ''}`} aria-hidden>
                  {v.spuntato ? '✓' : ''}
                </span>
                <span className="voce-main">
                  <span className="voce-nome">{v.nome}</span>
                  {v.quantita && <span className="voce-q">{v.quantita}</span>}
                </span>
              </button>
              <button className="voce-del" onClick={() => elimina(v)} aria-label="Togli">×</button>
            </div>
          ))
        )}
      </div>

      <div className="invia-box">
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Manda la lista a</label>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Scegli chi…</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.io ? ' (io)' : ''}</option>
            ))}
          </select>
        </div>
        <button className="primary-btn" onClick={invia} disabled={inviando || lista.voci.length === 0}>
          {lista.stato === 'attiva' ? '📤 Reinvia la lista' : '📤 Invia la lista'}
        </button>
        <button className="secondary-btn" onClick={copia}>
          {copiato ? '✓ Copiata' : '📋 Copia per le Note'}
        </button>
      </div>

      {lista.stato === 'attiva' && lista.inviata_at && (
        <p className="note">Inviata · {scadenza(lista.inviata_at)}, poi va nello storico.</p>
      )}

      <button className="inline-btn danger-text" style={{ marginTop: 6 }} onClick={eliminaLista}>
        Elimina lista
      </button>
    </div>
  );
}

/* ---------------- Home: elenco delle liste attive/in preparazione ---------------- */

export default function Home() {
  const [ids, setIds] = useState<number[]>([]);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const caricaElenco = useCallback(async () => {
    try {
      const data = await api<ListaSummary[]>('/liste');
      setIds(data.filter((l) => l.stato !== 'storico').map((l) => l.id));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPersone(await api<Persona[]>('/users'));
        await caricaElenco();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    const iv = setInterval(() => { if (!document.hidden) caricaElenco(); }, POLL_MS);
    return () => clearInterval(iv);
  }, [caricaElenco]);

  async function nuovaLista() {
    setCreando(true); setError(null);
    try {
      haptic.light();
      await api<{ id: number }>('/liste', { method: 'POST', body: {} });
      await caricaElenco();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  if (loading) return <><PageHeader title="Spesa" /><Spinner /></>;

  return (
    <>
      <PageHeader title="🛒 Spesa" />
      <ErrorBox error={error} />

      {ids.length === 0 ? (
        <>
          <EmptyState emoji="🛒" text="Nessuna lista al momento. Creane una qui sotto." />
        </>
      ) : (
        ids.map((id) => (
          <ListaCard key={id} listaId={id} persone={persone} onChange={caricaElenco} />
        ))
      )}

      <button className="primary-btn" onClick={nuovaLista} disabled={creando}>
        ➕ Nuova lista della spesa
      </button>
      <Link to="/storico" className="secondary-btn">📦 Storico liste</Link>
    </>
  );
}
