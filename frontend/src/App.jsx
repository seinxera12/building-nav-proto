// App.jsx — main application shell for indoor navigation
import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import './index.css';

import useNavStore from './store/useNavStore';
import FloorMap from './components/FloorMap';
import FloorSelector from './components/FloorSelector';
import LocationBar from './components/LocationBar';
import SearchBar from './components/SearchBar';
import InstructionPanel from './components/InstructionPanel';
import QRScanner from './components/QRScanner';
import ArrivedScreen from './components/ArrivedScreen';
import SimulationPanel from './components/SimulationPanel';
import EntryPrompt from './components/EntryPrompt';
import OfflineBanner from './components/OfflineBanner';
import ChatbotPanel from './components/ChatbotPanel';
import NavTTSPlayer from './components/NavTTSPlayer';
import { useSimKeyboard } from './hooks/useSimKeyboard';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useOfflineSeeding } from './hooks/useOfflineSeeding';
import { getCachedQrCheckpoints } from './api/index.js';

function extractInitialLocation() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const loc = url.searchParams.get('loc');
  if (!loc) return null;

  url.searchParams.delete('loc');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return loc;
}

function buildLocationOptions(floor) {
  const nodesById = new Map((floor?.nodes || []).map(node => [node.id, node]));
  const optionsByNodeId = new Map();

  for (const poi of floor?.pois || []) {
    const node = nodesById.get(poi.node_id);
    optionsByNodeId.set(poi.node_id, {
      id: `poi-${poi.id}`,
      nodeId: poi.node_id,
      label: poi.name,
      type: poi.category || node?.type || 'poi',
      detail: node?.label,
    });
  }

  const fromFloorQr = (floor?.qrCodes || []).map(item => ({
    id: `qr-${item.qr_code}`,
    qrCode: item.qr_code,
    nodeId: item.node_id,
    label: item.label,
    type: nodesById.get(item.node_id)?.type,
  }));

  for (const item of [...fromFloorQr, ...getCachedQrCheckpoints()]) {
    if (!item.nodeId || optionsByNodeId.has(item.nodeId)) continue;
    optionsByNodeId.set(item.nodeId, {
      id: `qr-${item.qrCode}`,
      nodeId: item.nodeId,
      label: item.label || item.qrCode,
      type: item.type || 'checkpoint',
      detail: item.qrCode,
    });
  }

  return [...optionsByNodeId.values()].filter(item => item.nodeId && item.label);
}

export default function App() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [initialEntryDismissed, setInitialEntryDismissed] = useState(false);
  const [initialLoc] = useState(() => extractInitialLocation());
  const initialLocAppliedRef = useRef(false);
  const isDemoMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('demo');

  const loadFloor         = useNavStore(s => s.loadFloor);
  const loadFloors        = useNavStore(s => s.loadFloors);
  const floor             = useNavStore(s => s.floor);
  const floorLoading      = useNavStore(s => s.floorLoading);
  const floorError        = useNavStore(s => s.floorError);
  const status            = useNavStore(s => s.status);
  const currentNodeId     = useNavStore(s => s.currentNodeId);
  const error             = useNavStore(s => s.error);
  const scanErrorRecovery = useNavStore(s => s.scanErrorRecovery); // 10.2
  const setError          = useNavStore(s => s.setError);
  const setScanErrorRecovery = useNavStore(s => s.setScanErrorRecovery); // 10.2
  const handleScan        = useNavStore(s => s.handleScan);
  const anchorNode        = useNavStore(s => s.anchorNode);
  const toggleChat        = useNavStore(s => s.toggleChat);
  const chatbotOpen       = useNavStore(s => s.chatbot.isOpen);

  const canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED');
  const locationOptions = buildLocationOptions(floor);
  const initialEntryOpen = !initialLoc && !initialEntryDismissed && status === 'UNLOCATED';
  const entryPromptOpen = updatePromptOpen || (!floorLoading && !floorError && initialEntryOpen);
  const entryMode = updatePromptOpen ? 'update' : 'entry';

  useSimKeyboard(isDemoMode);
  useNetworkStatus();
  useOfflineSeeding(floor);

  useEffect(() => {
    // Load all floors for building 1; loadFloors() loads floor 1 as the active floor
    loadFloors(1).then(floors => {
      if (!floors || floors.length === 0) {
        console.warn('No floors in database - app will work but will be empty');
      }
    });
  }, [loadFloors]);

  // Apply URL-param location after floor loads — pass 'url_param' as entry method
  useEffect(() => {
    if (floorLoading || floorError || !floor || initialLocAppliedRef.current) return;

    initialLocAppliedRef.current = true;
    if (initialLoc) {
      handleScan(initialLoc, 'url_param'); // 1.3 — url_param entry method
      return;
    }
  }, [floor, floorError, floorLoading, handleScan, initialLoc]);

  // Show error toast; if QR scan failed also open location picker as recovery (10.2)
  useEffect(() => {
    if (!error) return;
    toast.error(error);
    if (scanErrorRecovery) {
      setUpdatePromptOpen(true);
      setScanErrorRecovery(false);
    }
    setError(null);
  }, [error, scanErrorRecovery, setError, setScanErrorRecovery]);

  const onScanSuccess = async (qrCode) => {
    setScannerOpen(false);
    setUpdatePromptOpen(false);
    setInitialEntryDismissed(true);
    await handleScan(qrCode);
  };

  const onScanError = (message) => {
    toast.error(message);
  };

  const onManualSelect = async (option) => {
    setUpdatePromptOpen(false);
    setInitialEntryDismissed(true);
    await anchorNode(option.nodeId);
  };

  return (
    <div className="app" id="app">
      <Toaster position="top-center" />

      {/* Non-rendering TTS playback manager */}
      <NavTTSPlayer />

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
        <LocationBar onUpdateLocation={() => setUpdatePromptOpen(true)} />
      </header>
      <OfflineBanner />

      {/* ── Map area ─────────────────────────────────── */}
      <main className="app-main" id="app-main">

        {/* 5.1 — shimmer skeleton while floor data loads */}
        {floorLoading && <div className="map-skeleton" aria-hidden="true" />}

        {floorError && (
          <div className="app-error">
            <p>⚠️ {floorError}</p>
            <button className="btn btn--primary" onClick={() => loadFloors(1)}>
              Retry
            </button>
          </div>
        )}

        {!floorLoading && !floorError && <FloorMap />}
        {!floorLoading && !floorError && <FloorSelector />}

        {!floorLoading && !floorError && entryPromptOpen && (
          <EntryPrompt
            mode={entryMode}
            locations={locationOptions}
            currentNodeId={currentNodeId}
            onScan={() => setScannerOpen(true)}
            onSelect={onManualSelect}
            onClose={() => setUpdatePromptOpen(false)}
          />
        )}

        <ArrivedScreen />

        {isDemoMode && <SimulationPanel />}

        {/* 8.3 / 9.3 — rerouting overlay with accessibility attributes */}
        {status === 'REROUTING' && (
          <div
            className="rerouting-overlay"
            role="status"
            aria-live="polite"
          >
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

        {/* Floating chatbot FAB — bottom-right */}
        {!chatbotOpen && (
          <button
            type="button"
            className="chatbot-fab"
            onClick={() => toggleChat(true)}
            aria-label="Open navigation assistant"
          >
            🎙️
          </button>
        )}
      </main>

      {/* ── Bottom instruction panel ─────────────────── */}
      <InstructionPanel />

      {/* ── Chatbot sliding panel ────────────────────── */}
      <ChatbotPanel />
    </div>
  );
}
