// store/useNavStore.js — Zustand navigation state
import { create } from 'zustand';
import toast from 'react-hot-toast';
import { fetchFloor, searchPOIs, computeRoute, scanQR, logEvent } from '../api/index.js';

const TURN_ICONS = {
  left: '↰',
  right: '↱',
  straight: '↑',
  start: '📍',
  destination: '🏁',
};

function findNode(floor, nodeId) {
  return floor?.nodes?.find(n => n.id === nodeId) || null;
}

function progressFromStep(stepIndex, totalSteps) {
  if (totalSteps <= 1) return 100;
  return Math.min(100, Math.max(0, Math.round((stepIndex / (totalSteps - 1)) * 100)));
}

function finishRoute(set, get, route, nodeIdOverride = null) {
  const { floor } = get();
  const destNodeId = nodeIdOverride ?? route?.path?.at(-1) ?? null;
  const destNode = destNodeId ? findNode(floor, destNodeId) : null;

  set({
    status: 'ARRIVED',
    currentNodeId: destNodeId ?? get().currentNodeId,
    currentNode: destNode ?? get().currentNode,
    currentStep: Math.max(0, (route?.instructions || []).length - 1),
    progress: 100,
    pendingArrival: false,
    animatedPosition: null,
    error: null,
  });

  logEvent('arrived', {
    destination_node: destNodeId,
    label: destNode?.label,
    via: 'button',
  });
}

const useNavStore = create((set, get) => ({
  // ── Navigation state machine ─────────────────────────
  status: 'IDLE',    // IDLE | LOCATED | NAVIGATING | REROUTING | ARRIVED
  error: null,

  // ── Map data ──────────────────────────────────────────
  floor: null,        // { imageUrl, bounds, nodes[], pois[], qrCodes[] }
  floorLoading: true,
  floorError: null,

  // ── Current location ──────────────────────────────────
  currentNodeId: null,
  currentNode: null,  // { id, x, y, label, type, ... }
  animatedPosition: null, // demo-only ghost marker { x, y }

  // ── Destination ───────────────────────────────────────
  destinationNodeId: null,
  destinationNode: null,

  // ── Routing ───────────────────────────────────────────
  route: null,        // { path[], instructions[], checkpoints[], totalDistance }
  routeLoading: false,
  routeError: null,

  // ── Navigation progress ───────────────────────────────
  currentStep: 0,     // index into route.instructions
  progress: 0,        // 0–100
  pendingArrival: false,

  // ── Search ────────────────────────────────────────────
  searchQuery: '',
  searchResults: [],
  searchLoading: false,

  // ── Actions ───────────────────────────────────────────

  /** Load floor data from backend. */
  loadFloor: async (floorId = 1) => {
    set({ floorLoading: true, floorError: null });
    try {
      const data = await fetchFloor(floorId);
      const currentNodeId = get().currentNodeId;
      set({
        floor: data,
        floorLoading: false,
        currentNode: findNode(data, currentNodeId),
        animatedPosition: null,
      });
    } catch (err) {
      set({ floorLoading: false, floorError: err.message });
    }
  },

  /** Run POI search. */
  runSearch: async (query) => {
    set({ searchQuery: query });
    if (!query || query.trim().length < 2) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    set({ searchLoading: true });
    try {
      const results = await searchPOIs(query);
      set({ searchResults: results, searchLoading: false });
    } catch {
      set({ searchResults: [], searchLoading: false });
    }
  },

  /** Select a destination and compute route from current position. */
  selectDestination: async (nodeId) => {
    const { floor, currentNodeId } = get();
    if (!floor) return;
    if (!currentNodeId) {
      set({ error: 'Scan a QR code first to set your starting location.' });
      return;
    }
    const destNode = floor.nodes.find(n => n.id === nodeId) || null;
    set({
      destinationNodeId: nodeId,
      destinationNode: destNode,
      searchQuery: '',
      searchResults: [],
      routeLoading: true,
      routeError: null,
      route: null,
      currentStep: 0,
      progress: 0,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
    try {
      const route = await computeRoute(currentNodeId, nodeId);
      set({ route, routeLoading: false, status: 'NAVIGATING' });
    } catch (err) {
      set({ routeLoading: false, routeError: err.message });
    }
  },

  /** Advance to next instruction step. */
  advanceStep: () => {
    const { route, currentStep } = get();
    if (!route) return;
    const totalSteps = route.instructions.length;

    if (currentStep >= totalSteps - 1) {
      finishRoute(set, get, route);
      return;
    }

    const next = Math.min(currentStep + 1, totalSteps - 1);
    const nextInstruction = route.instructions[next];
    const shouldArriveAfterAnimation = next === totalSteps - 1
      && nextInstruction?.turn === 'destination';
    const progress = totalSteps > 1 ? Math.round((next / (totalSteps - 1)) * 100) : 100;
    // Update current position to the node of the new step
    const newNodeId = nextInstruction?.nodeId;
    const { floor } = get();
    const previousNodeId = get().currentNodeId;
    const newNode = floor?.nodes.find(n => n.id === newNodeId) || null;
    set({
      currentStep: next,
      progress,
      currentNodeId: newNodeId ?? get().currentNodeId,
      currentNode: newNode ?? get().currentNode,
      pendingArrival: shouldArriveAfterAnimation,
      animatedPosition: null,
    });

    if (shouldArriveAfterAnimation && previousNodeId === newNodeId) {
      finishRoute(set, get, route);
    }
  },

  /** Complete an arrival that was deferred until the map animation finished. */
  completePendingArrival: () => {
    const { route, pendingArrival } = get();
    if (!route || !pendingArrival) return;
    finishRoute(set, get, route);
  },

  /** Go back one step. */
  previousStep: () => {
    const { route, currentStep } = get();
    if (!route || currentStep <= 0) return;
    const prev = currentStep - 1;
    const totalSteps = route.instructions.length;
    const progress = totalSteps > 1 ? Math.round((prev / (totalSteps - 1)) * 100) : 0;
    const newNodeId = route.instructions[prev]?.nodeId;
    const { floor } = get();
    const newNode = floor?.nodes.find(n => n.id === newNodeId) || null;
    set({
      currentStep: prev,
      progress,
      currentNodeId: newNodeId ?? get().currentNodeId,
      currentNode: newNode ?? get().currentNode,
      pendingArrival: false,
      animatedPosition: null,
    });
  },

  /** Update current position (e.g. after QR scan). */
  setCurrentPosition: (nodeId) => {
    const { floor } = get();
    const node = findNode(floor, nodeId);
    set({ currentNodeId: nodeId, currentNode: node, animatedPosition: null });
  },

  /** Dismiss or set a user-facing scan/navigation error. */
  setError: (messageOrNull) => {
    set({ error: messageOrNull });
  },

  /** Process every real or demo QR scan through one state machine. */
  handleScan: async (qrCode) => {
    const state = get();
    const { status, route, floor } = state;

    logEvent('qr_scan', { qr_code: qrCode, status });

    if (!floor) {
      set({ error: 'Floor data is still loading. Try again in a moment.' });
      return;
    }

    if (status === 'REROUTING') {
      set({ error: 'Still recalculating. Try again in a moment.' });
      return;
    }

    if (status === 'ARRIVED') {
      set({ error: 'Navigation is complete. Tap Navigate Again to start over.' });
      return;
    }

    let scanResult;
    try {
      scanResult = await scanQR(qrCode);
    } catch {
      set({ error: 'QR code not recognised. Try another checkpoint.' });
      return;
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

    if (status === 'IDLE' || status === 'LOCATED') {
      set({
        currentNodeId: nodeId,
        currentNode: scannedNode,
        status: 'LOCATED',
        pendingArrival: false,
        animatedPosition: null,
        error: null,
      });
      toast.success(`Located: ${label}`);
      return;
    }

    if (status === 'NAVIGATING' && route) {
      const routeNodeIds = route.path || [];
      const checkpointIds = (route.checkpoints || []).map(c => c.nodeId);
      const destNodeId = routeNodeIds.at(-1);

      if (nodeId === destNodeId) {
        set({
          status: 'ARRIVED',
          currentNodeId: nodeId,
          currentNode: scannedNode,
          currentStep: Math.max(0, (route.instructions || []).length - 1),
          progress: 100,
          pendingArrival: false,
          animatedPosition: null,
          error: null,
        });
        logEvent('arrived', { destination_node: nodeId, label, via: 'qr' });
        return;
      }

      if (checkpointIds.includes(nodeId)) {
        const stepIndex = (route.instructions || []).findIndex(ins => ins.nodeId === nodeId);
        const nextStepIndex = stepIndex >= 0
          ? Math.min(stepIndex + 1, route.instructions.length - 1)
          : Math.min(get().currentStep + 1, route.instructions.length - 1);
        const progress = progressFromStep(nextStepIndex, route.instructions.length);

        set({
          currentNodeId: nodeId,
          currentNode: scannedNode,
          currentStep: nextStepIndex,
          progress,
          pendingArrival: false,
          animatedPosition: null,
          error: null,
        });

        const nextInstruction = route.instructions[nextStepIndex];
        if (nextInstruction) {
          toast(`${TURN_ICONS[nextInstruction.turn] || '→'} ${nextInstruction.text}`, {
            duration: 3000,
          });
        }
        logEvent('checkpoint_scan', { node_id: nodeId, step: nextStepIndex });
        return;
      }

      if (routeNodeIds.includes(nodeId)) {
        const nodeIndexInRoute = routeNodeIds.indexOf(nodeId);
        const stepIndex = (route.instructions || []).findIndex(ins => ins.nodeId === nodeId);
        const nextStepIndex = stepIndex >= 0 ? stepIndex : get().currentStep;
        const progress = Math.round((nodeIndexInRoute / Math.max(1, routeNodeIds.length - 1)) * 100);
        set({
          currentNodeId: nodeId,
          currentNode: scannedNode,
          currentStep: nextStepIndex,
          progress,
          pendingArrival: false,
          animatedPosition: null,
          error: null,
        });
        return;
      }

      const destId = destNodeId;
      set({
        status: 'REROUTING',
        currentNodeId: nodeId,
        currentNode: scannedNode,
        pendingArrival: false,
        animatedPosition: null,
        error: null,
      });
      toast('Recalculating route...');

      try {
        const newRoute = await computeRoute(nodeId, destId);
        set({
          status: 'NAVIGATING',
          route: newRoute,
          currentStep: 0,
          progress: 0,
          pendingArrival: false,
          animatedPosition: null,
          error: null,
        });
        logEvent('reroute', { from_node: nodeId, to_node: destId });
      } catch {
        set({
          status: 'NAVIGATING',
          error: 'Could not recalculate route',
        });
      }
      return;
    }

    console.warn(`Unhandled scan in status: ${status}`, scanResult);
    set({ error: 'Scan could not be handled in the current navigation state.' });
  },

  /** Cancel current navigation. */
  cancelRoute: () => {
    set({
      status: get().currentNodeId ? 'LOCATED' : 'IDLE',
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      pendingArrival: false,
      animatedPosition: null,
      error: null,
    });
  },

  /** Reset the full navigation flow for another demo run. */
  reset: () => {
    set({
      status: 'IDLE',
      error: null,
      currentNodeId: null,
      currentNode: null,
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
      pendingArrival: false,
      animatedPosition: null,
      searchQuery: '',
      searchResults: [],
      searchLoading: false,
    });
  },
}));

export default useNavStore;
