// components/FloorMap.jsx — Leaflet map with CRS.Simple for indoor navigation
import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  ImageOverlay,
  CircleMarker,
  Marker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import useNavStore from '../store/useNavStore';
import { useSimStore } from '../store/useSimStore';

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

const QR_ICON = L.divIcon({
  html: '<div class="qr-demo-marker">📷</div>',
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

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
  const animatedPosition = useNavStore(s => s.animatedPosition);
  const destinationNode = useNavStore(s => s.destinationNode);
  const currentStep = useNavStore(s => s.currentStep);
  const pendingArrival = useNavStore(s => s.pendingArrival);
  const handleScan = useNavStore(s => s.handleScan);
  const simActive = useSimStore(s => s.isRunning || s.autoPlay || s.isExecuting);
  const prevNodeIdRef = useRef(null);
  const motionFrameRef = useRef(null);

  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const isDemoMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('demo');

  const { bounds: b = { maxY: 0, maxX: 0 }, imageUrl, nodes = [] } = floor || {};
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
  const ghostPos = animatedPosition ? toLatLng(animatedPosition, maxY) : null;
  const destPos = destinationNode ? toLatLng(destinationNode, maxY) : null;
  const qrCodes = floor?.qrCodes || [];
  const qrNodeIds = new Set(qrCodes.map(q => q.node_id));

  useEffect(() => {
    const currentNodeId = currentNode?.id ?? null;
    if (!floor || !currentNodeId) {
      prevNodeIdRef.current = currentNodeId;
      return undefined;
    }

    if (simActive) {
      prevNodeIdRef.current = currentNodeId;
      return undefined;
    }

    const previousNodeId = prevNodeIdRef.current;
    prevNodeIdRef.current = currentNodeId;

    if (!previousNodeId || previousNodeId === currentNodeId) {
      return undefined;
    }

    const routePath = route?.path || [];
    const startIndex = routePath.indexOf(previousNodeId);
    const endIndex = routePath.indexOf(currentNodeId);
    const sliceIds = startIndex >= 0 && endIndex >= 0
      ? (startIndex <= endIndex
        ? routePath.slice(startIndex, endIndex + 1)
        : routePath.slice(endIndex, startIndex + 1).reverse())
      : [previousNodeId, currentNodeId];

    const pathNodes = sliceIds
      .map(nodeId => nodes.find(node => node.id === nodeId))
      .filter(Boolean);

    if (pathNodes.length < 2) {
      if (pendingArrival) {
        useNavStore.getState().completePendingArrival();
      }
      return undefined;
    }

    if (motionFrameRef.current) {
      cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }

    const durationMs = Math.min(900, Math.max(450, pathNodes.length * 180));
    const cumulative = [0];
    for (let i = 1; i < pathNodes.length; i += 1) {
      const prev = pathNodes[i - 1];
      const curr = pathNodes[i];
      cumulative.push(cumulative[i - 1] + Math.hypot(curr.x - prev.x, curr.y - prev.y));
    }
    const totalDistance = cumulative[cumulative.length - 1];
    if (totalDistance <= 0) {
      return undefined;
    }

    let startTime = null;
    const easeInOut = t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const frame = timestamp => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = easeInOut(t);
      const targetDistance = eased * totalDistance;

      let segmentIndex = pathNodes.length - 2;
      for (let i = 1; i < cumulative.length; i += 1) {
        if (cumulative[i] >= targetDistance) {
          segmentIndex = i - 1;
          break;
        }
      }

      const segmentStart = cumulative[segmentIndex];
      const segmentEnd = cumulative[segmentIndex + 1] ?? segmentStart;
      const segmentLength = segmentEnd - segmentStart;
      const segmentT = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0;

      const startNode = pathNodes[segmentIndex];
      const endNode = pathNodes[Math.min(segmentIndex + 1, pathNodes.length - 1)];
      useNavStore.setState({
        animatedPosition: {
          x: startNode.x + (endNode.x - startNode.x) * segmentT,
          y: startNode.y + (endNode.y - startNode.y) * segmentT,
        },
      });

      if (t < 1) {
        motionFrameRef.current = requestAnimationFrame(frame);
        return;
      }

      motionFrameRef.current = null;
      useNavStore.setState({ animatedPosition: null });
      if (useNavStore.getState().pendingArrival) {
        useNavStore.getState().completePendingArrival();
      }
    };

    motionFrameRef.current = requestAnimationFrame(frame);

    return () => {
      if (motionFrameRef.current) {
        cancelAnimationFrame(motionFrameRef.current);
        motionFrameRef.current = null;
      }
    };
  }, [currentNode?.id, floor, nodes, route, simActive, pendingArrival]);

  if (!floor) return null;

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

      {/* Layer 5: Animated movement marker */}
      {ghostPos && (
        <CircleMarker
          center={ghostPos}
          radius={9}
          pathOptions={{
            fillColor: '#bfdbfe',
            fillOpacity: 0.88,
            color: '#1d4ed8',
            weight: 2,
            opacity: 0.9,
          }}
        />
      )}

      {/* Layer 6: Destination marker */}
      <DestinationMarker position={destPos} label={destinationNode?.label} />

      {/* Layer 7: Demo-mode tappable QR checkpoints */}
      {isDemoMode && nodes
        .filter(node => qrNodeIds.has(node.id))
        .map(node => {
          const qrEntry = qrCodes.find(q => q.node_id === node.id);
          return (
            <Marker
              key={`qr-${node.id}`}
              position={toLatLng(node, maxY)}
              icon={QR_ICON}
              eventHandlers={{
                click: () => qrEntry && handleScan(qrEntry.qr_code),
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} className="debug-tooltip">
                {qrEntry?.label || node.label}
              </Tooltip>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
