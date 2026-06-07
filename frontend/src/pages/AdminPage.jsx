// pages/AdminPage.jsx — Analytics admin dashboard (accessible at /admin)
import { useEffect, useState, useMemo } from 'react';
import {
  MapContainer,
  ImageOverlay,
  CircleMarker,
  Tooltip,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../index.css';
import { fetchFloor } from '../api/index.js';

async function fetchHeatmap() {
  const res = await fetch('/analytics/heatmap');
  if (!res.ok) throw new Error(`Heatmap fetch failed: ${res.status}`);
  return res.json();
}

async function fetchSummary() {
  const res = await fetch('/analytics/summary');
  if (!res.ok) throw new Error(`Summary fetch failed: ${res.status}`);
  return res.json();
}

function StatCard({ label, value }) {
  return (
    <div className="admin-stat-card">
      <span className="admin-stat-card__label">{label}</span>
      <span className="admin-stat-card__value">{value ?? '—'}</span>
    </div>
  );
}

export default function AdminPage() {
  const [floor, setFloor] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [floorData, heatmapData, summaryData] = await Promise.all([
        fetchFloor(1),
        fetchHeatmap(),
        fetchSummary(),
      ]);
      setFloor(floorData);
      setHeatmap(heatmapData);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const maxCount = useMemo(
    () => Math.max(1, ...heatmap.map(h => h.scan_count)),
    [heatmap],
  );

  const bounds = floor?.bounds;
  const maxY = bounds?.maxY ?? 0;
  const maxX = bounds?.maxX ?? 0;
  const imageBounds = [[0, 0], [maxY, maxX]];

  const completionPct = summary
    ? `${Math.round(summary.completion_rate * 100)}%`
    : '—';

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header__title">
          <span aria-hidden="true">📊</span>
          <h1>QR Nav — Analytics</h1>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={loadData}
          disabled={loading}
          aria-label="Refresh analytics data"
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </header>

      {error && (
        <div className="admin-error" role="alert">
          ⚠️ {error}
        </div>
      )}

      <div className="admin-stats" aria-label="Summary statistics">
        <StatCard label="Total Sessions"   value={summary?.total_sessions} />
        <StatCard label="Total Routes"     value={summary?.total_routes} />
        <StatCard label="Completion Rate"  value={completionPct} />
        <StatCard label="Most Visited"     value={summary?.top_destination ?? 'None yet'} />
      </div>

      <div className="admin-map-wrap">
        {loading && !floor && (
          <div className="admin-map-loading" aria-label="Loading map">
            Loading map…
          </div>
        )}

        {floor && (
          <MapContainer
            crs={L.CRS.Simple}
            minZoom={-3}
            maxZoom={3}
            zoomSnap={0.25}
            scrollWheelZoom
            maxBounds={imageBounds}
            maxBoundsViscosity={1}
            attributionControl={false}
            aria-label="Heatmap — QR scan frequency"
            style={{ height: '100%', width: '100%', background: '#0c0e14' }}
          >
            <ImageOverlay
              url={floor.imageUrl}
              bounds={imageBounds}
              opacity={0.9}
            />

            {heatmap.map(entry => {
              const ratio = entry.scan_count / maxCount;
              const radius = 12 + ratio * 28;          // 12 – 40
              const fillOpacity = 0.3 + ratio * 0.5;   // 0.3 – 0.8
              // Leaflet CRS.Simple: lat = maxY - pixelY, lng = pixelX
              const position = [maxY - entry.y, entry.x];
              return (
                <CircleMarker
                  key={entry.node_id}
                  center={position}
                  radius={radius}
                  pathOptions={{
                    fillColor: '#f59e0b',
                    fillOpacity,
                    color: '#f59e0b',
                    weight: 1,
                    opacity: 0.6,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -radius]}>
                    {entry.label}: {entry.scan_count} scan{entry.scan_count !== 1 ? 's' : ''}
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
