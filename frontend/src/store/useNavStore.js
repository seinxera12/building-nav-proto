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
    currentNodeId: null,
    currentNode: null,
    animatedPosition: null,
    destinationNodeId: null,
    destinationNode: null,
    route: null,
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

async function applyLocatedNode(set, get, nodeId, node, label) {
  const { destinationNodeId, floor, route, status } = get();
  const shouldReroute = status === 'NAVIGATING' && route && destinationNodeId;

  if (!shouldReroute) {
    setAnchoredLocation(set, get, nodeId, node, {
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: 0,
    });
    toast.success(`Location anchored: ${label || node?.label || 'Current location'}`);
    return;
  }

  const previousRoute = route;
  set({
    status: 'REROUTING',
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
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      remainingDistance: remainingDistance(newRoute, 0),
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
    toast.success(`Location updated: ${label || node?.label || 'Current location'}`);
    logEvent('reroute', {
      from_node: nodeId,
      to_node: destinationNodeId,
      reason: 'location_update',
    });
  } catch {
    set({
      status: 'NAVIGATING',
      route: previousRoute,
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

  anchorLocation: async (qrCodeOrScanResult) => {
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
        set({ error: 'QR code not recognised. Try another anchor.' });
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

    await applyLocatedNode(set, get, nodeId, scannedNode, label);
  },

  handleScan: async (qrCode) => {
    await get().anchorLocation(qrCode);
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
    await applyLocatedNode(set, get, numericNodeId, node, node.label);
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

    const previousRoute = route;
    set({
      status: 'REROUTING',
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
        route: previousRoute,
        routeLoading: false,
        error: 'Could not recalculate route',
      });
    }
  },

  reroute: async (fromNodeId) => {
    const { destinationNodeId } = get();
    if (!destinationNodeId) return null;
    set({ status: 'REROUTING' });
    try {
      const newRoute = await computeRoute(fromNodeId, destinationNodeId);
      set({
        status: 'NAVIGATING',
        route: newRoute,
        currentStep: 0,
        progress: 0,
        remainingDistance: remainingDistance(newRoute, 0),
        pendingArrival: false,
        error: null,
      });
      return newRoute;
    } catch {
      set({ status: 'NAVIGATING', error: 'Could not recalculate route' });
      return null;
    }
  },

  cancelNavigation: () => {
    set({
      status: get().currentNodeId ? 'ANCHORED' : 'UNLOCATED',
      destinationNodeId: null,
      destinationNode: null,
      route: null,
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
    set({ error: messageOrNull });
  },

  setOfflineStatus: (offline, metadata = {}) => {
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
