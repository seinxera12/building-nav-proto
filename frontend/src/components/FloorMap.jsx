// components/FloorMap.jsx — Leaflet map with CRS.Simple for indoor navigation
import { useEffect, useRef, useMemo } from 'react';
import {
  MapContainer,
  ImageOverlay,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import useNavStore from '../store/useNavStore';

/* ── Coordinate helpers ──────────────────────────────────────────
   The floor plan image uses pixel coords where Y increases downward.
   Leaflet CRS.Simple has Y increasing upward.
   We map: Leaflet [lat, lng] = [maxY - pixelY, pixelX]
   Image bounds: [[0, 0], [maxY, maxX]]                          */
function toLatLng(node, maxY) {
  return [maxY - node.y, node.x];
}

/* ── Node colour by type ─────────────────────────────────────── */
const NODE_COLORS = {
  entrance:   '#3b82f6', // blue
  junction:   '#6b7280', // gray
  elevator:   '#f59e0b', // amber
  stairs:     '#f97316', // orange
  poi:        '#10b981', // emerald
  qr_anchor:  '#8b5cf6', // violet
};

const NODE_RADIUS = {
  entrance: 8,
  junction: 4,
  elevator: 7,
  stairs:   7,
  poi:      7,
  qr_anchor: 6,
};

/* ── Sub-component: auto-fit bounds on load ──────────────────── */
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], animate: false });
    }
  }, [map, bounds]);
  return null;
}

/* ── Pulsing current-location marker ─────────────────────────── */
function CurrentLocationMarker({ position }) {
  if (!position) return null;
  return (
    <>
      <CircleMarker
        center={position}
        radius={14}
        pathOptions={{
          fillColor: '#6366f1',
          fillOpacity: 0.2,
          color: '#6366f1',
          weight: 2,
          opacity: 0.5,
          className: 'pulse-marker',
        }}
      />
      <CircleMarker
        center={position}
        radius={7}
        pathOptions={{
          fillColor: '#6366f1',
          fillOpacity: 1,
          color: '#ffffff',
          weight: 2,
        }}
      />
    </>
  );
}

/* ── Destination marker ──────────────────────────────────────── */
function DestinationMarker({ position, label }) {
  if (!position) return null;
  return (
    <CircleMarker
      center={position}
      radius={10}
      pathOptions={{
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 3,
      }}
    >
      <Tooltip direction="top" offset={[0, -12]} permanent className="dest-tooltip">
        {label || 'Destination'}
      </Tooltip>
    </CircleMarker>
  );
}

/* ── Main FloorMap component ─────────────────────────────────── */
export default function FloorMap() {
  const floor  = useNavStore(s => s.floor);
  const route  = useNavStore(s => s.route);
  const currentNode  = useNavStore(s => s.currentNode);
  const destinationNode = useNavStore(s => s.destinationNode);
  const currentStep = useNavStore(s => s.currentStep);

  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  if (!floor) return null;

  const { bounds: b, imageUrl, nodes } = floor;
  const maxY = b.maxY;
  const maxX = b.maxX;

  // Leaflet bounds for the image: [[south, west], [north, east]]
  const imageBounds = [[0, 0], [maxY, maxX]];

  // Build route polyline positions
  const routePositions = useMemo(() => {
    if (!route?.path) return [];
    return route.path.map(nodeId => {
      const n = nodes.find(nd => nd.id === nodeId);
      return n ? toLatLng(n, maxY) : null;
    }).filter(Boolean);
  }, [route, nodes, maxY]);

  // Highlight the active segment
  const activeSegment = useMemo(() => {
    if (!route?.path || route.path.length < 2) return [];
    const inst = route.instructions[currentStep];
    if (!inst) return [];
    const idx = route.path.indexOf(inst.nodeId);
    if (idx < 0 || idx >= route.path.length - 1) return [];
    const a = nodes.find(n => n.id === route.path[idx]);
    const bNode = nodes.find(n => n.id === route.path[idx + 1]);
    if (!a || !bNode) return [];
    return [toLatLng(a, maxY), toLatLng(bNode, maxY)];
  }, [route, currentStep, nodes, maxY]);

  const currentPos = currentNode ? toLatLng(currentNode, maxY) : null;
  const destPos = destinationNode ? toLatLng(destinationNode, maxY) : null;

  return (
    <MapContainer
      crs={L.CRS.Simple}
      minZoom={-2}
      maxZoom={3}
      zoomSnap={0.25}
      zoomDelta={0.5}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      dragging={true}
      attributionControl={false}
      className="floor-map-container"
      style={{ height: '100%', width: '100%', background: '#0c0e14' }}
    >
      <FitBounds bounds={imageBounds} />

      {/* Layer 1: Floor plan image */}
      <ImageOverlay url={imageUrl} bounds={imageBounds} opacity={0.95} />

      {/* Layer 2: Route polyline */}
      {routePositions.length > 1 && (
        <Polyline
          positions={routePositions}
          pathOptions={{
            color: '#6366f1',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 8',
            lineCap: 'round',
          }}
        />
      )}

      {/* Layer 2b: Active segment highlight */}
      {activeSegment.length === 2 && (
        <Polyline
          positions={activeSegment}
          pathOptions={{
            color: '#22d3ee',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
          }}
        />
      )}

      {/* Layer 3: Node markers */}
      {nodes.map(node => {
        const pos = toLatLng(node, maxY);
        const color = NODE_COLORS[node.type] || '#6b7280';
        const radius = NODE_RADIUS[node.type] || 5;
        return (
          <CircleMarker
            key={node.id}
            center={pos}
            radius={radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.85,
              color: '#ffffff',
              weight: 1.5,
            }}
          >
            {isDebug && (
              <Tooltip direction="right" offset={[8, 0]} permanent className="debug-tooltip">
                {node.id}: {node.label}
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}

      {/* Layer 4: Current location pulsing marker */}
      <CurrentLocationMarker position={currentPos} />

      {/* Layer 5: Destination marker */}
      <DestinationMarker position={destPos} label={destinationNode?.label} />
    </MapContainer>
  );
}
