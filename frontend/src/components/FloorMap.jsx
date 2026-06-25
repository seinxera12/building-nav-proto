// components/FloorMap.jsx — Leaflet map with CRS.Simple for indoor navigation
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  CircleMarker,
  Polyline,
  Marker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import AnimatedRoutePolyline from './AnimatedRoutePolyline';
import PulsingLocationMarker from './PulsingLocationMarker';
import L from 'leaflet';
import useNavStore, { translatePoi } from '../store/useNavStore';
import { useSimStore } from '../store/useSimStore';
import { saveFloorViewport, getFloorViewport, getCachedGraph } from '../api/index.js';
import FloorPlanLayer from './FloorPlanLayer';
import GeoJSONSpaces from './GeoJSONSpaces';
import { routeLatLngBounds } from './mapGeometry.js';

/* ── Coordinate helpers ──────────────────────────────────────────
   The floor plan image uses pixel coords where Y increases downward.
   Leaflet CRS.Simple has Y increasing upward.
   We map: Leaflet [lat, lng] = [maxY - pixelY, pixelX]
   Image bounds: [[0, 0], [maxY, maxX]]                          */
function toLatLng(node, maxY) {
  return [maxY - node.y, node.x];
}

/* ── Default zoom for street-level view (showing ~room + corridor) ── */
const DEFAULT_FOLLOW_ZOOM = 1; // street-level zoom showing ~room + corridor

/* ── Zoom tiers — single source of truth for all camera transitions ──
   ANCHOR_FOLLOW : used by AnchorToUser (unchanged behaviour)
   NAV_STEP      : slightly closer during active navigation              */
const ZOOM = {
  ANCHOR_FOLLOW: DEFAULT_FOLLOW_ZOOM,
  NAV_STEP:      DEFAULT_FOLLOW_ZOOM + 0.5,
};

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

/* Shared flag: any component that moves the map programmatically sets this
   to prevent FollowCamera from interpreting the resulting events as user input. */
let programmaticMoveInProgress = false;
export function markProgrammaticMove(durationMs = 1200) {
  programmaticMoveInProgress = true;
  setTimeout(() => { programmaticMoveInProgress = false; }, durationMs);
}

const QR_ICON = L.divIcon({
  html: '<div class="qr-demo-marker">📷</div>',
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/* ── AnchorToUser — flies the camera to the user's location at street-level zoom
   whenever the user anchors (UNLOCATED → anything, or REROUTING on reanchor).
   Also re-enables followMode so the camera tracks them after anchoring.          */
function AnchorToUser({ currentNode, status, maxY, setFollowMode }) {
  const map = useMap();
  const prevStatusRef = useRef(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const wasUnlocated = prev === 'UNLOCATED';
    const wasRerouting = prev === 'REROUTING';
    const isAnchored   = !!currentNode && status !== 'UNLOCATED';

    // Fire on initial anchor (UNLOCATED → *) and on reanchor during nav (REROUTING → NAVIGATING/ANCHORED)
    const shouldFly = isAnchored && (wasUnlocated || wasRerouting);

    if (shouldFly) {
      const position = toLatLng(currentNode, maxY);
      setTimeout(() => {
        setFollowMode(true);
        markProgrammaticMove(1200);
        map.flyTo(position, DEFAULT_FOLLOW_ZOOM, {
          duration: 0.8,
          easeLinearity: 0.25,
        });
      }, 100);
    }

    prevStatusRef.current = status;
  }, [currentNode, status, map, maxY, setFollowMode]);

  return null;
}

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
function FitBounds({ bounds, imgWidth, imgHeight, skipIfSaved }) {
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
   Calls map.invalidateSize() after the instruction panel slides in/out,
   and when the window is resized or the device is rotated.
   ONLY updates minZoom — does NOT forcibly re-centre the map.
   This prevents the "snapped back while panning" bug.             */
function InvalidateSizeOnStatusChange({ imgWidth, imgHeight }) {
  const map = useMap();
  const status = useNavStore(s => s.status);

  const invalidate = () => {
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
  };

  // Invalidate on status change (e.g., instruction panel slide in/out)
  useEffect(() => {
    const id = setTimeout(invalidate, 200);
    return () => clearTimeout(id);
  }, [map, status, imgWidth, imgHeight]);

  // Invalidate on window resize and orientation change
  useEffect(() => {
    let debounceTimer = null;

    const handleResize = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(invalidate, 200);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [map, imgWidth, imgHeight]);

  return null;
}

// ViewportResetControl REMOVED - "Fit" functionality is now in FABGroup (re-center FAB)
// The re-center FAB uses map:recenter event which triggers RecenterOnEvent component

/* ── FlyToPosition — REMOVED: automatic flyTo on position change.
   Location updates now only animate the marker via animatedPosition/PulsingLocationMarker.
   Camera movement is retained ONLY for explicit user-initiated recenter
   (map:recenter event) and the "Fit" control. This decouples the camera
   from the location animation (fixes cameraCoupling / Property 7).        ── */
function FlyToPosition() {
  // Intentionally empty — automatic map.flyTo on position change has been removed.
  // The location marker animates via animatedPosition in the parent component.
  // Retain the component for potential future explicit fly-to scenarios.
  return null;
}

/* ── PreviewFitCamera — zooms out to show the whole route when ROUTE_PREVIEW is entered.
   Fires only on the status transition (ROUTE_PREVIEW entry), not on every render.
   Falls back to the full floor imageBounds when route has no current-floor nodes.
   Sets followMode OFF so the user can inspect the complete route overview.       ── */
function PreviewFitCamera({ route, nodeById, maxY, imageBounds, imgWidth, imgHeight, setFollowMode }) {
  const map = useMap();
  const status = useNavStore(s => s.status);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    const isEnteringPreview = status === 'ROUTE_PREVIEW' && prevStatusRef.current !== 'ROUTE_PREVIEW';

    if (isEnteringPreview) {
      setFollowMode(false);

      const bounds = routeLatLngBounds(route, nodeById, maxY) ?? L.latLngBounds(imageBounds);

      const container = map.getContainer();
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 400;
      const fitZoom = computeFitZoom(w, h, imgWidth, imgHeight, 40);

      markProgrammaticMove(1200);
      map.flyToBounds(bounds, {
        padding: [60, 60],
        maxZoom: fitZoom + 0.5,
        duration: 0.8,
      });
    }

    prevStatusRef.current = status;
  }, [status, route, nodeById, maxY, imageBounds, imgWidth, imgHeight, map, setFollowMode]);

  return null;
}

/* ── BeginNavigationSync — synchronizes viewport on ROUTE_PREVIEW → NAVIGATING transition.
   Uses ZOOM.NAV_STEP (slightly zoomed in).
   Preserves the existing cross-floor switchFloor-then-fly logic.               ── */
function BeginNavigationSync({ floor, currentFloorId, setFollowMode }) {
  const map = useMap();
  const status = useNavStore(s => s.status);
  const route = useNavStore(s => s.route);
  const switchFloor = useNavStore(s => s.switchFloor);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    const wasRoutePreview = prevStatusRef.current === 'ROUTE_PREVIEW';
    const isNavigating = status === 'NAVIGATING';

    if (wasRoutePreview && isNavigating && route?.path?.length > 0) {
      const firstNodeId = route.path[0];

      const floorsById = useNavStore.getState().floorsById;
      let startNode = null;
      let startNodeFloorId = null;

      for (const [floorId, floorData] of floorsById) {
        if (floorData?.nodes) {
          const node = floorData.nodes.find(n => n.id === firstNodeId);
          if (node) {
            startNode = node;
            startNodeFloorId = floorId;
            break;
          }
        }
      }

      if (startNode && startNodeFloorId) {
        const maxY = floor?.bounds?.maxY || 1000;
        const position = toLatLng(startNode, maxY);

        // If start node is on a different floor, switch floor first, then fly
        if (startNodeFloorId !== currentFloorId) {
          switchFloor(startNodeFloorId).then(() => {
            const newFloor = useNavStore.getState().floor;
            const newMaxY = newFloor?.bounds?.maxY || 1000;
            const newPosition = toLatLng(startNode, newMaxY);
            setFollowMode(true);
            markProgrammaticMove(1200);
            map.flyTo(newPosition, ZOOM.NAV_STEP, {
              duration: 0.8,
              easeLinearity: 0.25,
            });
          });
        } else {
          setFollowMode(true);
          markProgrammaticMove(1200);
          map.flyTo(position, ZOOM.NAV_STEP, {
            duration: 0.8,
            easeLinearity: 0.25,
          });
        }
      }
    }

    prevStatusRef.current = status;
  }, [status, route, floor, currentFloorId, map, switchFloor, setFollowMode]);

  return null;
}

/* ── FollowCamera — keeps the camera centered on the user's position during navigation.
   Follows Google Maps behavior: ON during NAVIGATING/REROUTING, can be overridden
   by user pan/zoom. Uses panTo (not flyTo) for quick, responsive updates.
   Uses panTo (not flyTo) for quick, responsive updates.                          ── */
function FollowCamera({ currentNode, animatedPosition, maxY, followMode, setFollowMode }) {
  const map = useMap();

  // Keep camera centered on user position when followMode is ON
  useEffect(() => {
    if (!followMode || !currentNode) return;

    const pos = animatedPosition
      ? toLatLng(animatedPosition, maxY)
      : toLatLng(currentNode, maxY);

    markProgrammaticMove(400);
    map.panTo(pos, { animate: true, duration: 0.3 });
  }, [animatedPosition, currentNode, followMode, map, maxY]);

  // Detect user interaction and disable follow mode
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!programmaticMoveInProgress) {
        setFollowMode(false);
      }
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', handleUserInteraction);

    return () => {
      map.off('dragstart', handleUserInteraction);
      map.off('zoomstart', handleUserInteraction);
    };
  }, [map, setFollowMode]);

  return null;
}


/* ── RecenterOnEvent — listens for 'map:recenter' custom event
   and flies back to the current anchored position at fit zoom.
   Also re-enables follow mode when recenter is triggered.         ── */
function RecenterOnEvent({ position, imgWidth, imgHeight, bounds, setFollowMode, status }) {
  const map = useMap();

  useEffect(() => {
    const handleRecenter = () => {
      if (!position) return;
      if (setFollowMode) setFollowMode(true);
      const container = map.getContainer();
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 400;
      const fitZoom = computeFitZoom(w, h, imgWidth, imgHeight, 40);
      // During navigation stay at nav zoom; otherwise use fit zoom
      const isNav = status === 'NAVIGATING' || status === 'REROUTING';
      const targetZoom = isNav ? ZOOM.NAV_STEP : fitZoom;
      markProgrammaticMove(1600); // covers the 1.2s flyTo duration
      map.flyTo(position, targetZoom, { duration: 1.2, easeLinearity: 0.25 });
    };

    window.addEventListener('map:recenter', handleRecenter);
    return () => window.removeEventListener('map:recenter', handleRecenter);
  }, [map, position, imgWidth, imgHeight, bounds, setFollowMode, status]);

  return null;
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
        {label || '目的地'}
      </Tooltip>
    </CircleMarker>
  );
}

/* ── Main FloorMap component ─────────────────────────────────── */
export default function FloorMap() {
  const floor             = useNavStore(s => s.floor);
  const currentFloorId    = useNavStore(s => s.currentFloorId);
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
  const poiTranslations   = useNavStore(s => s.poiTranslations);
  const simActive = useSimStore(s => s.isRunning || s.autoPlay || s.isExecuting);
  const prevNodeIdRef  = useRef(null);
  const motionFrameRef = useRef(null);

  // Follow camera mode: ON during NAVIGATING/REROUTING, can be overridden by user
  const [followMode, setFollowMode] = useState(true);

  // Re-enable followMode when entering an active navigation state.
  // currentFloorId dep: if user explored another floor and comes back,
  // restore follow so the camera tracks them again.
  const prevStatusRef2 = useRef(null);
  useEffect(() => {
    const prev = prevStatusRef2.current;
    // Enable follow on entering NAVIGATING (from any prior state)
    // or on entering REROUTING (reanchor mid-nav) so camera re-centers via AnchorToUser
    if (
      (status === 'NAVIGATING' && prev !== 'NAVIGATING') ||
      (status === 'REROUTING'  && prev !== 'REROUTING')
    ) {
      setFollowMode(true);
    }
    // Re-enable when returning to current floor during active navigation
    // (user panned around a different floor and switched back)
    if ((status === 'NAVIGATING' || status === 'REROUTING') && prev === status) {
      // floor changed while same status — user returned to this floor
      setFollowMode(true);
    }
    prevStatusRef2.current = status;
  }, [status, currentFloorId]);

  // Expose followMode via custom event so FABGroup can show/hide the button
  useEffect(() => {
    const event = new CustomEvent('followMode:changed', { detail: { followMode } });
    window.dispatchEvent(event);
  }, [followMode]);

  // ── GeoJSON room data (optional enhancement) ──
  const [geojsonData, setGeojsonData] = useState(null);

  useEffect(() => {
    if (!currentFloorId) {
      setGeojsonData(null);
      return;
    }
    let cancelled = false;
    fetch(`/assets/geojson/floor-${currentFloorId}.json`)
      .then(res => {
        if (!res.ok) throw new Error(`GeoJSON not found for floor ${currentFloorId}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setGeojsonData(data);
      })
      .catch(() => {
        // GeoJSON is optional — silently render nothing if unavailable
        if (!cancelled) setGeojsonData(null);
      });
    return () => { cancelled = true; };
  }, [currentFloorId]);

  // Force route polyline redraw after floor plan fade-in completes (Requirement 15.3)
  const [floorTransitionKey, setFloorTransitionKey] = useState(0);
  useEffect(() => {
    const handleTransitionEnd = () => {
      setFloorTransitionKey(k => k + 1);
    };
    window.addEventListener('floorplan:transitionend', handleTransitionEnd);
    return () => window.removeEventListener('floorplan:transitionend', handleTransitionEnd);
  }, []);

  const isDebug = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const isDemoMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('demo');
  // GeoJSON layer is disabled - using POI dots for destination selection instead
  const enableGeoJSON = false;

  const { bounds: b = { maxY: 0, maxX: 0 }, imageUrl, nodes = [], pois = [] } = floor || {};
  const maxY   = b.maxY;
  const maxX   = b.maxX;
  const imgW   = maxX;   // floor plan pixel width
  const imgH   = maxY;   // floor plan pixel height

  // ── DEFENSIVE FLOOR FILTERING ──
  // Filter nodes, POIs, and QR codes by currentFloorId to prevent floor bleeding.
  // Even though the backend filters by floor_id, we add defensive filtering here
  // to ensure only the current floor's elements render (fixes floor bleed issue).
  const floorId = currentFloorId;
  const filteredNodes = useMemo(
    () => nodes.filter(n => !n.floor_id || n.floor_id === floorId),
    [nodes, floorId]
  );
  const filteredPois = useMemo(
    () => pois.filter(p => !p.floor_id || p.floor_id === floorId),
    [pois, floorId]
  );
  const filteredQrCodes = useMemo(
    () => (floor?.qrCodes || []).filter(q => !q.floor_id || q.floor_id === floorId),
    [floor, floorId]
  );

  const nodeById     = useMemo(() => new Map(filteredNodes.map(n => [n.id, n])), [filteredNodes]);
  const poiByNodeId  = useMemo(() => new Map(filteredPois.map(p => [p.node_id, p])), [filteredPois]);
  const qrCodes      = filteredQrCodes;
  const qrCodeByNodeId = useMemo(
    () => new Map(qrCodes.map(q => [q.node_id, q])),
    [qrCodes],
  );
  const qrNodeIds  = useMemo(() => new Set(qrCodes.map(q => q.node_id)), [qrCodes]);
  const poiNodeIds = useMemo(() => new Set(filteredPois.map(p => p.node_id)), [filteredPois]);

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

    // A node is renderable if it lives on the current floor.
    // Since the backend doesn't return floor_id in node objects, we check
    // whether the node exists in the current floor's node list (nodeById).
    const isOnCurrentFloor = (nodeId) => {
      return nodeById.has(nodeId);
    };

    // Build contiguous segments: only connect consecutive nodes BOTH on current floor
    const makeSegments = (ids) => {
      const segments = [];
      let current = [];
      for (const id of ids) {
        const n = nodeById.get(id);
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
  }, [route, currentStep, nodeById, currentFloorId, maxY, floorTransitionKey]);

  // faded ghost of the previous route shown during REROUTING
  const previousRoutePositions = useMemo(() => {
    if (status !== 'REROUTING' || !previousRoute?.path) return [];
    return previousRoute.path
      .map(id => { const n = nodeById.get(id); return n ? toLatLng(n, maxY) : null; })
      .filter(Boolean);
  }, [status, previousRoute, nodeById, maxY]);

  const currentPos = currentNode     ? toLatLng(currentNode, maxY)       : null;
  const ghostPos   = animatedPosition ? toLatLng(animatedPosition, maxY) : null;
  const destPos    = destinationNode  ? toLatLng(destinationNode, maxY)  : null;
  const canUseDemoQr = status === 'UNLOCATED' || status === 'ANCHORED';

  // Track whether FloorViewportPersistence found a saved viewport for this floor.
  // Used by FitBounds to skip auto-centering when we'll restore a saved position.
  // Moved above the early return to comply with React's Rules of Hooks.
  const hasSavedViewportRef = useRef(false);
  const handleHasSaved = (val) => { hasSavedViewportRef.current = val; };

  // Animate position marker along the path when currentNode changes
  // This effect is kept as a hook - it runs regardless of floor presence
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

  // Early return AFTER all hook declarations — this ensures the hook list
  // is invariant across floor presence transitions (fixes Property 1 / Requirement 2.1)
  if (!floor) return null;

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
        maxBounds={paddedBounds}
        maxBoundsViscosity={0.6} // gentler snap — 0.85 felt like a wall
        attributionControl={false}
        aria-label="ナビゲーション地図"
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
        {/* "Fit" functionality is handled by FABGroup re-center FAB */}
        {/* Saves viewport per floor; restores on floor switch */}
        <FloorViewportPersistence floorId={floor?.floorId} onHasSaved={handleHasSaved} />

        {/* ── Layer 0: Floor plan visual (SVG primary, PNG fallback) ── */}
        <FloorPlanLayer
          svgUrl={floor.imageSvgUrl || null}
          pngUrl={imageUrl}
          bounds={imageBounds}
          floorId={floor.floorId || currentFloorId}
        />

        {/* ── Layer 0.5: GeoJSON interactive spaces (rooms, areas) ── */}
        {enableGeoJSON && (
          <GeoJSONSpaces
            geojsonData={geojsonData}
            onSelectDestination={selectDestination}
            maxY={maxY}
          />
        )}

        {/* ── Layer 2: Animated route polyline (walked / remaining / ghost) ── */}
        <AnimatedRoutePolyline
          walkedPositions={walkedPositions}
          remainingPositions={remainingPositions}
          previousRoutePositions={previousRoutePositions}
          status={status}
        />

        {/* ── Layer 1 (debug): Navigation graph nodes and edges ── */}
        {isDebug && (() => {
          const graph = getCachedGraph();
          const floorEdges = (graph?.edges || []).filter(edge => {
            const fromNode = nodeById.get(edge.from_node);
            const toNode = nodeById.get(edge.to_node);
            return fromNode && toNode; // both endpoints on current floor
          });
          return (
            <>
              {/* Debug edges */}
              {floorEdges.map(edge => {
                const fromNode = nodeById.get(edge.from_node);
                const toNode = nodeById.get(edge.to_node);
                const positions = [toLatLng(fromNode, maxY), toLatLng(toNode, maxY)];
                return (
                  <Polyline
                    key={`edge-${edge.from_node}-${edge.to_node}`}
                    positions={positions}
                    pathOptions={{
                      color: edge.floor_change ? '#f59e0b' : '#6b7280',
                      weight: 1.5,
                      opacity: 0.5,
                      dashArray: edge.floor_change ? '4 4' : undefined,
                    }}
                  />
                );
              })}
              {/* Debug nodes (all nodes including junctions with IDs) - use filteredNodes for floor bleed fix */}
              {filteredNodes.map(node => {
                const radius = NODE_RADIUS[node.type] ?? 4;
                const color = NODE_COLORS[node.type] || NODE_COLORS.junction;
                const pos = toLatLng(node, maxY);
                return (
                  <CircleMarker
                    key={`debug-${node.id}`}
                    center={pos}
                    radius={Math.max(radius, 4)}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: 0.7,
                      color: '#ffffff',
                      weight: 1,
                    }}
                  >
                    <Tooltip direction="right" offset={[8, 0]} permanent className="debug-tooltip">
                      {node.id}: {node.label}
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </>
          );
        })()}

        {/* ── Layer 2 (interactive): POI and QR anchor nodes ── */}
        {/* Use filteredNodes to ensure only current floor's nodes render (floor bleed fix) */}
        {!isDebug && filteredNodes.map(node => {
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
          // POI dot shifted 32px above node centre so it clears SVG room label text.
          const pos  = isPoi
            ? [maxY - node.y + 32, node.x]
            : toLatLng(node, maxY);

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
              {isPoi && (
                <Tooltip
                  direction="top"
                  offset={[0, -10]}
                  className="poi-tooltip"
                >
                  {translatePoi(poi?.name || node.label, poiTranslations)}
                </Tooltip>
              )}
              {isQr && !isPoi && (
                <Tooltip direction="top" offset={[0, -10]} className="debug-tooltip">
                  {node.label}
                </Tooltip>
              )}
            </CircleMarker>
          );
        })}

        {/* ── Layer 2 (live overlay): Current location pulsing marker ─ */}
        <PulsingLocationMarker
          position={ghostPos || currentPos}
          isUpdating={!!ghostPos}
        />

        {/* ── FlyTo on position change (Requirement 17.1) ─────────── */}
        <FlyToPosition />

        {/* ── Anchor to user on first QR scan (Task 10) ────────────── */}
        <AnchorToUser currentNode={currentNode} status={status} maxY={maxY} setFollowMode={setFollowMode} />

        {/* ── Route preview fit (req #3): zoom-to-fit on destination chosen ── */}
        <PreviewFitCamera
          route={route}
          nodeById={nodeById}
          maxY={maxY}
          imageBounds={imageBounds}
          imgWidth={imgW}
          imgHeight={imgH}
          setFollowMode={setFollowMode}
        />

        {/* ── Begin Navigation sync (Property 5 / Requirement 2.10) ── */}
        <BeginNavigationSync floor={floor} currentFloorId={currentFloorId} setFollowMode={setFollowMode} />

        {/* ── Recenter on 'map:recenter' custom event (Requirement 8.2) ── */}
        <RecenterOnEvent
          position={currentPos}
          imgWidth={imgW}
          imgHeight={imgH}
          bounds={imageBounds}
          setFollowMode={setFollowMode}
          status={status}
        />

        {/* ── Follow camera during navigation (Task 11) ────────────── */}
        <FollowCamera
          currentNode={currentNode}
          animatedPosition={animatedPosition}
          maxY={maxY}
          followMode={followMode}
          setFollowMode={setFollowMode}
        />

        {/* ── Layer 2 (live overlay): Destination marker ───────────── */}
        <DestinationMarker position={destPos} label={destinationNode?.label} />

        {/* ── Layer 2 (live overlay): Demo-mode tappable QR anchors ── */}
        {/* Use filteredNodes for demo mode QR markers (floor bleed fix) */}
        {isDemoMode && canUseDemoQr && filteredNodes
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
