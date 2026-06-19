/**
 * Bug Condition Exploration Test: Begin Navigation viewport sync
 * 
 * **Property 5: Bug Condition** - Begin Navigation synchronises the viewport
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * 
 * GOAL: Surface counterexamples showing no camera/floor sync on ROUTE_PREVIEW → NAVIGATING
 * 
 * Scoped PBT Approach: Scope to the concrete `begin_navigation` input from `ROUTE_PREVIEW`
 * 
 * Assert `map.flyTo`/`map.setView` is invoked targeting the starting node's position 
 * and the active floor matches the start node when "Begin Navigation" is tapped.
 * 
 * **Validates: Requirements 1.10**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { createFloor, createRoute, NAVIGATION_STATUS } from './testHelpers.js';

// Mock the store
const mockBeginNavigation = vi.fn();
const mockSelectDestination = vi.fn(() => Promise.resolve());
const mockCancelNavigation = vi.fn();
const mockAdvanceStep = vi.fn();
const mockAnchorNode = vi.fn(() => Promise.resolve());
const mockSwitchFloor = vi.fn();
const mockUpdateLocation = vi.fn();
const mockSetError = vi.fn();

const createMockStore = (overrides = {}) => {
  const floor = createFloor(1, 1, 'Ground Floor');
  const route = createRoute('node-1', 'node-3', [
    { turn: 'straight', text: 'Go straight', distance: 50, nodeId: 'node-1' },
    { turn: 'left', text: 'Turn left', distance: 30, nodeId: 'node-2' },
    { turn: 'right', text: 'Turn right', distance: 20, nodeId: 'node-3' },
  ]);
  
  return {
    // State
    status: NAVIGATION_STATUS.ROUTE_PREVIEW,
    floor,
    currentFloorId: 1,
    currentNodeId: 'node-1',
    currentNode: floor.nodes[0],
    destinationNodeId: 'node-3',
    destinationNode: floor.nodes[2],
    route,
    currentStep: 0,
    progress: 0,
    remainingDistance: 100,
    routeLoading: false,
    routeError: null,
    error: null,
    searchQuery: '',
    searchResults: [],
    searchLoading: false,
    isSelectingLocation: false,
    
    // Actions
    beginNavigation: mockBeginNavigation,
    selectDestination: mockSelectDestination,
    cancelNavigation: mockCancelNavigation,
    advanceStep: mockAdvanceStep,
    anchorNode: mockAnchorNode,
    switchFloor: mockSwitchFloor,
    updateLocation: mockUpdateLocation,
    setError: mockSetError,
    
    ...overrides,
  };
};

// Mock the store module
vi.mock('../store/useNavStore.js', () => {
  return {
    default: vi.fn((selector) => {
      const state = global.mockStoreState;
      return selector ? selector(state) : state;
    }),
    __esModule: true,
  };
});

describe('Begin Navigation viewport sync - Bug Condition Exploration', () => {
  let mockMapInstance;
  
  beforeEach(() => {
    // Clear mock call history
    mockBeginNavigation.mockClear();
    mockSelectDestination.mockClear();
    mockCancelNavigation.mockClear();
    mockAdvanceStep.mockClear();
    mockAnchorNode.mockClear();
    mockSwitchFloor.mockClear();
    mockUpdateLocation.mockClear();
    mockSetError.mockClear();
    
    // Get the mock map instance from setup.js
    mockMapInstance = global.mockMapInstance;
    mockMapInstance.flyTo.mockClear();
    mockMapInstance.setView.mockClear();
    
    // Set initial store state for ROUTE_PREVIEW with a route
    global.mockStoreState = createMockStore();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  /**
   * TEST: Begin Navigation should sync viewport to start node
   * 
   * This test validates that when "Begin Navigation" is tapped from ROUTE_PREVIEW,
   * the map viewport should fly to the starting node's position.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL (no camera move occurs)
   * EXPECTED AFTER FIX: PASS (camera flies to start node)
   */
  it('should move camera to start node position when Begin Navigation is tapped', async () => {
    // Import the component after mocks are set up
    const { default: FloorMap } = await import('../components/FloorMap.jsx');
    const { default: BottomSheet } = await import('../components/BottomSheet.jsx');
    
    // The floor has node-1 at position [100, 100] (after toLatLng conversion with maxY=600)
    // maxY from createFloor bounds is 600 (default from testHelpers doesn't set it)
    // Actually we need to set proper bounds
    const floorWithBounds = {
      ...createFloor(1, 1, 'Ground Floor'),
      bounds: { maxY: 600, maxX: 600 },
    };
    
    // Update store with floor that has bounds
    global.mockStoreState = createMockStore({ floor: floorWithBounds });
    
    // Render FloorMap to get the map context set up
    const { unmount: unmountMap } = render(<FloorMap />);
    
    // Wait for map to be ready
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Clear any calls that happened during render
    mockMapInstance.flyTo.mockClear();
    mockMapInstance.setView.mockClear();
    
    // Simulate clicking "Begin Navigation" button
    // This button exists in BottomSheet when status is ROUTE_PREVIEW
    // We'll call beginNavigation directly to simulate the action
    const store = global.mockStoreState;
    
    // Call beginNavigation (this is what happens when user taps the button)
    await act(async () => {
      store.beginNavigation();
    });
    
    // After beginNavigation, status changes to NAVIGATING
    // The viewport should sync to the starting node's position
    global.mockStoreState = {
      ...store,
      status: NAVIGATION_STATUS.NAVIGATING,
    };
    
    // Wait for any effects to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // ASSERTION: map.flyTo should have been called targeting the start node position
    // The start node (node-1) is at x:100, y:100 in pixel coords
    // toLatLng converts to: [maxY - y, x] = [600 - 100, 100] = [500, 100]
    const expectedPosition = [500, 100]; // [lat, lng] = [maxY - y, x]
    
    // This assertion will FAIL on unfixed code because no flyTo is triggered
    expect(mockMapInstance.flyTo).toHaveBeenCalled();
    
    // Verify it was called with the correct position
    const flyToCalls = mockMapInstance.flyTo.mock.calls;
    expect(flyToCalls.length).toBeGreaterThan(0);
    
    const lastCall = flyToCalls[flyToCalls.length - 1];
    const calledPosition = lastCall[0]; // First arg is position [lat, lng]
    
    expect(calledPosition[0]).toBeCloseTo(expectedPosition[0], 0); // lat
    expect(calledPosition[1]).toBeCloseTo(expectedPosition[1], 0); // lng
    
    unmountMap();
  });
  
  /**
   * TEST: Begin Navigation should sync floor to start node's floor
   * 
   * This test validates that when the start node is on a different floor,
   * the active floor should switch to match.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL (no floor switch occurs)
   * EXPECTED AFTER FIX: PASS (floor switches to start node's floor)
   */
  it('should switch to start node floor when Begin Navigation is tapped', async () => {
    // Create a route where start node is on Floor 2
    const floor1 = { ...createFloor(1, 1, 'Ground Floor'), bounds: { maxY: 600, maxX: 600 } };
    const floor2 = { 
      ...createFloor(2, 2, 'Floor 2'), 
      floorId: 2,
      bounds: { maxY: 600, maxX: 600 },
      nodes: [
        { id: 'node-101', x: 100, y: 100, label: 'Elevator', type: 'transition' },
        { id: 'node-102', x: 200, y: 200, label: 'Office B', type: 'destination' },
      ],
    };
    
    // Route from node-101 on Floor 2 to node-3 on Floor 1
    const crossFloorRoute = createRoute('node-101', 'node-3', [
      { turn: 'straight', text: 'Go to elevator', distance: 20, nodeId: 'node-101', floorId: 2 },
      { turn: 'straight', text: 'Take elevator down', distance: 30, nodeId: 'node-1', floorId: 1 },
      { turn: 'right', text: 'Turn right', distance: 20, nodeId: 'node-3', floorId: 1 },
    ]);
    
    // Store state: anchored at node-101 on Floor 2, with cross-floor route
    global.mockStoreState = {
      ...createMockStore(),
      status: NAVIGATION_STATUS.ROUTE_PREVIEW,
      floor: floor2,
      currentFloorId: 2,
      currentNodeId: 'node-101',
      currentNode: floor2.nodes[0], // node-101 on Floor 2
      destinationNodeId: 'node-3',
      destinationNode: floor1.nodes[2],
      route: crossFloorRoute,
    };
    
    const { default: FloorMap } = await import('../components/FloorMap.jsx');
    
    const { unmount } = render(<FloorMap />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Clear any calls from render
    mockMapInstance.flyTo.mockClear();
    mockSwitchFloor.mockClear();
    
    // Simulate Begin Navigation
    await act(async () => {
      global.mockStoreState.beginNavigation();
    });
    
    // After beginNavigation, status should be NAVIGATING
    global.mockStoreState = {
      ...global.mockStoreState,
      status: NAVIGATION_STATUS.NAVIGATING,
    };
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // ASSERTION: switchFloor should have been called with the start node's floor (Floor 2)
    // OR the viewport should have synced to the start node's position on that floor
    // 
    // On unfixed code: switchFloor is NOT called, so this should FAIL
    expect(mockSwitchFloor).toHaveBeenCalledWith(2);
    
    unmount();
  });
  
  /**
   * TEST: Camera should move even when currentNode doesn't change
   * 
   * This is the core bug: beginNavigation doesn't change currentNode,
   * so FlyToPosition doesn't trigger. The viewport sync needs to happen
   * explicitly on the ROUTE_PREVIEW → NAVIGATING transition.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL (no camera movement)
   * EXPECTED AFTER FIX: PASS (explicit sync on status change)
   */
  it('should sync viewport on ROUTE_PREVIEW to NAVIGATING transition even when currentNode unchanged', async () => {
    const floorWithBounds = {
      ...createFloor(1, 1, 'Ground Floor'),
      bounds: { maxY: 600, maxX: 600 },
    };
    
    global.mockStoreState = createMockStore({ floor: floorWithBounds });
    
    const { default: FloorMap } = await import('../components/FloorMap.jsx');
    
    const { unmount } = render(<FloorMap />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    mockMapInstance.flyTo.mockClear();
    
    // Directly simulate status change to NAVIGATING without calling beginNavigation
    // This simulates what happens after beginNavigation completes
    await act(async () => {
      // Trigger the status change effect that should exist in a fixed version
      // In unfixed code, there's no such effect
      window.dispatchEvent(new CustomEvent('navigation:begin', { 
        detail: { startNodeId: 'node-1', startFloorId: 1 } 
      }));
    });
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // On unfixed code: no flyTo occurs because there's no effect listening for this
    // On fixed code: an effect should listen for navigation:begin and fly to start position
    const flyToCalled = mockMapInstance.flyTo.mock.calls.length > 0;
    
    // This will FAIL on unfixed code
    expect(flyToCalled).toBe(true);
    
    unmount();
  });
});