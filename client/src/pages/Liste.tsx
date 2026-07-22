import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { haptic } from '../telegram';
import { PageHeader, Spinner, ErrorBox, EmptyState } from '../components';

interface ListaSummary {
  id: number;
  titolo: string;
  stato: 'bozza' | 'attiva' | 'storico';
  n_voci: number;
  inviata_at: string | null;
  updated_at: string;
  autore: string | null;
  destinatario: string | null;
}

function scadenza(inviata_at: string): string {
  const fine = new Date(inviata_at).getTime() + 24 * 3600 * 1000;
  const restano = fine - Date.now();
  if (restano <= 0) return 'in archiviazione';
  const ore = Math.floor(restano / 3600000);
  const min = Math.floor((restano % 3600000) / 60000);
  return ore >= 1 ? `modificabile per ${ore}h ancora` : `modificabile per ${min}min ancora`;
}

export default function Liste() {
  const navigate = useNavigate();
  const [liste, setListe] = useState<ListaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function carica() {
    try {
      const data = await api<ListaSummary[]>('/liste');
      setListe(data.filter((l) => l.stato !== 'storico'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carica(); }, []);

  async function nuovaLista() {
    setCreando(true);
    setError(null);
    try {
      haptic.light();
      const l = await api<{ id: number }>('/liste', { method: 'POST', body: {} });
      navigate(`/lista/${l.id}`);
    } catch (e: any) {
      setError(e.message);
      setCreando(false);
    }
  }

  if (loading) return <><PageHeader title="Spesa" /><Spinner /></>;

  return (
    <>
      <PageHeader title="Spesa" />
      <ErrorBox error={error} />

      {liste.length === 0 ? (
        <EmptyState emoji="🛒" text="Nessuna lista attiva. Creane una col +" />
      ) : (
        <div className="card">
          {liste.map((l) => (
            <button key={l.id} className="list-row" onClick={() => navigate(`/lista/${l.id}`)}>
              <div className="main">
                <div className="title">{l.titolo}</div>
                <div className="sub">
                  {l.n_voci} {l.n_voci === 1 ? 'prodotto' : 'prodotti'}
                  {l.stato === 'attiva' && l.destinatario ? ` · inviata a ${l.destinatario}` : ''}
                  {l.stato === 'attiva' && l.inviata_at ? ` · ${scadenza(l.inviata_at)}` : ''}
                </div>
              </div>
              <span className={`pill ${l.stato}`}>{l.stato === 'attiva' ? 'inviata' : 'bozza'}</span>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      )}

      <Link to="/storico" className="secondary-btn" style={{ textAlign: 'center', textDecoration: 'none' }}>
        Storico liste
      </Link>

      <button className="add-fab" onClick={nuovaLista} disabled={creando} aria-label="Nuova lista">+</button>
    </>
  );
}
