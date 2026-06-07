// store/useNavStore.js - Zustand navigation state
import { create } from 'zustand';
import toast from 'react-hot-toast';
import { fetchFloor, computeRoute, scanQR, logEvent, normalizeQrPayload } from '../api/index.js';

function findNode(floor, nodeId) {
  return floor?.nodes?.find(n => n.id === nodeId) || null;
}

function findPoiForNode(floor, nodeId) {
  return floor?.pois?.find(p => p.node_id === nodeId) || null;
}

function destinationLabel(floor, nodeId) {
  const poi = findPoiForNode(floor, nodeId);
  const node = findNode(floor, nodeId);
  return poi?.name || node?.label || 'Destination';
}

function progressFromStep(stepIndex, totalSteps) {
  if (totalSteps <= 1) return 100;
  return Math.min(100, Math.max(0, Math.round((stepIndex / (totalSteps - 1)) * 100)));
}

function remainingDistance(route, currentStep) {
  const instructions = route?.instructions || [];
  return instructions
    .slice(Math.min(currentStep + 1, instructions.length))
    .reduce((sum, inst) => sum + (Number(inst.distance) || 0), 0);
}

function initialState() {
  return {
    status: 'UNLOCATED',
    error: null,
    scanErrorRecovery: false,
    currentNodeId: null,
    currentNode: null,
    animatedPosition: null,
    destinationNodeId: null,
    destinationNode: null,
    route: null,
    previousRoute: null,
    routeLoading: false,
    routeError: null,
    currentStep: 0,
    progress: 0,
    remainingDistance: 0,
    isSelectingLocation: false,
    manualLocationCandidate: null,
    pendingArrival: false,
    searchQuery: '',
    searchResults: [],
    searchLoading: false,
    offline: false,
    offlineReason: null,
    lastCacheAt: null,
  };
}

function setAnchoredLocation(set, get, nodeId, node, extra = {}) {
  set({
    currentNodeId: nodeId,
    currentNode: node || findNode(get().floor, nodeId),
    status: 'ANCHORED',
    pendingArrival: false,
    animatedPosition: null,
    error: null,
    ...extra,
  });
}

async function routeFrom(set, get, fromNodeId, toNodeId, nextStatus) {
  set({
    routeLoading: true,
    routeError: null,
    route: null,
    currentStep: 0,
    progress: 0,
    remainingDistance: 0,
    pendingArrival: false,
    animatedPosition: null,
    error: null,
  });

  try {
    const route = await computeRoute(fromNodeId, toNodeId);
    // 1.2 — route_served event
    logEvent('route_served', {
      from_node: fromNodeId,
      to_node: toNodeId,
      path_length: route.path.length,
      source: get().offline ? 'cache' : 'network',
    });
    set({
      route,
      routeLoading: false,
      status: nextStatus,
      remainingDistance: remainingDistance(route, 0),
    });
    return route;
  } catch (err) {
    set({
      routeLoading: false,
      routeError: err.message,
      status: get().currentNodeId ? 'ANCHORED' : 'UNLOCATED',
    });
    return null;
  }
}

async function applyLocatedNode(set, get, nodeId, node, label, entryMethod = 'qr_scan') {
  const { destinationNodeId, floor, route, status } = get();
  const shouldReroute = status === 'NAVIGATING' && route && destinationNodeId;

  if (!shouldReroute) {
    setAnchoredLocation(set, get, nodeId, node, {
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      previousRoute: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: 0,
    });
    // 1.3 — location_set event
    logEvent('location_set', { node_id: nodeId, entry_method: entryMethod });
    toast.success(`Location anchored: ${label || node?.label || 'Current location'}`);
    navigator.vibrate?.(80); // 6.1 — haptic on anchor success
    return;
  }

  // 8.1 — store current route as previousRoute before clearing
  set({
    status: 'REROUTING',
    previousRoute: route,
    currentNodeId: nodeId,
    currentNode: node || findNode(floor, nodeId),
    currentStep: 0,
    progress: 0,
    remainingDistance: 0,
    isSelectingLocation: false,
    manualLocationCandidate: null,
    pendingArrival: false,
    animatedPosition: null,
    error: null,
  });

  try {
    const newRoute = await computeRoute(nodeId, destinationNodeId);
    set({
      status: 'NAVIGATING',
      route: newRoute,
      previousRoute: null, // 8.1 — clear on resolve
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: remainingDistance(newRoute, 0),
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
    toast.success('Route updated'); // 8.4 — confirm new route, not just position
    logEvent('reroute', {
      from_node: nodeId,
      to_node: destinationNodeId,
      reason: 'location_update',
    });
  } catch {
    set({
      status: 'NAVIGATING',
      route,
      previousRoute: null,
      routeLoading: false,
      error: 'Could not recalculate route from updated location',
    });
  }
}

function completeArrival(set, get, route) {
  const { floor, destinationNodeId, destinationNode } = get();
  const destNodeId = destinationNodeId ?? route?.path?.at(-1) ?? null;
  const destNode = destinationNode || findNode(floor, destNodeId);

  set({
    status: 'ARRIVED',
    currentNodeId: destNodeId ?? get().currentNodeId,
    currentNode: destNode ?? get().currentNode,
    currentStep: Math.max(0, (route?.instructions || []).length - 1),
    progress: 100,
    remainingDistance: 0,
    isSelectingLocation: false,
    manualLocationCandidate: null,
    pendingArrival: false,
    animatedPosition: null,
    error: null,
  });

  navigator.vibrate?.(200); // 6.3 — haptic on arrival
  logEvent('arrived', {
    destination_node: destNodeId,
    label: destinationLabel(floor, destNodeId),
    via: 'confirmation',
  });
}

const useNavStore = create((set, get) => ({
  // Navigation state machine:
  // UNLOCATED -> ANCHORED -> ROUTE_PREVIEW -> NAVIGATING -> ARRIVED -> ANCHORED
  ...initialState(),

  floor: null,
  floorLoading: true,
  floorError: null,

  loadFloor: async (floorId = 1) => {
    set({ floorLoading: true, floorError: null });
    try {
      const data = await fetchFloor(floorId);
      const currentNodeId = get().currentNodeId;
      const destinationNodeId = get().destinationNodeId;
      set({
        floor: data,
        floorLoading: false,
        currentNode: findNode(data, currentNodeId),
        destinationNode: findNode(data, destinationNodeId),
        animatedPosition: null,
      });
    } catch (err) {
      set({ floorLoading: false, floorError: err.message });
    }
  },

  runSearch: async (query) => {
    const trimmed = query.trim().toLowerCase();
    set({ searchQuery: query });

    if (trimmed.length < 2) {
      set({ searchResults: [], searchLoading: false });
      return;
    }

    const { floor } = get();
    const pois = floor?.pois || [];
    set({ searchLoading: true });

    const results = pois
      .filter(poi => {
        const name = String(poi.name || '').toLowerCase();
        const category = String(poi.category || '').toLowerCase();
        return name.includes(trimmed) || category.includes(trimmed);
      })
      .slice(0, 8)
      .map(poi => {
        const node = findNode(floor, poi.node_id);
        return {
          id: poi.id,
          name: poi.name,
          category: poi.category,
          node_id: poi.node_id,
          x: node?.x,
          y: node?.y,
        };
      });

    set({ searchResults: results, searchLoading: false });
  },

  anchorLocation: async (qrCodeOrScanResult, entryMethod = 'qr_scan') => {
    const state = get();
    const { status, floor } = state;

    if (!floor) {
      set({ error: 'Floor data is still loading. Try again in a moment.' });
      return;
    }

    if (status === 'ROUTE_PREVIEW') {
      set({ error: 'Location is already anchored. Use Begin or Cancel.' });
      return;
    }

    if (status === 'REROUTING') {
      set({ error: 'Still recalculating. Try again in a moment.' });
      return;
    }

    if (status === 'ARRIVED') {
      set({ error: 'End navigation before scanning another anchor.' });
      return;
    }

    let scanResult = qrCodeOrScanResult;
    if (typeof qrCodeOrScanResult === 'string') {
      const qrCode = normalizeQrPayload(qrCodeOrScanResult);
      logEvent('qr_scan', { qr_code: qrCode, status });
      try {
        scanResult = await scanQR(qrCode);
      } catch {
        // 10.1 — set recovery flag so App.jsx can open EntryPrompt
        set({ error: 'QR code not recognised. Try another anchor.', scanErrorRecovery: true });
        return;
      }
    }

    const { nodeId, label } = scanResult;
    const scannedNode = findNode(floor, nodeId) || {
      id: nodeId,
      label,
      x: scanResult.x,
      y: scanResult.y,
      type: scanResult.type,
      floor_id: scanResult.floorId,
    };

    await applyLocatedNode(set, get, nodeId, scannedNode, label, entryMethod);
  },

  handleScan: async (qrCode, entryMethod = 'qr_scan') => {
    await get().anchorLocation(qrCode, entryMethod);
  },

  anchorNode: async (nodeId) => {
    const { floor, status } = get();
    const numericNodeId = Number(nodeId);
    const node = findNode(floor, numericNodeId);

    if (!floor) {
      set({ error: 'Floor data is still loading. Try again in a moment.' });
      return;
    }

    if (!node) {
      set({ error: 'Selected location is not on this floor.' });
      return;
    }

    if (status === 'ROUTE_PREVIEW') {
      set({ error: 'Location is already anchored. Use Begin or Cancel.' });
      return;
    }

    if (status === 'REROUTING') {
      set({ error: 'Still recalculating. Try again in a moment.' });
      return;
    }

    if (status === 'ARRIVED') {
      set({ error: 'End navigation before updating location.' });
      return;
    }

    logEvent('manual_location_select', {
      node_id: numericNodeId,
      status,
      label: node.label,
    });
    // 6.2 — haptic on manual anchor
    navigator.vibrate?.(80);
    await applyLocatedNode(set, get, numericNodeId, node, node.label, 'manual_select');
  },

  selectDestination: async (nodeId) => {
    const { floor, currentNodeId, status } = get();
    if (!floor) return;

    if (status === 'UNLOCATED' || !currentNodeId) {
      set({ error: 'Scan a QR code first to set your starting location.' });
      return;
    }

    if (status === 'NAVIGATING' || status === 'REROUTING') {
      set({ error: 'Cancel or end the current navigation before choosing a new destination.' });
      return;
    }

    if (status === 'ARRIVED') {
      set({ error: 'End navigation before choosing a new destination.' });
      return;
    }

    const destNode = findNode(floor, nodeId);
    set({
      destinationNodeId: nodeId,
      destinationNode: destNode,
      searchQuery: '',
      searchResults: [],
      error: null,
    });

    // 1.1 — route_request event
    logEvent('route_request', { from_node: currentNodeId, to_node: nodeId });

    await routeFrom(set, get, currentNodeId, nodeId, 'ROUTE_PREVIEW');
  },

  beginNavigation: () => {
    const { status, route, routeLoading, routeError } = get();
    if (status !== 'ROUTE_PREVIEW' || !route || routeLoading || routeError) return;
    set({
      status: 'NAVIGATING',
      currentStep: 0,
      progress: 0,
      remainingDistance: remainingDistance(route, 0),
      pendingArrival: false,
      isSelectingLocation: false,
      manualLocationCandidate: null,
      animatedPosition: null,
      error: null,
    });
  },

  advanceStep: () => {
    const { route, currentStep, status, floor } = get();
    if (status !== 'NAVIGATING' || !route) return;

    const instructions = route.instructions || [];
    const totalSteps = instructions.length;
    if (totalSteps === 0 || currentStep >= totalSteps - 1) {
      completeArrival(set, get, route);
      return;
    }

    const next = Math.min(currentStep + 1, totalSteps - 1);
    const nextInstruction = instructions[next];
    const newNodeId = nextInstruction?.nodeId;
    const newNode = findNode(floor, newNodeId);

    set({
      currentStep: next,
      progress: progressFromStep(next, totalSteps),
      remainingDistance: remainingDistance(route, next),
      currentNodeId: newNodeId ?? get().currentNodeId,
      currentNode: newNode ?? get().currentNode,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });

    // 1.5 — checkpoint_passed event when advanced node has a QR code
    if (newNodeId) {
      const qrCodes = floor?.qrCodes || [];
      const isCheckpoint = qrCodes.some(qr => qr.node_id === newNodeId);
      if (isCheckpoint) {
        logEvent('checkpoint_passed', {
          node_id: newNodeId,
          step_index: next,
          progress: progressFromStep(next, totalSteps),
        });
      }
    }

    if (next >= totalSteps - 1) {
      completeArrival(set, get, route);
    }
  },

  completePendingArrival: () => {
    const { route, pendingArrival } = get();
    if (!route || !pendingArrival) return;
    completeArrival(set, get, route);
  },

  startLocationUpdate: () => {
    if (get().status !== 'NAVIGATING') return;
    toast('Select your approximate location on the map.');
    set({
      isSelectingLocation: true,
      manualLocationCandidate: null,
    });
  },

  cancelLocationUpdate: () => {
    set({
      isSelectingLocation: false,
      manualLocationCandidate: null,
    });
  },

  updateLocation: async (nodeId) => {
    const { floor, route, destinationNodeId, status, currentStep } = get();
    const selectedNode = findNode(floor, nodeId);
    if (status !== 'NAVIGATING' || !route || !destinationNodeId || !selectedNode) return;

    const routePath = route.path || [];
    const remainingInstructions = (route.instructions || []).slice(currentStep);
    const remainingNodeIds = new Set(remainingInstructions.map(inst => inst.nodeId));
    const currentPathIndex = routePath.indexOf(get().currentNodeId);
    const remainingPathIds = new Set(
      currentPathIndex >= 0 ? routePath.slice(currentPathIndex) : [],
    );
    const selectedInstructionIndex = (route.instructions || []).findIndex(
      (inst, index) => index >= currentStep && inst.nodeId === nodeId,
    );

    if (remainingNodeIds.has(nodeId) || remainingPathIds.has(nodeId)) {
      const nextStep = selectedInstructionIndex >= 0 ? selectedInstructionIndex : currentStep;
      set({
        currentNodeId: nodeId,
        currentNode: selectedNode,
        currentStep: nextStep,
        progress: progressFromStep(nextStep, route.instructions.length),
        remainingDistance: remainingDistance(route, nextStep),
        isSelectingLocation: false,
        manualLocationCandidate: null,
        pendingArrival: false,
        animatedPosition: null,
        error: null,
      });
      return;
    }

    // 8.1 — store previousRoute before clearing on REROUTING
    set({
      status: 'REROUTING',
      previousRoute: route,
      currentNodeId: nodeId,
      currentNode: selectedNode,
      isSelectingLocation: false,
      manualLocationCandidate: null,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });

    try {
      const newRoute = await computeRoute(nodeId, destinationNodeId);
      set({
        status: 'NAVIGATING',
        route: newRoute,
        previousRoute: null, // 8.1 — clear on resolve
        routeLoading: false,
        routeError: null,
        currentStep: 0,
        progress: 0,
        remainingDistance: remainingDistance(newRoute, 0),
        pendingArrival: false,
        animatedPosition: null,
        error: null,
      });
      logEvent('reroute', {
        from_node: nodeId,
        to_node: destinationNodeId,
        reason: 'manual_location_update',
      });
    } catch {
      set({
        status: 'NAVIGATING',
        route,
        previousRoute: null,
        routeLoading: false,
        error: 'Could not recalculate route',
      });
    }
  },

  reroute: async (fromNodeId) => {
    const { destinationNodeId, route } = get();
    if (!destinationNodeId) return null;
    set({ status: 'REROUTING', previousRoute: route }); // 8.1
    try {
      const newRoute = await computeRoute(fromNodeId, destinationNodeId);
      set({
        status: 'NAVIGATING',
        route: newRoute,
        previousRoute: null,
        currentStep: 0,
        progress: 0,
        remainingDistance: remainingDistance(newRoute, 0),
        pendingArrival: false,
        error: null,
      });
      return newRoute;
    } catch {
      set({ status: 'NAVIGATING', previousRoute: null, error: 'Could not recalculate route' });
      return null;
    }
  },

  cancelNavigation: () => {
    set({
      status: get().currentNodeId ? 'ANCHORED' : 'UNLOCATED',
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      previousRoute: null, // 8.1 — clear on cancel
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: 0,
      isSelectingLocation: false,
      manualLocationCandidate: null,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
  },

  completeNavigation: () => {
    const { destinationNodeId, floor } = get();
    logEvent('path_complete', {
      destination_node: destinationNodeId,
      label: destinationLabel(floor, destinationNodeId),
    });
    set({
      status: get().currentNodeId ? 'ANCHORED' : 'UNLOCATED',
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      previousRoute: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: 0,
      isSelectingLocation: false,
      manualLocationCandidate: null,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
  },

  resetNavigation: () => {
    set(initialState());
  },

  setCurrentPosition: (nodeId) => {
    const { floor } = get();
    const node = findNode(floor, nodeId);
    set({ currentNodeId: nodeId, currentNode: node, animatedPosition: null });
  },

  setError: (messageOrNull) => {
    // 10.1 — clear scanErrorRecovery when error is dismissed
    set({ error: messageOrNull, scanErrorRecovery: false });
  },

  setScanErrorRecovery: (value) => {
    set({ scanErrorRecovery: value });
  },

  setOfflineStatus: (offline, metadata = {}) => {
    const wasOffline = get().offline;
    // 1.4 — offline_mode event only on transition to offline
    if (offline && !wasOffline) {
      logEvent('offline_mode', {
        reason: metadata.reason || null,
        cached_at: metadata.cachedAt || null,
      });
    }
    set({
      offline,
      offlineReason: offline ? metadata.reason || metadata.fallback || null : null,
      lastCacheAt: metadata.cachedAt || get().lastCacheAt,
    });
  },

  // Compatibility aliases for existing demo reset wiring.
  cancelRoute: () => get().cancelNavigation(),
  reset: () => get().resetNavigation(),
}));

export default useNavStore;
