// App.jsx — main application shell for indoor navigation
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import './index.css';

import useNavStore from './store/useNavStore';
import FloorMap from './components/FloorMap';
import LocationBar from './components/LocationBar';
import SearchBar from './components/SearchBar';
import InstructionPanel from './components/InstructionPanel';

export default function App() {
  const loadFloor    = useNavStore(s => s.loadFloor);
  const floorLoading = useNavStore(s => s.floorLoading);
  const floorError   = useNavStore(s => s.floorError);
  const route        = useNavStore(s => s.route);

  useEffect(() => {
    loadFloor(1);
  }, [loadFloor]);

  return (
    <div className="app" id="app">
      {/* ── Header ───────────────────────────────────── */}
      <header className="app-header" id="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">🧭</span>
          <h1 className="app-header__title">QR Nav</h1>
        </div>
        <LocationBar />
      </header>

      {/* ── Map area ─────────────────────────────────── */}
      <main className="app-main" id="app-main">
        {floorLoading && (
          <div className="app-loading">
            <div className="app-loading__spinner" />
            <p>Loading floor plan…</p>
          </div>
        )}

        {floorError && (
          <div className="app-error">
            <p>⚠️ {floorError}</p>
            <button className="btn btn--primary" onClick={() => loadFloor(1)}>
              Retry
            </button>
          </div>
        )}

        {!floorLoading && !floorError && <FloorMap />}

        {/* Floating search bar */}
        <SearchBar />
      </main>

      {/* ── Bottom instruction panel ─────────────────── */}
      <InstructionPanel />
    </div>
  );
}
