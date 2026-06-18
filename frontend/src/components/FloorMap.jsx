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
import { saveFloorViewport, getFloorViewport } from '../api/index.js';

/* ── Coordinate helpers ──────────────────────────────────────────
   The floor plan image uses pixel coords where Y increases downward.
   Leaflet CRS.Simple has Y increasing upward.
   We map: Leaflet [lat, lng] = [maxY - pixelY, pixelX]
   Image bounds: [[0, 0], [maxY, maxX]]                          */
function toLatLng(node, maxY) {
  return [maxY - node.y, node.x];
}

/* ── Compute the best initial zoom so the image fills the container
   on first render, avoiding the "tiny map on large screen" problem.
   Uses the same math Leaflet's fitBounds uses internally.          */
function computeFitZoom(mapWidthPx, mapHeightPx, imgWidth, imgHeight, padPx = 40) {
  if (!mapWidthPx || !mapHeightPx || !imgWidth || !imgHeight) return -1;
  const availW = mapWidthPx  - padPx * 2;
  const availH = mapHeightPx - padPx * 2;
  const zoomX = Math.log2(availW / imgWidth);
  const zoomY = Math.log2(availH / imgHeight);
  // snap to Leaflet's 0.25 zoomSnap grid, floor so image never overflows
  return Math.floor(Math.min(zoomX, zoomY) * 4) / 4;
}

/* ── Node colour by type ─────────────────────────────────────── */
const NODE_COLORS = {
  entrance:  '#3b82f6',
  junction:  '#6b7280',
  elevator:  '#f59e0b',
  stairs:    '#f97316',
  poi:       '#10b981',
  qr_anchor: '#8b5cf6',
};

/* Marker sizes — junctions are invisible dots (no visual clutter) */
const NODE_RADIUS = {
  entrance:  9,
  junction:  0,   // hidden — graph topology only, not user-facing
  elevator:  9,
  stairs:    9,
  poi:       9,
  qr_anchor: 7,
};

const QR_ICON = L.divIcon({
  html: '<div class="qr-demo-marker">📷</div>',
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/* ── FloorViewportPersistence — saves/restores viewport per floor.
   On first visit to a floor (no saved viewport), lets FitBounds handle
   centering. On subsequent visits, restores the saved position.          */
function FloorViewportPersistence({ floorId, onHasSaved }) {
  const map = useMap();
  const lastFloorIdRef = useRef(null);

  useEffect(() => {
    if (!floorId) return;
    if (floorId === lastFloorIdRef.current) return;

    // Save the previous floor's viewport before switching
    if (lastFloorIdRef.current !== null) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      saveFloorViewport(lastFloorIdRef.current, { center: [center.lat, center.lng], zoom });
    }

    const saved = getFloorViewport(floorId);
    if (saved?.center && saved.zoom !== undefined) {
      // Slight delay so FitBounds runs first (sets minZoom), then we restore position
      setTimeout(() => {
        map.setView(saved.center, Math.max(saved.zoom, map.getMinZoom()), { animate: false });
      }, 50);
      onHasSaved(true);
    } else {
      onHasSaved(false);
    }

    lastFloorIdRef.current = floorId;
  }, [floorId, map, onHasSaved]);

  // Debounced viewport save on user pan/zoom
  useEffect(() => {
    if (!floorId) return;
    let saveTimer = null;

    const handleChange = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        saveFloorViewport(floorId, { center: [center.lat, center.lng], zoom });
      }, 400);
    };

    map.on('moveend', handleChange);
    map.on('zoomend', handleChange);
    return () => {
      clearTimeout(saveTimer);
      map.off('moveend', handleChange);
      map.off('zoomend', handleChange);
    };
  }, [floorId, map]);

  return null;
}

/* ── FitBounds — fires ONLY on mount and on imageBounds key change (floor switch).
   Does NOT snap back the user's viewport on status changes.                     */
function FitBounds({ bounds, imgWidth, imgHeight, skipIfSaved, floorId }) {
  const map = useMap();
  const lastBoundsKeyRef = useRef('');

  useEffect(() => {
    if (!bounds) return;

    const boundsKey = JSON.stringify(bounds);
    if (lastBoundsKeyRef.current === boundsKey) return;
    lastBoundsKeyRef.current = boundsKey;

    const container = map.getContainer();
    const w = container.clientWidth  || 400;
    const h = container.clientHeight || 400;
    const fitZoom = computeFitZoom(w, h, imgWidth, imgHeight, 40);

    map.setMinZoom(fitZoom);

    // If we have a saved viewport for this floor, let FloorViewportPersistence restore it.
    // Only auto-fit when there's no saved state (first ever visit to this floor).
    if (skipIfSaved) return;

    const [[south, west], [north, east]] = bounds;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    map.setView([centerLat, centerLng], fitZoom, { animate: false });
  }, [map, bounds, imgWidth, imgHeight, skipIfSaved]);

  return null;
}

/* ── InvalidateSizeOnStatusChange ──────────────────────────────
   Calls map.invalidateSize() after the instruction panel slides in/out.
   ONLY updates minZoom — does NOT forcibly re-centre the map.
   This prevents the "snapped back while panning" bug.             */
function InvalidateSizeOnStatusChange({ imgWidth, imgHeight }) {
  const map = useMap();
  const status = useNavStore(s => s.status);

  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize({ animate: false });

      // Recompute minZoom for the resized container, but do NOT re-centre.
      const container = map.getContainer();
      const w = container.clientWidth  || 400;
      const h = container.clientHeight || 400;
      const fitZoom = computeFitZoom(w, h, imgWidth, imgHeight, 40);
      if (fitZoom > -10) {
        map.setMinZoom(fitZoom);
        // Only snap back if the user has zoomed out past the minimum — not otherwise.
        if (map.getZoom() < fitZoom) {
          map.setZoom(fitZoom, { animate: false });
        }
      }
    }, 200);
    return () => clearTimeout(id);
  }, [map, status, imgWidth, imgHeight]);

  return null;
}

function ViewportResetControl({ bounds, imgWidth, imgHeight }) {
  const map = useMap();
  if (!bounds) return null;

  const handleRecenter = () => {
    const container = map.getContainer();
    const w = container.clientWidth  || 400;
    const h = container.clientHeight || 400;
    const fitZoom = computeFitZoom(w, h, imgWidth, imgHeight, 40);
    const [[south, west], [north, east]] = bounds;
    map.setView([(south + north) / 2, (west + east) / 2], fitZoom, { animate: true });
  };

  return (
    <div className="floor-map__controls">
      <button
        type="button"
        className="btn btn--ghost floor-map__control"
        onClick={handleRecenter}
      >
        ⊙ Fit
      </button>
    </div>
  );
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
  const floor             = useNavStore(s => s.floor);
  const currentFloorId    = useNavStore(s => s.currentFloorId);
  const floorsById        = useNavStore(s => s.floorsById);
  const route             = useNavStore(s => s.route);
  const previousRoute     = useNavStore(s => s.previousRoute);
  const currentNode       = useNavStore(s => s.currentNode);
  const animatedPosition  = useNavStore(s => s.animatedPosition);
  const destinationNode   = useNavStore(s => s.destinationNode);
  const currentStep       = useNavStore(s => s.currentStep);
  const pendingArrival    = useNavStore(s => s.pendingArrival);
  const handleScan        = useNavStore(s => s.handleScan);
  const status            = useNavStore(s => s.status);
  const selectDestination = useNavStore(s => s.selectDestination);
  const isSelectingLocation  = useNavStore(s => s.isSelectingLocation);
  const updateLocation    = useNavStore(s => s.updateLocation);
  const cancelLocationUpdate = useNavStore(s => s.cancelLocationUpdate);
  const simActive = useSimStore(s => s.isRunning || s.autoPlay || s.isExecuting);
  const prevNodeIdRef  = useRef(null);
  const motionFrameRef = useRef(null);

  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const isDemoMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('demo');

  const { bounds: b = { maxY: 0, maxX: 0 }, imageUrl, nodes = [], pois = [] } = floor || {};
  const maxY   = b.maxY;
  const maxX   = b.maxX;
  const imgW   = maxX;   // floor plan pixel width
  const imgH   = maxY;   // floor plan pixel height

  const nodeById     = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const poiByNodeId  = useMemo(() => new Map(pois.map(p => [p.node_id, p])), [pois]);
  const qrCodes      = useMemo(() => floor?.qrCodes || [], [floor]);
  const qrCodeByNodeId = useMemo(
    () => new Map(qrCodes.map(q => [q.node_id, q])),
    [qrCodes],
  );
  const qrNodeIds  = useMemo(() => new Set(qrCodes.map(q => q.node_id)), [qrCodes]);
  const poiNodeIds = useMemo(() => new Set(pois.map(p => p.node_id)), [pois]);

  // Leaflet CRS.Simple image bounds [[south, west], [north, east]]
  const imageBounds = useMemo(() => [[0, 0], [maxY, maxX]], [maxY, maxX]);

  // Give ample panning room beyond the image edges so users can reach all corners.
  // 20% of each dimension, clamped to a minimum of 120px, so small Floor 2 maps
  // also get enough breathing room.
  const paddedBounds = useMemo(() => {
    const padX = Math.max(120, Math.round(maxX * 0.2));
    const padY = Math.max(120, Math.round(maxY * 0.2));
    return [[-padY, -padX], [maxY + padY, maxX + padX]];
  }, [maxY, maxX]);

  // ── Route polyline split: walked (dimmed) vs remaining (bright) ──
  // Task 5.3.1: filter both segments to nodes on the current floor only.
  // Cross-floor nodes (elevators/stairs on another floor) are excluded so the
  // polyline never leaps off the visible map into invisible coordinate space.
  const { walkedPositions, remainingPositions } = useMemo(() => {
    if (!route?.path || route.path.length < 2) {
      return { walkedPositions: [], remainingPositions: [] };
    }

    // Build a floorId lookup across all loaded floors for nodes not on the active floor
    const allNodeById = new Map(nodes.map(n => [n.id, n]));
    for (const floorData of floorsById.values()) {
      if (floorData.floorId === currentFloorId) continue;
      for (const n of (floorData.nodes || [])) {
        if (!allNodeById.has(n.id)) allNodeById.set(n.id, n);
      }
    }

    // A node is renderable if it lives on the current floor.
    // We use the node's floor_id field if present; fall back to checking nodeById (active floor).
    const isOnCurrentFloor = (nodeId) => {
      const n = allNodeById.get(nodeId);
      if (!n) return false;
      if (n.floor_id !== undefined) return n.floor_id === currentFloorId;
      // If floor_id not on node object, it was loaded from the active floor
      return nodeById.has(nodeId);
    };

    // Build contiguous segments: only connect consecutive nodes BOTH on current floor
    const makeSegments = (ids) => {
      const segments = [];
      let current = [];
      for (const id of ids) {
        const n = nodeById.get(id) ?? allNodeById.get(id);
        if (n && isOnCurrentFloor(id)) {
          current.push(toLatLng(n, maxY));
        } else {
          if (current.length > 1) segments.push(current);
          current = [];
        }
      }
      if (current.length > 1) segments.push(current);
      return segments;
    };

    const inst = route.instructions?.[currentStep];
    const splitId = inst?.nodeId ?? route.path[0];
    const splitIdx = route.path.indexOf(splitId);
    const splitAt = splitIdx >= 0 ? splitIdx : 0;

    const walkedIds    = route.path.slice(0, splitAt + 1);
    const remainingIds = route.path.slice(splitAt);

    return {
      walkedPositions:    makeSegments(walkedIds).flat(),
      remainingPositions: makeSegments(remainingIds).flat(),
    };
  }, [route, currentStep, nodeById, floorsById, currentFloorId, maxY]);

  // faded ghost of the previous route shown during REROUTING
  const previousRoutePositions = useMemo(() => {
    if (status !== 'REROUTING' || !previousRoute?.path) return [];
    return previousRoute.path
      .map(id => { const n = nodeById.get(id); return n ? toLatLng(n, maxY) : null; })
      .filter(Boolean);
  }, [status, previousRoute, nodeById, maxY]);

  // Active segment highlight (current instruction leg) — current floor only
  const activeSegment = useMemo(() => {
    if (!route?.path || route.path.length < 2) return [];
    const inst = route.instructions?.[currentStep];
    if (!inst) return [];
    const idx = route.path.indexOf(inst.nodeId);
    if (idx < 0 || idx >= route.path.length - 1) return [];
    const a     = nodeById.get(route.path[idx]);
    const bNode = nodeById.get(route.path[idx + 1]);
    // Only draw if both nodes are on the current floor
    if (!a || !bNode) return [];
    return [toLatLng(a, maxY), toLatLng(bNode, maxY)];
  }, [route, currentStep, nodeById, maxY]);

  const currentPos = currentNode     ? toLatLng(currentNode, maxY)       : null;
  const ghostPos   = animatedPosition ? toLatLng(animatedPosition, maxY) : null;
  const destPos    = destinationNode  ? toLatLng(destinationNode, maxY)  : null;
  const canUseDemoQr = status === 'UNLOCATED' || status === 'ANCHORED';

  // Animate position marker along the path when currentNode changes
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
    if (!previousNodeId || previousNodeId === currentNodeId) return undefined;

    const routePath  = route?.path || [];
    const startIndex = routePath.indexOf(previousNodeId);
    const endIndex   = routePath.indexOf(currentNodeId);
    const sliceIds   = startIndex >= 0 && endIndex >= 0
      ? (startIndex <= endIndex
          ? routePath.slice(startIndex, endIndex + 1)
          : routePath.slice(endIndex, startIndex + 1).reverse())
      : [previousNodeId, currentNodeId];

    const pathNodes = sliceIds.map(id => nodeById.get(id)).filter(Boolean);

    if (pathNodes.length < 2) {
      if (pendingArrival) useNavStore.getState().completePendingArrival();
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
    const totalDist = cumulative[cumulative.length - 1];
    if (totalDist <= 0) return undefined;

    let startTime = null;
    const easeInOut = t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const frame = timestamp => {
      if (startTime === null) startTime = timestamp;
      const t = Math.min((timestamp - startTime) / durationMs, 1);
      const eased = easeInOut(t);
      const target = eased * totalDist;

      let si = pathNodes.length - 2;
      for (let i = 1; i < cumulative.length; i += 1) {
        if (cumulative[i] >= target) { si = i - 1; break; }
      }
      const segLen = (cumulative[si + 1] ?? cumulative[si]) - cumulative[si];
      const segT   = segLen > 0 ? (target - cumulative[si]) / segLen : 0;
      const sn = pathNodes[si];
      const en = pathNodes[Math.min(si + 1, pathNodes.length - 1)];
      useNavStore.setState({
        animatedPosition: {
          x: sn.x + (en.x - sn.x) * segT,
          y: sn.y + (en.y - sn.y) * segT,
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
  }, [currentNode?.id, floor, nodeById, route, simActive, pendingArrival]);

  if (!floor) return null;

  // Track whether FloorViewportPersistence found a saved viewport for this floor.
  // Used by FitBounds to skip auto-centering when we'll restore a saved position.
  const hasSavedViewportRef = useRef(false);
  const handleHasSaved = (val) => { hasSavedViewportRef.current = val; };

  return (
    <div className="floor-map-shell">
      <MapContainer
        crs={L.CRS.Simple}
        zoom={-2}                // FitBounds sets the real value after mount
        center={[maxY / 2, maxX / 2]}
        minZoom={-4}             // FitBounds raises this to the actual fit zoom
        maxZoom={3}
        zoomSnap={0.25}
        zoomDelta={0.25}         // finer zoom steps — 0.5 was too jumpy
        scrollWheelZoom
        doubleClickZoom
        dragging
        preferCanvas
        // Generous padding so the user can scroll to all corners of the image.
        // The previous ±60 px was too small for the 2000×1400 Ground Floor map.
        maxBounds={paddedBounds}
        maxBoundsViscosity={0.6} // gentler snap — 0.85 felt like a wall
        attributionControl={false}
        aria-label="Navigation map"
        className="floor-map-container"
        style={{ height: '100%', width: '100%' }}
      >
        {/* Fit map to the image on mount and on floor change (bounds key change) */}
        <FitBounds
          bounds={imageBounds}
          imgWidth={imgW}
          imgHeight={imgH}
          skipIfSaved={hasSavedViewportRef.current}
        />
        {/* Only invalidate + update minZoom on status change — does NOT re-centre */}
        <InvalidateSizeOnStatusChange imgWidth={imgW} imgHeight={imgH} />
        <ViewportResetControl bounds={imageBounds} imgWidth={imgW} imgHeight={imgH} />
        {/* Saves viewport per floor; restores on floor switch */}
        <FloorViewportPersistence floorId={floor?.floorId} onHasSaved={handleHasSaved} />

        {/* ── Layer 1: Floor plan image ─────────────── */}
        <ImageOverlay url={imageUrl} bounds={imageBounds} opacity={0.97} />

        {/* ── Layer 2a: Walked portion — dotted & dimmed ── */}
        {walkedPositions.length > 1 && (
          <Polyline
            positions={walkedPositions}
            pathOptions={{
              color: '#6366f1',
              weight: 4,
              opacity: 0.4,
              dashArray: '4, 10',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* ── Layer 2b: Remaining route — solid & bright ─ */}
        {remainingPositions.length > 1 && (
          <>
            {/* Halo for depth */}
            <Polyline
              positions={remainingPositions}
              pathOptions={{
                color: '#1e1b4b',
                weight: 10,
                opacity: 0.45,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Solid bright core */}
            <Polyline
              positions={remainingPositions}
              pathOptions={{
                color: '#818cf8',
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* ── Layer 2c: Active segment highlight ─────── */}
        {activeSegment.length === 2 && (
          <>
            <Polyline
              positions={activeSegment}
              pathOptions={{
                color: '#164e63',
                weight: 14,
                opacity: 0.5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Polyline
              positions={activeSegment}
              pathOptions={{
                color: '#22d3ee',
                weight: 6,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* ── Layer 2d: Ghost of previous route during REROUTING */}
        {previousRoutePositions.length > 1 && (
          <Polyline
            positions={previousRoutePositions}
            pathOptions={{
              color: '#6366f1',
              weight: 4,
              opacity: 0.2,
              dashArray: '6, 10',
              lineCap: 'round',
            }}
          />
        )}

        {/* ── Layer 3: Node markers ─────────────────── */}
        {nodes.map(node => {
          const isPoi   = poiNodeIds.has(node.id);
          const isQr    = qrNodeIds.has(node.id);
          const radius  = isPoi
            ? 9
            : (NODE_RADIUS[node.type] ?? 0);

          // Junctions are invisible — they are routing topology, not UI elements
          if (radius === 0 && !isPoi) return null;

          const color = isPoi
            ? NODE_COLORS.poi
            : (NODE_COLORS[node.type] || NODE_COLORS.junction);
          const poi  = poiByNodeId.get(node.id);
          const pos  = toLatLng(node, maxY);

          return (
            <CircleMarker
              key={node.id}
              center={pos}
              radius={radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.9,
                color: '#ffffff',
                weight: isPoi ? 2 : 1.5,
              }}
              eventHandlers={{
                click: () => {
                  if (isSelectingLocation) {
                    updateLocation(node.id);
                  } else if (isPoi) {
                    selectDestination(node.id);
                  }
                },
              }}
            >
              {isDebug && (
                <Tooltip direction="right" offset={[8, 0]} permanent className="debug-tooltip">
                  {node.id}: {node.label}
                </Tooltip>
              )}
              {!isDebug && isPoi && (
                <Tooltip direction="top" offset={[0, -10]} className="poi-tooltip">
                  {poi?.name || node.label}
                </Tooltip>
              )}
              {!isDebug && isQr && !isPoi && (
                <Tooltip direction="top" offset={[0, -10]} className="debug-tooltip">
                  {node.label}
                </Tooltip>
              )}
            </CircleMarker>
          );
        })}

        {/* ── Layer 4: Current location pulsing marker ─ */}
        <CurrentLocationMarker position={currentPos} />

        {/* ── Layer 5: Animated movement ghost marker ── */}
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

        {/* ── Layer 6: Destination marker ───────────── */}
        <DestinationMarker position={destPos} label={destinationNode?.label} />

        {/* ── Layer 7: Demo-mode tappable QR anchors ── */}
        {isDemoMode && canUseDemoQr && nodes
          .filter(node => qrNodeIds.has(node.id))
          .map(node => {
            const qrEntry = qrCodeByNodeId.get(node.id);
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

      {isSelectingLocation && (
        <div className="location-select-banner">
          <span>Select your current location on a map node.</span>
          <button type="button" className="btn btn--ghost" onClick={cancelLocationUpdate}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
