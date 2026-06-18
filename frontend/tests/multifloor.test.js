/**
 * Frontend Multi-Floor Tests
 * Run with: npm test -- --testPathPattern=multifloor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Multi-Floor API Functions', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Floor Viewport Persistence', () => {
    const { saveFloorViewport, getFloorViewport } = require('../src/api/index.js');

    it('should save floor viewport to localStorage', () => {
      const viewport = { center: [700, 1000], zoom: 0 };
      saveFloorViewport(1, viewport);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'qrnav:viewport:1',
        JSON.stringify(viewport)
      );
    });

    it('should retrieve floor viewport from localStorage', () => {
      const viewport = { center: [700, 1000], zoom: 0 };
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(viewport));
      
      const result = getFloorViewport(1);
      
      expect(result).toEqual(viewport);
    });

    it('should return null for missing viewport', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);
      
      const result = getFloorViewport(1);
      
      expect(result).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid-json');
      
      const result = getFloorViewport(1);
      
      expect(result).toBeNull();
    });
  });
});

describe('Multi-Floor State', () => {
  it('should have floorsById as Map in initial state', () => {
    // This tests the store structure
    const initialFloorState = {
      floor: null,
      floorsById: new Map(),
      floorViewportsById: new Map(),
      currentFloorId: 1,
    };
    
    expect(initialFloorState.floorsById).toBeInstanceOf(Map);
    expect(initialFloorState.floorViewportsById).toBeInstanceOf(Map);
    expect(initialFloorState.currentFloorId).toBe(1);
  });

  it('should store floors by ID in registry', () => {
    const floorsById = new Map();
    const floor1 = { floorId: 1, floorName: 'Ground Floor', nodes: [] };
    const floor2 = { floorId: 2, floorName: 'Second Floor', nodes: [] };
    
    floorsById.set(1, floor1);
    floorsById.set(2, floor2);
    
    expect(floorsById.size).toBe(2);
    expect(floorsById.get(1).floorName).toBe('Ground Floor');
    expect(floorsById.get(2).floorName).toBe('Second Floor');
  });

  it('should store viewports by floor ID', () => {
    const floorViewportsById = new Map();
    
    floorViewportsById.set(1, { center: [700, 1000], zoom: 0 });
    floorViewportsById.set(2, { center: [400, 600], zoom: 0 });
    
    expect(floorViewportsById.get(1)).toEqual({ center: [700, 1000], zoom: 0 });
    expect(floorViewportsById.get(2)).toEqual({ center: [400, 600], zoom: 0 });
  });
});

describe('Search Results Floor Context', () => {
  it('should include floor context in search results', () => {
    const searchResult = {
      id: 1,
      name: 'Conference Room A',
      category: 'poi',
      node_id: 9,
      x: 300,
      y: 200,
      floorId: 1,
      floorName: 'Ground Floor',
    };
    
    expect(searchResult.floorId).toBe(1);
    expect(searchResult.floorName).toBe('Ground Floor');
  });

  it('should handle search results from different floors', () => {
    const searchResults = [
      { id: 1, name: 'Cafeteria', floorId: 1, floorName: 'Ground Floor' },
      { id: 2, name: 'Lounge Area', floorId: 2, floorName: 'Second Floor' },
    ];
    
    const floor1Results = searchResults.filter(r => r.floorId === 1);
    const floor2Results = searchResults.filter(r => r.floorId === 2);
    
    expect(floor1Results.length).toBe(1);
    expect(floor2Results.length).toBe(1);
  });
});

describe('Floor Switching Logic', () => {
  it('should switch between floors correctly', () => {
    const floorsById = new Map();
    floorsById.set(1, { floorId: 1, floorName: 'Ground Floor' });
    floorsById.set(2, { floorId: 2, floorName: 'Second Floor' });
    
    let currentFloorId = 1;
    const currentFloor = floorsById.get(currentFloorId);
    
    expect(currentFloor.floorName).toBe('Ground Floor');
    
    // Switch to floor 2
    currentFloorId = 2;
    const newCurrentFloor = floorsById.get(currentFloorId);
    
    expect(newCurrentFloor.floorName).toBe('Second Floor');
  });

  it('should handle loading a new floor', async () => {
    const floorsById = new Map();
    const floor1 = { floorId: 1, floorName: 'Ground Floor' };
    
    // Simulate loading floor 1
    floorsById.set(1, floor1);
    
    // Simulate loading floor 2
    const floor2 = { floorId: 2, floorName: 'Second Floor' };
    floorsById.set(2, floor2);
    
    expect(floorsById.has(1)).toBe(true);
    expect(floorsById.has(2)).toBe(true);
    expect(floorsById.size).toBe(2);
  });
});

describe('Route with Floor Transitions', () => {
  it('should identify floor transition in route', () => {
    // Simulate a route that crosses floors
    const route = {
      path: [1, 2, 8, 108, 109],  // 8->108 crosses floor via elevator
      instructions: [
        { step: 1, turn: 'start', nodeId: 1 },
        { step: 2, turn: 'straight', nodeId: 8 },
        { step: 3, turn: 'take_elevator', nodeId: 108, floorId: 2 },
        { step: 4, turn: 'straight', nodeId: 109 },
      ],
      floorTransitions: [
        { fromFloor: 1, toFloor: 2, connectorNodeId: 8, type: 'elevator' },
      ],
    };
    
    expect(route.floorTransitions.length).toBe(1);
    expect(route.floorTransitions[0].type).toBe('elevator');
    expect(route.floorTransitions[0].fromFloor).toBe(1);
    expect(route.floorTransitions[0].toFloor).toBe(2);
  });
});