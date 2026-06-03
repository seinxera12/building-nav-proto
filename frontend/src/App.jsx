// App.jsx — main application shell for indoor navigation
import { useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import './index.css';

import useNavStore from './store/useNavStore';
import FloorMap from './components/FloorMap';
import LocationBar from './components/LocationBar';
import SearchBar from './components/SearchBar';
import InstructionPanel from './components/InstructionPanel';
import QRScanner from './components/QRScanner';
import ArrivedScreen from './components/ArrivedScreen';
import SimulationPanel from './components/SimulationPanel';
import { useSimKeyboard } from './hooks/useSimKeyboard';

export default function App() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const isDemoMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('demo');
  const loadFloor    = useNavStore(s => s.loadFloor);
  const floorLoading = useNavStore(s => s.floorLoading);
  const floorError   = useNavStore(s => s.floorError);
  const status       = useNavStore(s => s.status);
  const error        = useNavStore(s => s.error);
  const setError     = useNavStore(s => s.setError);
  const handleScan   = useNavStore(s => s.handleScan);
  const canScan = status === 'UNLOCATED' || status === 'ANCHORED';

  useSimKeyboard(isDemoMode);

  useEffect(() => {
    loadFloor(1);
  }, [loadFloor]);

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    setError(null);
  }, [error, setError]);

  const onScanSuccess = async (qrCode) => {
    setScannerOpen(false);
    await handleScan(qrCode);
  };

  const onScanError = (message) => {
    toast.error(message);
  };

  return (
    <div className="app" id="app">
      <Toaster position="top-center" />

      {scannerOpen && (
        <QRScanner
          onScan={onScanSuccess}
          onClose={() => setScannerOpen(false)}
          onError={onScanError}
        />
      )}

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

        <ArrivedScreen />

        {isDemoMode && <SimulationPanel />}

        {status === 'REROUTING' && (
          <div className="rerouting-overlay">
            <div className="rerouting-overlay__spinner" />
            <span>Recalculating...</span>
          </div>
        )}

        {!floorLoading && !floorError && canScan && (
          <button
            type="button"
            className="scan-button"
            onClick={() => setScannerOpen(true)}
          >
            <span aria-hidden="true">📷</span>
            {status === 'UNLOCATED' ? 'Scan to Locate' : 'Update Anchor'}
          </button>
        )}

        {/* Floating search bar */}
        <SearchBar />
      </main>

      {/* ── Bottom instruction panel ─────────────────── */}
      <InstructionPanel />
    </div>
  );
}
