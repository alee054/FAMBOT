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

/* =======================================================================
   Pannello di modifica: si apre solo quando si preme "Modifica lista".
   Qui dentro sta tutto ciò che cambia la lista (titolo, prodotti,
   destinatario, invio, eliminazione). Chiuso il pannello, nella home la
   lista è solo da guardare e spuntare.
   ======================================================================= */

function PannelloModifica({ lista, persone, setLista, onChiudi, onEliminata }: {
  lista: Lista;
  persone: Persona[];
  setLista: (l: Lista) => void;
  onChiudi: () => void;
  onEliminata: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [quantita, setQuantita] = useState('');
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [destId, setDestId] = useState<number | ''>(lista.destinatario?.id ?? '');
  const [inviando, setInviando] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  const caricaSuggerimenti = useCallback(async (q: string) => {
    try {
      setSuggerimenti(await api<string[]>(`/liste/suggerimenti?q=${encodeURIComponent(q)}`));
    } catch { /* ignora */ }
  }, []);

  useEffect(() => { caricaSuggerimenti(''); }, [caricaSuggerimenti]);

  const nomiInLista = useMemo(
    () => new Set(lista.voci.map((v) => v.nome.trim().toLowerCase())),
    [lista.voci]
  );
  const chips = suggerimenti.filter((s) => !nomiInLista.has(s.trim().toLowerCase())).slice(0, 8);

  async function aggiungi(nomeProdotto: string, q?: string) {
    const n = nomeProdotto.trim();
    if (!n) return;
    setError(null);
    try {
      haptic.light();
      setLista(await api<Lista>(`/liste/${lista.id}/voci`, {
        method: 'POST', body: { nome: n, quantita: q ?? '' },
      }));
      setNome(''); setQuantita('');
      nomeRef.current?.focus();
      caricaSuggerimenti('');
    } catch (e: any) { setError(e.message); }
  }

  async function togli(v: Voce) {
    try {
      haptic.light();
      setLista(await api<Lista>(`/liste/${lista.id}/voci/${v.id}`, { method: 'DELETE' }));
    } catch (e: any) { setError(e.message); }
  }

  async function rinomina(titolo: string) {
    if (!titolo.trim() || titolo.trim() === lista.titolo) return;
    try {
      setLista(await api<Lista>(`/liste/${lista.id}`, { method: 'PATCH', body: { titolo } }));
    } catch (e: any) { setError(e.message); }
  }

  async function invia() {
    if (destId === '') { setError('Scegli a chi mandarla'); return; }
    setInviando(true); setError(null);
    try {
      haptic.success();
      setLista(await api<Lista>(`/liste/${lista.id}/invia`, {
        method: 'POST', body: { destinatario_id: destId },
      }));
    } catch (e: any) { setError(e.message); }
    finally { setInviando(false); }
  }

  async function copia() {
    const righe = lista.voci.map((v) => `- ${v.nome}${v.quantita ? ` (${v.quantita})` : ''}`);
    try {
      await navigator.clipboard.writeText(`${lista.titolo}\n${righe.join('\n')}`);
      setCopiato(true); haptic.success();
      setTimeout(() => setCopiato(false), 1800);
    } catch { setError('Copia non riuscita'); }
  }

  async function eliminaLista() {
    if (!confirm('Eliminare tutta la lista?')) return;
    try {
      await api(`/liste/${lista.id}`, { method: 'DELETE' });
      onEliminata();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="sheet-backdrop" onClick={onChiudi}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Modifica lista</h2>
          <button className="sheet-close" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>

        <div className="sheet-body">
          <ErrorBox error={error} />

          <div className="field">
            <label>Nome della lista</label>
            <input
              defaultValue={lista.titolo}
              onBlur={(e) => rinomina(e.target.value)}
              placeholder="Lista della spesa"
            />
          </div>

          <div className="field">
            <label>Aggiungi un prodotto</label>
            <div className="add-voce">
              <input
                ref={nomeRef}
                className="nome"
                placeholder="Es. Latte"
                value={nome}
                onChange={(e) => { setNome(e.target.value); caricaSuggerimenti(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') aggiungi(nome, quantita); }}
              />
              <input
                className="q"
                placeholder="Qtà"
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') aggiungi(nome, quantita); }}
              />
              <button onClick={() => aggiungi(nome, quantita)} aria-label="Aggiungi">+</button>
            </div>
          </div>

          {chips.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 4 }}>Già usati altre volte</div>
              <div className="chips">
                {chips.map((s) => (
                  <button key={s} className="chip" onClick={() => aggiungi(s)}>+ {s}</button>
                ))}
              </div>
            </>
          )}

          <div className="section-label">Prodotti nella lista</div>
          <div className="card">
            {lista.voci.length === 0 ? (
              <div className="empty" style={{ padding: 18 }}>Ancora nessun prodotto</div>
            ) : (
              lista.voci.map((v) => (
                <div key={v.id} className="voce">
                  <div className="voce-main">
                    <span className="voce-nome">{v.nome}</span>
                    {v.quantita && <span className="voce-q">{v.quantita}</span>}
                  </div>
                  <button className="voce-del" onClick={() => togli(v)} aria-label="Togli">×</button>
                </div>
              ))
            )}
          </div>

          <div className="field">
            <label>Manda la lista a</label>
            <select value={destId} onChange={(e) => setDestId(e.target.value ? Number(e.target.value) : '')}>
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

          <button className="inline-btn danger-text" style={{ marginTop: 18 }} onClick={eliminaLista}>
            Elimina tutta la lista
          </button>
        </div>

        <div className="sheet-foot">
          <button className="primary-btn" style={{ marginTop: 0 }} onClick={onChiudi}>✓ Fatto</button>
        </div>
      </div>
    </div>
  );
}

/* =======================================================================
   Card della lista in home: solo da guardare e spuntare.
   ======================================================================= */

function ListaCard({ listaId, persone, onChange }: {
  listaId: number;
  persone: Persona[];
  onChange: () => void;
}) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modifica, setModifica] = useState(false);
  const modificaRef = useRef(false);
  modificaRef.current = modifica;

  const caricaLista = useCallback(async () => {
    try {
      setLista(await api<Lista>(`/liste/${listaId}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [listaId]);

  useEffect(() => {
    caricaLista();
    const iv = setInterval(() => {
      // niente ricarica mentre si sta modificando: cancellerebbe quello che si sta facendo
      if (!document.hidden && !modificaRef.current) caricaLista();
    }, POLL_MS);
    const onFocus = () => { if (!modificaRef.current) caricaLista(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [caricaLista]);

  async function spunta(v: Voce) {
    if (!lista) return;
    try {
      haptic.light();
      setLista(await api<Lista>(`/liste/${listaId}/voci/${v.id}`, {
        method: 'PATCH', body: { spuntato: !v.spuntato },
      }));
    } catch (e: any) { setError(e.message); }
  }

  if (!lista) return <div className="card"><Spinner /></div>;

  const restano = lista.voci.filter((v) => !v.spuntato).length;

  return (
    <>
      <div className="card">
        <h2 className="lista-nome">{lista.titolo}</h2>
        <p className="lista-meta">
          {lista.autore && <>di <b>{lista.autore}</b> · </>}
          {lista.voci.length} {lista.voci.length === 1 ? 'prodotto' : 'prodotti'}
          {lista.voci.length > 0 && restano > 0 ? ` · ${restano} da prendere` : ''}
          {lista.voci.length > 0 && restano === 0 ? ' · tutto preso ✓' : ''}
          {lista.stato === 'attiva' && (
            <> · <span className="pill attiva">inviata{lista.destinatario ? ` a ${lista.destinatario.nome}` : ''}</span></>
          )}
        </p>

        <ErrorBox error={error} />

        <div className="voci-box">
          {lista.voci.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              Lista vuota. Premi <b>Modifica lista</b> per aggiungere i prodotti.
            </div>
          ) : (
            lista.voci.map((v) => (
              <div key={v.id} className={`voce ${v.spuntato ? 'done' : ''}`}>
                <button className="voce-tap" onClick={() => spunta(v)}>
                  <span className={`check ${v.spuntato ? 'on' : ''}`} aria-hidden>
                    {v.spuntato ? '✓' : ''}
                  </span>
                  <span className="voce-main">
                    <span className="voce-nome">{v.nome}</span>
                    {v.quantita && <span className="voce-q">{v.quantita}</span>}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>

        {lista.stato === 'attiva' && lista.inviata_at && (
          <p className="note">Inviata · {scadenza(lista.inviata_at)}, poi va nello storico.</p>
        )}
      </div>

      <button className="secondary-btn" style={{ marginTop: 0 }} onClick={() => { haptic.light(); setModifica(true); }}>
        ✏️ Modifica lista
      </button>

      {modifica && (
        <PannelloModifica
          lista={lista}
          persone={persone}
          setLista={setLista}
          onChiudi={() => { setModifica(false); caricaLista(); onChange(); }}
          onEliminata={() => { setModifica(false); onChange(); }}
        />
      )}
    </>
  );
}

/* =======================================================================
   Home
   ======================================================================= */

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
        <EmptyState emoji="🛒" text="Nessuna lista al momento. Creane una qui sotto." />
      ) : (
        ids.map((id) => (
          <ListaCard key={id} listaId={id} persone={persone} onChange={caricaElenco} />
        ))
      )}

      <button className="primary-btn" onClick={nuovaLista} disabled={creando}>
        ➕ Nuova lista
      </button>
      <Link to="/storico" className="secondary-btn">📦 Storico liste</Link>
    </>
  );
}
