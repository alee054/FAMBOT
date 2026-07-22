import { useEffect, useState } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox, EmptyState, Field, Segmented, Switch } from '../components';

interface Persona { id: number; nome: string; io: boolean; }
interface Promemoria {
  id: number; testo: string; orario: string; data: string | null;
  ricorrenza: 'giornaliero' | 'una_tantum'; attivo: boolean;
  destinatario_id: number; destinatario: string;
}

function oggiISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export default function Promemoria() {
  const [lista, setLista] = useState<Promemoria[]>([]);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [testo, setTesto] = useState('');
  const [destId, setDestId] = useState<number | ''>('');
  const [orario, setOrario] = useState('09:00');
  const [ricorrenza, setRicorrenza] = useState<'giornaliero' | 'una_tantum'>('giornaliero');
  const [data, setData] = useState(oggiISO());

  async function carica() {
    try {
      const [p, u] = await Promise.all([
        api<Promemoria[]>('/promemoria'),
        api<Persona[]>('/users'),
      ]);
      setLista(p);
      setPersone(u);
      const io = u.find((x) => x.io);
      if (io && destId === '') setDestId(io.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carica(); }, []);

  async function aggiungi() {
    if (!testo.trim()) { setError('Scrivi il testo del promemoria'); return; }
    if (destId === '') { setError('Scegli un destinatario'); return; }
    setSalvando(true);
    setError(null);
    try {
      haptic.success();
      const body: any = { testo, orario, ricorrenza, destinatario_id: destId };
      if (ricorrenza === 'una_tantum') body.data = data;
      const nuovo = await api<Promemoria>('/promemoria', { method: 'POST', body });
      setLista((l) => [nuovo, ...l]);
      setTesto('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAttivo(p: Promemoria) {
    try {
      const upd = await api<Promemoria>(`/promemoria/${p.id}`, {
        method: 'PATCH', body: { attivo: !p.attivo },
      });
      setLista((l) => l.map((x) => (x.id === p.id ? upd : x)));
    } catch (e: any) { setError(e.message); }
  }

  async function elimina(p: Promemoria) {
    try {
      await api(`/promemoria/${p.id}`, { method: 'DELETE' });
      setLista((l) => l.filter((x) => x.id !== p.id));
    } catch (e: any) { setError(e.message); }
  }

  if (loading) return <><PageHeader title="Promemoria" /><Spinner /></>;

  return (
    <>
      <PageHeader title="Promemoria" />
      <ErrorBox error={error} />

      <div className="card">
        <div className="card-title">Nuovo promemoria</div>
        <Field label="Testo">
          <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. Portare fuori il bidone" />
        </Field>
        <Field label="A chi va inviato">
          <select value={destId} onChange={(e) => setDestId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Scegli…</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.io ? ' (io)' : ''}</option>
            ))}
          </select>
        </Field>
        <Segmented
          options={[
            { value: 'giornaliero', label: 'Ogni giorno' },
            { value: 'una_tantum', label: 'Una volta' },
          ]}
          value={ricorrenza}
          onChange={setRicorrenza}
        />
        <div className="row-between" style={{ gap: 10 }}>
          {ricorrenza === 'una_tantum' && (
            <Field label="Data">
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
          )}
          <Field label="Orario">
            <input type="time" value={orario} onChange={(e) => setOrario(e.target.value)} />
          </Field>
        </div>
        <button className="primary-btn" onClick={aggiungi} disabled={salvando}>Aggiungi promemoria</button>
      </div>

      <div className="section-label">I miei promemoria</div>
      {lista.length === 0 ? (
        <EmptyState emoji="⏰" text="Nessun promemoria" />
      ) : (
        <div className="card">
          {lista.map((p) => (
            <div key={p.id} className="voce" style={{ alignItems: 'flex-start' }}>
              <div className="voce-main">
                <div className="voce-nome">{p.testo}</div>
                <div className="sub" style={{ fontSize: 13, color: 'var(--hint)', marginTop: 2 }}>
                  a {p.destinatario} · {p.orario} ·{' '}
                  {p.ricorrenza === 'giornaliero'
                    ? 'ogni giorno'
                    : `il ${p.data ? new Date(p.data).toLocaleDateString('it-IT') : ''}`}
                  {!p.attivo ? ' · disattivo' : ''}
                </div>
              </div>
              <Switch checked={p.attivo} onChange={() => toggleAttivo(p)} />
              <button className="voce-del" onClick={() => elimina(p)} aria-label="Elimina">×</button>
            </div>
          ))}
        </div>
      )}
      <p className="note">
        Il promemoria viene inviato dal bot solo alla persona scelta, all'orario impostato (fuso Europe/Rome).
      </p>
    </>
  );
}
