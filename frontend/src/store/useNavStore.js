// store/useNavStore.js — Zustand navigation state
import { create } from 'zustand';
import { fetchFloor, searchPOIs, computeRoute } from '../api/index.js';

const DEFAULT_POSITION_NODE = 1; // Main Lobby — fallback before QR scan

const useNavStore = create((set, get) => ({
  // ── Map data ──────────────────────────────────────────
  floor: null,        // { imageUrl, bounds, nodes[], pois[] }
  floorLoading: true,
  floorError: null,

  // ── Current location ──────────────────────────────────
  currentNodeId: DEFAULT_POSITION_NODE,
  currentNode: null,  // { id, x, y, label, type, ... }

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
      const nodes = data.nodes || [];
      const currentNodeId = get().currentNodeId;
      const currentNode = nodes.find(n => n.id === currentNodeId) || nodes[0] || null;
      set({
        floor: data,
        floorLoading: false,
        currentNode,
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
    });
    try {
      const route = await computeRoute(currentNodeId, nodeId);
      set({ route, routeLoading: false });
    } catch (err) {
      set({ routeLoading: false, routeError: err.message });
    }
  },

  /** Advance to next instruction step. */
  advanceStep: () => {
    const { route, currentStep } = get();
    if (!route) return;
    const totalSteps = route.instructions.length;
    const next = Math.min(currentStep + 1, totalSteps - 1);
    const progress = totalSteps > 1 ? Math.round((next / (totalSteps - 1)) * 100) : 100;
    // Update current position to the node of the new step
    const newNodeId = route.instructions[next]?.nodeId;
    const { floor } = get();
    const newNode = floor?.nodes.find(n => n.id === newNodeId) || null;
    set({
      currentStep: next,
      progress,
      currentNodeId: newNodeId ?? get().currentNodeId,
      currentNode: newNode ?? get().currentNode,
    });
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
    });
  },

  /** Update current position (e.g. after QR scan). */
  setCurrentPosition: (nodeId) => {
    const { floor } = get();
    const node = floor?.nodes.find(n => n.id === nodeId) || null;
    set({ currentNodeId: nodeId, currentNode: node });
  },

  /** Cancel current navigation. */
  cancelRoute: () => {
    set({
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      routeLoading: false,
      routeError: null,
      currentStep: 0,
      progress: 0,
    });
  },
}));

export default useNavStore;
