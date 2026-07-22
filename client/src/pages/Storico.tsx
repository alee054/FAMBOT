import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Spinner, ErrorBox, EmptyState } from '../components';

interface ListaSummary {
  id: number; titolo: string; stato: string; n_voci: number;
  inviata_at: string | null; destinatario: string | null;
}

export default function Storico() {
  const navigate = useNavigate();
  const [liste, setListe] = useState<ListaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<ListaSummary[]>('/liste');
        setListe(data.filter((l) => l.stato === 'storico'));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <><PageHeader title="Storico liste" back /><Spinner /></>;

  return (
    <>
      <PageHeader title="Storico liste" back />
      <ErrorBox error={error} />
      {liste.length === 0 ? (
        <EmptyState emoji="📦" text="Nessuna lista archiviata" />
      ) : (
        <div className="card">
          {liste.map((l) => (
            <button key={l.id} className="list-row" onClick={() => navigate(`/lista/${l.id}`)}>
              <div className="main">
                <div className="title">{l.titolo}</div>
                <div className="sub">
                  {l.n_voci} {l.n_voci === 1 ? 'prodotto' : 'prodotti'}
                  {l.inviata_at ? ` · ${new Date(l.inviata_at).toLocaleDateString('it-IT')}` : ''}
                  {l.destinatario ? ` · a ${l.destinatario}` : ''}
                </div>
              </div>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
