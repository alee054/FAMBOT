import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox } from '../components';

interface Voce { id: number; nome: string; quantita: string | null; spuntato: boolean; }
interface Persona { id: number; nome: string; io: boolean; }
interface Lista {
  id: number; titolo: string; stato: 'bozza' | 'attiva' | 'storico';
  destinatario: { id: number; nome: string } | null;
  autore: string | null; inviata_at: string | null; voci: Voce[];
}

export default function ListaDettaglio() {
  const { id } = useParams();
  const [lista, setLista] = useState<Lista | null>(null);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [quantita, setQuantita] = useState('');
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [destId, setDestId] = useState<number | ''>('');
  const [inviando, setInviando] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  const readonly = lista?.stato === 'storico';

  async function caricaLista() {
    const l = await api<Lista>(`/liste/${id}`);
    setLista(l);
    if (l.destinatario) setDestId(l.destinatario.id);
  }

  async function caricaSuggerimenti(q: string) {
    try {
      const s = await api<string[]>(`/liste/suggerimenti?q=${encodeURIComponent(q)}`);
      setSuggerimenti(s);
    } catch { /* ignora */ }
  }

  useEffect(() => {
    (async () => {
      try {
        await caricaLista();
        setPersone(await api<Persona[]>('/users'));
        await caricaSuggerimenti('');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Suggerimenti che non sono già nella lista.
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
      const l = await api<Lista>(`/liste/${id}/voci`, {
        method: 'POST',
        body: { nome: n, quantita: q ?? '' },
      });
      setLista(l);
      setNome('');
      setQuantita('');
      nomeRef.current?.focus();
      caricaSuggerimenti('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggle(v: Voce) {
    try {
      haptic.light();
      const l = await api<Lista>(`/liste/${id}/voci/${v.id}`, {
        method: 'PATCH', body: { spuntato: !v.spuntato },
      });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function elimina(v: Voce) {
    try {
      const l = await api<Lista>(`/liste/${id}/voci/${v.id}`, { method: 'DELETE' });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function rinomina(titolo: string) {
    if (!lista || titolo.trim() === lista.titolo) return;
    try {
      const l = await api<Lista>(`/liste/${id}`, { method: 'PATCH', body: { titolo } });
      setLista(l);
    } catch (e: any) { setError(e.message); }
  }

  async function invia() {
    if (destId === '') { setError('Scegli un destinatario'); return; }
    setInviando(true);
    setError(null);
    try {
      haptic.success();
      const l = await api<Lista>(`/liste/${id}/invia`, {
        method: 'POST', body: { destinatario_id: destId },
      });
      setLista(l);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInviando(false);
    }
  }

  function testoPerNote(): string {
    if (!lista) return '';
    const righe = lista.voci.map((v) => `- ${v.nome}${v.quantita ? ` (${v.quantita})` : ''}`);
    return `${lista.titolo}\n${righe.join('\n')}`;
  }

  async function copia() {
    try {
      await navigator.clipboard.writeText(testoPerNote());
      setCopiato(true);
      haptic.success();
      setTimeout(() => setCopiato(false), 1800);
    } catch {
      setError('Copia non riuscita');
    }
  }

  if (loading) return <><PageHeader title="Lista" back /><Spinner /></>;
  if (!lista) return <><PageHeader title="Lista" back /><ErrorBox error={error ?? 'Lista non trovata'} /></>;

  return (
    <>
      <PageHeader title={readonly ? 'Lista (archiviata)' : 'Lista'} back />
      <ErrorBox error={error} />

      <div className="field">
        <input
          defaultValue={lista.titolo}
          disabled={readonly}
          onBlur={(e) => rinomina(e.target.value)}
          placeholder="Titolo della lista"
          style={{ fontWeight: 700, fontSize: 18 }}
        />
      </div>

      {!readonly && (
        <>
          <div className="add-voce">
            <input
              ref={nomeRef}
              className="nome"
              placeholder="Aggiungi prodotto…"
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
            <button onClick={() => aggiungi(nome, quantita)}>+</button>
          </div>

          {chips.length > 0 && (
            <div className="chips">
              {chips.map((s) => (
                <button key={s} className="chip" onClick={() => aggiungi(s)}>+ {s}</button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        {lista.voci.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>Nessun prodotto</div>
        ) : (
          lista.voci.map((v) => (
            <div key={v.id} className={`voce ${v.spuntato ? 'done' : ''}`}>
              <button
                className={`check ${v.spuntato ? 'on' : ''}`}
                onClick={() => toggle(v)}
                disabled={readonly}
                aria-label="Spunta"
              >
                {v.spuntato ? '✓' : ''}
              </button>
              <div className="voce-main">
                <span className="voce-nome">{v.nome}</span>
                {v.quantita && <span className="voce-q">{v.quantita}</span>}
              </div>
              {!readonly && (
                <button className="voce-del" onClick={() => elimina(v)} aria-label="Elimina">×</button>
              )}
            </div>
          ))
        )}
      </div>

      {!readonly && (
        <>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Invia a</label>
            <select value={destId} onChange={(e) => setDestId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Scegli destinatario…</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}{p.io ? ' (io)' : ''}</option>
              ))}
            </select>
          </div>
          <button className="primary-btn" onClick={invia} disabled={inviando || lista.voci.length === 0}>
            {lista.stato === 'attiva' ? 'Reinvia lista' : 'Invia lista'}
          </button>
        </>
      )}

      <button className="secondary-btn" onClick={copia}>
        {copiato ? '✓ Copiata' : 'Copia per le Note'}
      </button>

      {lista.stato === 'attiva' && (
        <p className="note">
          Lista inviata{lista.destinatario ? ` a ${lista.destinatario.nome}` : ''}. Resta modificabile per 24h
          dall'invio, poi finisce nello storico. Puoi reinviarla dopo le modifiche.
        </p>
      )}
      {readonly && <p className="note">Lista archiviata: sola lettura.</p>}
    </>
  );
}
