// Test setup file for Vitest
// Configures testing utilities and mocks

import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// ── Leaflet Mock ─────────────────────────────────────────────────────────────
// Leaflet uses browser APIs not available in jsdom. We mock it minimally
// so react-leaflet components can render without errors.

const mockMapInstance = {
  flyTo: vi.fn(() => mockMapInstance),
  panTo: vi.fn(() => mockMapInstance),
  setView: vi.fn(() => mockMapInstance),
  setZoom: vi.fn(() => mockMapInstance),
  getZoom: vi.fn(() => 0),
  getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
  getMinZoom: vi.fn(() => -4),
  setMinZoom: vi.fn(() => mockMapInstance),
  getMaxZoom: vi.fn(() => 3),
  getBounds: vi.fn(() => ({
    getSouthWest: () => ({ lat: 0, lng: 0 }),
    getNorthEast: () => ({ lat: 100, lng: 100 }),
  })),
  invalidateSize: vi.fn(() => mockMapInstance),
  getContainer: vi.fn(() => ({ clientWidth: 400, clientHeight: 400 })),
  on: vi.fn(() => mockMapInstance),
  off: vi.fn(() => mockMapInstance),
  addLayer: vi.fn(() => mockMapInstance),
  removeLayer: vi.fn(() => mockMapInstance),
};

vi.mock('leaflet', () => ({
  default: {
    CRS: {
      Simple: {},
    },
    map: vi.fn(() => mockMapInstance),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    imageOverlay: vi.fn(() => ({ addTo: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ addTo: vi.fn() })),
    circleMarker: vi.fn(() => ({ addTo: vi.fn() })),
    polyline: vi.fn(() => ({ addTo: vi.fn() })),
    tooltip: vi.fn(() => ({ addTo: vi.fn() })),
    Util: {
      debounce: vi.fn((fn) => fn),
    },
  },
}));

// ── react-leaflet Mock ───────────────────────────────────────────────────────
// We mock react-leaflet to render minimal components and provide a mock map
// context for child components that use useMap().

vi.mock('react-leaflet', () => {
  const React = require('react');
  
  // Map context for useMap() hook
  const MapContext = React.createContext(null);
  
  return {
    MapContainer: ({ children, ...props }) => {
      return React.createElement('div', { 
        'data-testid': 'map-container',
        ...props 
      }, children);
    },
    TileLayer: () => null,
    ImageOverlay: () => null,
    CircleMarker: ({ children, center, ...props }) => {
      return React.createElement('div', {
        'data-testid': 'circle-marker',
        'data-center': JSON.stringify(center),
        ...props,
      }, children);
    },
    Marker: ({ children, position, ...props }) => {
      return React.createElement('div', {
        'data-testid': 'marker',
        'data-position': JSON.stringify(position),
        ...props,
      }, children);
    },
    Polyline: ({ positions, ...props }) => {
      return React.createElement('div', {
        'data-testid': 'polyline',
        'data-positions': JSON.stringify(positions),
        ...props,
      });
    },
    Tooltip: ({ children, ...props }) => {
      return React.createElement('div', {
        'data-testid': 'tooltip',
        ...props,
      }, children);
    },
    Popup: ({ children, ...props }) => {
      return React.createElement('div', {
        'data-testid': 'popup',
        ...props,
      }, children);
    },
    useMap: () => mockMapInstance,
    useMapEvents: () => mockMapInstance,
    MapContext,
  };
});

// ── Global Test Utilities ─────────────────────────────────────────────────────
// Expose the mock map instance for test assertions

global.mockMapInstance = mockMapInstance;

// Reset mocks between tests
beforeEach(() => {
  mockMapInstance.flyTo.mockClear();
  mockMapInstance.panTo.mockClear();
  mockMapInstance.setView.mockClear();
  mockMapInstance.setZoom.mockClear();
  mockMapInstance.getZoom.mockClear();
  mockMapInstance.getCenter.mockClear();
  mockMapInstance.setMinZoom.mockClear();
  mockMapInstance.invalidateSize.mockClear();
  mockMapInstance.on.mockClear();
  mockMapInstance.off.mockClear();
});

// ── Mock window.matchMedia ────────────────────────────────────────────────────
// jsdom doesn't implement matchMedia

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── Mock window.scrollTo ──────────────────────────────────────────────────────
// jsdom doesn't implement scrollTo

window.scrollTo = vi.fn();

// ── Mock ResizeObserver ───────────────────────────────────────────────────────
// Required for some UI components

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ── Mock IntersectionObserver ─────────────────────────────────────────────────
// Required for some UI components

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ── Mock API module ────────────────────────────────────────────────────────────
// Common API mocks needed by many tests

vi.mock('../api/index.js', () => ({
  fetchFloor: vi.fn().mockResolvedValue({}),
  fetchFloors: vi.fn().mockResolvedValue([]),
  computeRoute: vi.fn().mockResolvedValue({ path: [], totalDistance: 0, instructions: [] }),
  scanQR: vi.fn().mockResolvedValue({ nodeId: 1, label: 'Test', floorId: 1 }),
  logEvent: vi.fn(),
  searchPOIs: vi.fn().mockResolvedValue([]),
  getCachedQrCheckpoints: vi.fn().mockReturnValue([]),
  getCachedGraph: vi.fn().mockReturnValue(null),
  normalizeQrPayload: vi.fn((code) => code),
  setOfflineHandler: vi.fn(),
  getCacheMetadata: vi.fn().mockReturnValue(null),
  flushEventQueue: vi.fn(),
  healthPing: vi.fn().mockResolvedValue(true),
  saveFloorViewport: vi.fn(),
  getFloorViewport: vi.fn().mockReturnValue(null),
  fetchAllQrCodes: vi.fn().mockResolvedValue([]),
}));

// ── Mock useNavStore ───────────────────────────────────────────────────────────
// Provide minimal mock of the navigation store

const mockStore = {
  status: 'UNLOCATED',
  currentNode: null,
  floor: null,
  floorsById: new Map(),
  setOfflineStatus: vi.fn(),
  setState: vi.fn((state) => Object.assign(mockStore, state)),
  getState: () => mockStore,
  getInitialState: () => ({ status: 'UNLOCATED', currentNode: null, floor: null, floorsById: new Map() }),
};

vi.mock('../store/useNavStore.js', () => ({
  __esModule: true,
  default: vi.fn(() => mockStore),
}));
// ── Make React available globally for JSX in tests ─────────────────────────────
// Some components don't explicitly import React, relying on the new JSX transform
// We make React global so tests can render these components without issues
import React from 'react';
global.React = React;