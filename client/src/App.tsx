import { Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components';
import Home from './pages/Home';
import ListaDettaglio from './pages/ListaDettaglio';
import Storico from './pages/Storico';
import Promemoria from './pages/Promemoria';
import Bacheca from './pages/Bacheca';

const TAB_ROUTES = ['/', '/promemoria', '/bacheca'];

export default function App() {
  const { pathname } = useLocation();
  const showNav = TAB_ROUTES.includes(pathname);
  return (
    <>
      <div className={showNav ? 'page' : 'page no-nav'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lista/:id" element={<ListaDettaglio />} />
          <Route path="/storico" element={<Storico />} />
          <Route path="/promemoria" element={<Promemoria />} />
          <Route path="/bacheca" element={<Bacheca />} />
        </Routes>
      </div>
      {showNav && <BottomNav />}
    </>
  );
}
