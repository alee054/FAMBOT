import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components';
import { haptic } from '../telegram';

/* =========================================================================
   Piantina dell'Esselunga — fase 1: solo la mappa.
   Le zone sono già tutte identificate e cliccabili: in fase 2 ci si potranno
   agganciare i prodotti della lista della spesa.
   Coordinate: sistema interno della mappa (viewBox), ricalcato sulla piantina
   disegnata a mano (negozio a L, entrata in basso a destra).
   ========================================================================= */

const VB = { x: 80, y: 22, w: 665, h: 480 };

type Categoria =
  | 'forno' | 'salumeria' | 'blu' | 'pesce' | 'frutta' | 'fruttasecca'
  | 'succhi' | 'pomodori' | 'corsie' | 'frigo' | 'bevande' | 'casse' | 'entrata';

const COLORI: Record<Categoria, { fill: string; stroke: string }> = {
  forno:       { fill: '#FFEAD5', stroke: '#EA580C' },
  salumeria:   { fill: '#EFDCD6', stroke: '#9A4A38' },
  blu:         { fill: '#DBEAFE', stroke: '#2563EB' },
  pesce:       { fill: '#CFFAFE', stroke: '#0891B2' },
  frutta:      { fill: '#FEF3C7', stroke: '#D97706' },
  fruttasecca: { fill: '#FDE9B5', stroke: '#B45309' },
  succhi:      { fill: '#E0F2FE', stroke: '#0284C7' },
  pomodori:    { fill: '#FECACA', stroke: '#DC2626' },
  corsie:      { fill: '#FEF9C3', stroke: '#CA8A04' },
  frigo:       { fill: '#E0E7FF', stroke: '#4338CA' },
  bevande:     { fill: '#E2E8F0', stroke: '#475569' },
  casse:       { fill: '#BAE6FD', stroke: '#0EA5E9' },
  entrata:     { fill: '#BBF7D0', stroke: '#16A34A' },
};

interface Etichetta {
  x: number; y: number;
  righe: string[];
  size?: number;
  ruota?: boolean;   // testo verticale
}

type Forma =
  | { tipo: 'rect'; x: number; y: number; w: number; h: number; rx?: number }
  | { tipo: 'linea'; d: string; spessore: number };

interface Zona {
  id: string;
  nome: string;
  cat: Categoria;
  forma: Forma;
  et: Etichetta;
  centro: [number, number];
}

const ZONE: Zona[] = [
  { id: 'panetteria', nome: 'Panetteria', cat: 'forno',
    forma: { tipo: 'rect', x: 213, y: 54, w: 30, h: 112, rx: 6 },
    et: { x: 228, y: 110, righe: ['PANETTERIA'], size: 11, ruota: true }, centro: [228, 110] },

  { id: 'salumeria', nome: 'Salumeria', cat: 'salumeria',
    forma: { tipo: 'rect', x: 316, y: 52, w: 88, h: 36, rx: 10 },
    et: { x: 360, y: 74, righe: ['SALUMERIA'], size: 11 }, centro: [360, 70] },

  { id: 'hamburger', nome: 'Hamburger', cat: 'blu',
    forma: { tipo: 'rect', x: 424, y: 52, w: 68, h: 22, rx: 6 },
    et: { x: 458, y: 67, righe: ['HAMBURGER'], size: 9.5 }, centro: [458, 63] },

  { id: 'salse', nome: 'Salse', cat: 'blu',
    forma: { tipo: 'rect', x: 532, y: 52, w: 24, h: 52, rx: 5 },
    et: { x: 544, y: 78, righe: ['SALSE'], size: 10, ruota: true }, centro: [544, 78] },

  { id: 'pesce', nome: 'Pesce', cat: 'pesce',
    forma: { tipo: 'rect', x: 532, y: 108, w: 24, h: 74, rx: 5 },
    et: { x: 544, y: 145, righe: ['PESCE'], size: 10, ruota: true }, centro: [544, 145] },

  { id: 'frutta', nome: 'Reparto frutta & verdura', cat: 'frutta',
    forma: { tipo: 'rect', x: 556, y: 185, w: 161, h: 270, rx: 8 },
    et: { x: 676, y: 372, righe: ['FRUTTA', '& VERDURA'], size: 13, ruota: true }, centro: [640, 320] },

  { id: 'succhi', nome: 'Succhi di frutta', cat: 'succhi',
    forma: { tipo: 'rect', x: 559, y: 188, w: 20, h: 94, rx: 4 },
    et: { x: 569, y: 235, righe: ['SUCCHI'], size: 9, ruota: true }, centro: [569, 235] },

  { id: 'fruttasecca', nome: 'Frutta secca e banane', cat: 'fruttasecca',
    forma: { tipo: 'rect', x: 636, y: 190, w: 78, h: 95, rx: 6 },
    et: { x: 675, y: 237, righe: ['FRUTTA SECCA', 'E BANANE'], size: 9.5, ruota: true }, centro: [675, 237] },

  { id: 'pomodori', nome: 'Pomodori', cat: 'pomodori',
    forma: { tipo: 'rect', x: 559, y: 288, w: 70, h: 164, rx: 6 },
    et: { x: 594, y: 370, righe: ['POMODORI'], size: 12, ruota: true }, centro: [594, 370] },

  { id: 'gelato', nome: 'Gelato', cat: 'corsie',
    forma: { tipo: 'rect', x: 254, y: 192, w: 50, h: 190, rx: 6 },
    et: { x: 279, y: 287, righe: ['GELATO'], size: 11.5, ruota: true }, centro: [279, 287] },

  { id: 'patatine', nome: 'Patatine', cat: 'corsie',
    forma: { tipo: 'rect', x: 308, y: 192, w: 50, h: 190, rx: 6 },
    et: { x: 333, y: 287, righe: ['PATATINE'], size: 11.5, ruota: true }, centro: [333, 287] },

  { id: 'cosmetica', nome: 'Cosmetica', cat: 'corsie',
    forma: { tipo: 'rect', x: 362, y: 192, w: 52, h: 190, rx: 6 },
    et: { x: 388, y: 287, righe: ['COSMETICA'], size: 11.5, ruota: true }, centro: [388, 287] },

  { id: 'frigo', nome: 'Frigo e latte', cat: 'frigo',
    forma: { tipo: 'rect', x: 438, y: 170, w: 58, h: 218, rx: 8 },
    et: { x: 485, y: 279, righe: ['FRIGO E LATTE'], size: 10, ruota: true }, centro: [467, 279] },

  { id: 'acqua', nome: 'Acqua', cat: 'bevande',
    forma: { tipo: 'rect', x: 102, y: 252, w: 28, h: 96, rx: 6 },
    et: { x: 116, y: 300, righe: ['ACQUA'], size: 10, ruota: true }, centro: [116, 300] },

  { id: 'bibite', nome: 'Bibite', cat: 'bevande',
    forma: { tipo: 'rect', x: 150, y: 234, w: 92, h: 54, rx: 6 },
    et: { x: 196, y: 266, righe: ['BIBITE'], size: 12 }, centro: [196, 261] },

  { id: 'casse', nome: 'Casse', cat: 'casse',
    forma: { tipo: 'linea', d: 'M 184,352 L 206,436 L 560,436', spessore: 26 },
    et: { x: 392, y: 442, righe: ['CASSE'], size: 14 }, centro: [383, 436] },

  { id: 'entrata', nome: 'Entrata', cat: 'entrata',
    forma: { tipo: 'rect', x: 632, y: 447, w: 86, h: 17, rx: 8 },
    et: { x: 675, y: 480, righe: ['ENTRATA'], size: 12 }, centro: [675, 455] },
];

// Muri del negozio: forma a L, con l'annesso di acqua/bibite in basso a sinistra.
const MURI = '210,45 557,45 557,185 717,185 717,455 200,455 180,350 100,350 100,218 210,218';

/* ---------------- etichette ---------------- */

function Etichetta({ et, colore }: { et: Etichetta; colore: string }) {
  const size = et.size ?? 11;
  const n = et.righe.length;
  return (
    <text
      x={et.x} y={et.y} fill={colore} fontSize={size} fontWeight={700}
      textAnchor="middle" dominantBaseline="middle"
      transform={et.ruota ? `rotate(-90 ${et.x} ${et.y})` : undefined}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {et.righe.map((r, i) => (
        <tspan key={i} x={et.x} dy={i === 0 ? -((n - 1) * size * 0.55) : size * 1.1}>{r}</tspan>
      ))}
    </text>
  );
}

/* ---------------- pagina ---------------- */

const MIN_S = 0.8;
const MAX_S = 7;

export default function Piantina() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Zona | null>(null);

  // Vista (zoom + spostamento). Il ref è la fonte di verità per i gesti,
  // lo stato serve solo a ridisegnare.
  const vista = useRef({ s: 1, x: 0, y: 0 });
  const [, ridisegna] = useState(0);
  const applica = useCallback((v: { s: number; x: number; y: number }) => {
    vista.current = v;
    ridisegna((n) => n + 1);
  }, []);

  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const trascinato = useRef(false);

  const rettangolo = () => boxRef.current!.getBoundingClientRect();
  const locale = (e: { clientX: number; clientY: number }) => {
    const r = rettangolo();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const zoomVerso = useCallback((fattore: number, px: number, py: number) => {
    const v = vista.current;
    const s2 = Math.min(MAX_S, Math.max(MIN_S, v.s * fattore));
    const k = s2 / v.s;
    applica({ s: s2, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  }, [applica]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    puntatori.current.set(e.pointerId, locale(e));
    if (puntatori.current.size === 1) trascinato.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!puntatori.current.has(e.pointerId)) return;
    const p = locale(e);
    const prec = new Map(puntatori.current);
    puntatori.current.set(e.pointerId, p);

    if (puntatori.current.size === 1) {
      const p0 = prec.get(e.pointerId)!;
      const dx = p.x - p0.x;
      const dy = p.y - p0.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) trascinato.current = true;
      const v = vista.current;
      applica({ s: v.s, x: v.x + dx, y: v.y + dy });
    } else if (puntatori.current.size === 2) {
      trascinato.current = true;
      const vecchi = [...prec.values()];
      const nuovi = [...puntatori.current.values()];
      const dist = (a: any[], i = 0, j = 1) => Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y);
      const d0 = dist(vecchi);
      const d1 = dist(nuovi);
      if (d0 > 0 && d1 > 0) {
        const mx = (nuovi[0].x + nuovi[1].x) / 2;
        const my = (nuovi[0].y + nuovi[1].y) / 2;
        zoomVerso(d1 / d0, mx, my);
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    puntatori.current.delete(e.pointerId);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const p = locale(e);
    zoomVerso(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }

  // Il wheel va registrato non-passivo per poter fare preventDefault.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Inquadra una zona al centro dello schermo, ingrandita.
  const inquadra = useCallback((z: Zona) => {
    const el = boxRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const k = Math.min(cw / VB.w, ch / VB.h);         // fattore "adatta"
    const offX = (cw - VB.w * k) / 2;
    const offY = (ch - VB.h * k) / 2;
    const sx = offX + (z.centro[0] - VB.x) * k;        // posizione a zoom 1
    const sy = offY + (z.centro[1] - VB.y) * k;
    const s = 2.6;
    applica({ s, x: cw / 2 - sx * s, y: ch / 2 - sy * s });
  }, [applica]);

  function scegli(z: Zona | null, anche_inquadra = false) {
    if (trascinato.current) return;
    haptic.light();
    setSel(z);
    if (z && anche_inquadra) inquadra(z);
  }

  const adatta = () => { applica({ s: 1, x: 0, y: 0 }); };

  const v = vista.current;

  return (
    <>
      <PageHeader title="🗺️ Piantina" />

      <div className={`mappa-box ${sel ? 'has-sel' : ''}`}>
        <div
          className="mappa-viewport"
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <svg
            className="mappa"
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, transformOrigin: '0 0' }}
          >
            {/* pavimento + muri */}
            <polygon points={MURI} className="muri" onClick={() => scegli(null)} />

            {/* scaffali generici (non etichettati nello schizzo) */}
            <g className="scaffali">
              <rect x={318} y={118} width={44} height={14} rx={7} />
              <rect x={372} y={118} width={20} height={14} rx={7} className="scuro" />
              <rect x={412} y={118} width={44} height={14} rx={7} />
              <rect x={462} y={118} width={44} height={14} rx={7} />
              <rect x={518} y={212} width={6} height={44} rx={3} />
              <rect x={518} y={278} width={6} height={54} rx={3} />
            </g>

            {/* contenitore delle corsie centrali */}
            <rect x={248} y={168} width={172} height={222} rx={10} className="corsie-box" />
            <text x={334} y={181} className="testo-fuori" fontSize={10} fontWeight={700}
                  textAnchor="middle" dominantBaseline="middle">CORSIE CENTRALI</text>

            {/* zone */}
            {ZONE.map((z) => {
              const c = COLORI[z.cat];
              const attiva = sel?.id === z.id;
              return (
                <g
                  key={z.id}
                  className={`zona ${attiva ? 'sel' : ''}`}
                  onClick={() => scegli(z)}
                  role="button"
                  aria-label={z.nome}
                >
                  {z.forma.tipo === 'rect' ? (
                    <rect
                      className="zona-shape"
                      x={z.forma.x} y={z.forma.y} width={z.forma.w} height={z.forma.h}
                      rx={z.forma.rx ?? 6}
                      fill={c.fill} stroke={c.stroke} strokeWidth={2.2}
                    />
                  ) : (
                    <path
                      className="zona-shape"
                      d={z.forma.d} fill="none"
                      stroke={c.fill} strokeWidth={z.forma.spessore}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  )}
                  <Etichetta et={z.et} colore={z.id === 'entrata' ? 'var(--mappa-testo)' : '#1F2937'} />
                </g>
              );
            })}

            {/* dettagli decorativi dentro il frigo (banchi) */}
            <g className="banchi">
              <rect x={446} y={188} width={22} height={80} rx={11} />
              <rect x={446} y={276} width={22} height={62} rx={11} />
              <ellipse cx={457} cy={358} rx={11} ry={8} />
            </g>
          </svg>

        </div>

        {/* comandi zoom: fuori dalla mappa, così non coprono nessuna zona */}
        <div className="mappa-cmd">
          <button onClick={() => { const r = rettangolo(); zoomVerso(1 / 1.4, r.width / 2, r.height / 2); }} aria-label="Rimpicciolisci">−</button>
          <button onClick={() => { const r = rettangolo(); zoomVerso(1.4, r.width / 2, r.height / 2); }} aria-label="Ingrandisci">+</button>
          <button onClick={adatta} className="fit">⤢ Vedi tutto</button>
        </div>

        {/* barra della zona selezionata */}
        <div className={`mappa-sel ${sel ? 'on' : ''}`}>
          {sel ? (
            <>
              <span className="pallino" style={{ background: COLORI[sel.cat].stroke }} />
              <b>{sel.nome}</b>
              <span className="dopo">i prodotti arriveranno presto</span>
            </>
          ) : (
            <span className="dopo">Tocca una zona della mappa per vederne il nome</span>
          )}
        </div>
      </div>

      <p className="note" style={{ marginTop: 10 }}>
        Pizzica con due dita per ingrandire, trascina per spostarti. Il tasto <b>⤢</b> rimette
        la mappa intera.
      </p>

      <div className="section-label">Tutte le zone</div>
      <div className="zone-griglia">
        {ZONE.map((z) => (
          <button
            key={z.id}
            className={`zona-chip ${sel?.id === z.id ? 'on' : ''}`}
            style={{ borderColor: COLORI[z.cat].stroke }}
            onClick={() => { trascinato.current = false; scegli(z, true); }}
          >
            <span className="pallino" style={{ background: COLORI[z.cat].stroke }} />
            {z.nome}
          </button>
        ))}
      </div>
    </>
  );
}
