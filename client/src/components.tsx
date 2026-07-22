import { ReactNode, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useBackButton } from './telegram';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round">{path}</svg>
);

export const Icons = {
  cart: icon(<><circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" /><path d="M2 3h2.2l2.3 12.4a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.3L21 7H5.3" /></>),
  bell: icon(<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></>),
  board: icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10" /><path d="M7 13h6" /></>),
};

export function PageHeader({ title, back }: { title: string; back?: boolean }) {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate(-1), [navigate]);
  useBackButton(goBack, !!back);
  return (
    <div className="page-header">
      {back && (
        <button className="back-btn" onClick={goBack} aria-label="Torna indietro">
          <span className="back-btn-arrow">‹</span> Indietro
        </button>
      )}
      <h1>{title}</h1>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner-wrap"><div className="spinner" /></div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="error-box">{error}</div>;
}

export function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="empty">
      <span className="emoji">{emoji}</span>
      {text}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export function BottomNav() {
  const tabs = [
    { to: '/', label: 'Spesa', icon: Icons.cart },
    { to: '/promemoria', label: 'Promemoria', icon: Icons.bell },
    { to: '/bacheca', label: 'Bacheca', icon: Icons.board },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'}
          className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.icon}
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
