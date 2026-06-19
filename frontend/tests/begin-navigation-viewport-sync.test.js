/**
 * Bug Condition Exploration Test — Begin Navigation Viewport Sync
 * Task 6: Property 5: Bug Condition — Begin Navigation synchronises the viewport
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * **Validates: Requirements 1.10, 2.10**
 * 
 * Bug condition: When "Begin Navigation" is tapped from ROUTE_PREVIEW → NAVIGATING,
 * the system does not immediately synchronize the map viewport/camera and floor to 
 * the correct starting floor and position.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as h } from 'react';

// Import the store to manipulate state
import useNavStore from '../src/store/useNavStore.js';

// Import FloorMap component
import FloorMap from '../src/components/FloorMap.jsx';

// Create a wrapper component that provides store context
function TestWrapper({ children }) {
  return h('div', { 
    'data-testid': 'test-wrapper',
    style: { width: '400px', height: '400px' }
  }, children);
}

// Helper to create a minimal floor object for testing
function createTestFloor(floorId = 1, floorName = 'Ground Floor') {
  return {
    floorId,
    floorName,
    bounds: { maxY: 1400, maxX: 2000 },
    imageUrl: `/assets/floorplans/floor-${floorId}.png`,
    nodes: [
      { id: 1, label: 'Start Node', x: 200, y: 400, type: 'qr_anchor', floor_id: floorId },
      { id: 2, label: 'Junction', x: 400, y: 400, type: 'junction', floor_id: floorId },
      { id: 3, label: 'End Node', x: 600, y: 800, type: 'poi', floor_id: floorId },
    ],
    pois: [
      { id: 1, name: 'Destination', node_id: 3, category: 'poi' }
    ],
    qrCodes: [
      { node_id: 1, qr_code: 'QR001', label: 'Start QR' }
    ],
  };
}

// Helper to create a minimal route between nodes
function createTestRoute(startNodeId, endNodeId) {
  return {
    path: [startNodeId, 2, endNodeId],
    instructions: [
      { step: 1, turn: 'start', nodeId: startNodeId, distance: 0, text: 'Start here' },
      { step: 2, turn: 'straight', nodeId: 2, distance: 100, text: 'Walk straight' },
      { step: 3, turn: 'destination', nodeId: endNodeId, distance: 150, text: 'Arrive' },
    ],
    totalDistance: 250,
  };
}

describe('Bug Condition — Begin Navigation synchronises the viewport', () => {
  let mockMapInstance;

  beforeEach(() => {
    // Get the mock map instance from the global setup
    mockMapInstance = global.mockMapInstance;
    
    // Reset the store to initial state
    useNavStore.setState({
      ...useNavStore.getInitialState(),
      floor: createTestFloor(1),
      floorsById: new Map([[1, createTestFloor(1)]]),
      currentFloorId: 1,
    });
    
    // Clear all mock calls
    vi.clearAllMocks();
  });

  describe('Property 5: Bug Condition — Begin Navigation synchronises the viewport', () => {
    it('should fly to starting node position when "Begin Navigation" is tapped', async () => {
      /**
       * COUNTEREXAMPLE GOAL:
       * Demonstrate that on ROUTE_PREVIEW → NAVIGATING transition,
       * the map does NOT call flyTo/setView targeting the starting node.
       * 
       * EXPECTED ON UNFIXED CODE: Test FAILS — no flyTo/setView called
       * EXPECTED ON FIXED CODE: Test PASSES — flyTo/setView called with start node position
       */

      // Setup: Anchor at node 1 and select destination at node 3
      const floor = createTestFloor(1);
      const startNode = floor.nodes.find(n => n.id === 1);
      const destNode = floor.nodes.find(n => n.id === 3);
      const route = createTestRoute(1, 3);
      
      // Set store to ROUTE_PREVIEW state (ready for begin navigation)
      useNavStore.setState({
        floor,
        floorsById: new Map([[1, floor]]),
        currentFloorId: 1,
        currentNodeId: startNode.id,
        currentNode: startNode,
        destinationNodeId: destNode.id,
        destinationNode: destNode,
        route,
        status: 'ROUTE_PREVIEW',
        currentStep: 0,
        progress: 0,
        routeLoading: false,
        routeError: null,
      });

      // Render the FloorMap component
      const { container } = render(
        h(TestWrapper, null,
          h(FloorMap)
        )
      );

      // Wait for the map to render
      await waitFor(() => {
        expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
      });

      // Clear any flyTo calls from initial render/setup
      mockMapInstance.flyTo.mockClear();
      mockMapInstance.setView.mockClear();

      // Trigger the ROUTE_PREVIEW → NAVIGATING transition by calling beginNavigation
      act(() => {
        useNavStore.getState().beginNavigation();
      });

      // Wait for any effects to run
      await waitFor(() => {
        // Status should be NAVIGATING
        expect(useNavStore.getState().status).toBe('NAVIGATING');
      });

      // THE CRITICAL ASSERTION:
      // On FIXED code: map.flyTo or map.setView SHOULD be called to sync viewport
      // On UNFIXED code: map.flyTo or map.setView will NOT be called
      // 
      // The starting node (id=1) is at coordinates:
      // - x: 200, y: 400
      // - In Leaflet CRS.Simple coords: [maxY - y, x] = [1400 - 400, 200] = [1000, 200]
      
      const expectedStartLat = floor.bounds.maxY - startNode.y; // 1400 - 400 = 1000
      const expectedStartLng = startNode.x; // 200

      // This assertion will FAIL on unfixed code (bug confirmed)
      // It will PASS on fixed code (bug fixed)
      const flyToCalled = mockMapInstance.flyTo.mock.calls.length > 0;
      const setViewCalled = mockMapInstance.setView.mock.calls.length > 0;

      // Log for debugging
      if (!flyToCalled && !setViewCalled) {
        console.log('BUG CONFIRMED: No viewport sync on begin navigation');
        console.log('Expected flyTo/setView to be called with start node position:');
        console.log(`  Expected position: [${expectedStartLat}, ${expectedStartLng}]`);
      }

      // CRITICAL: This assertion MUST fail on unfixed code
      expect(flyToCalled || setViewCalled).toBe(true);

      // If called, verify it targets the correct position
      if (flyToCalled) {
        const lastCall = mockMapInstance.flyTo.mock.calls[mockMapInstance.flyTo.mock.calls.length - 1];
        const [calledPosition] = lastCall;
        // Allow some tolerance for coordinate calculations
        expect(calledPosition[0]).toBeCloseTo(expectedStartLat, -1);
        expect(calledPosition[1]).toBeCloseTo(expectedStartLng, -1);
      } else if (setViewCalled) {
        const lastCall = mockMapInstance.setView.mock.calls[mockMapInstance.setView.mock.calls.length - 1];
        const [calledPosition] = lastCall;
        expect(calledPosition[0]).toBeCloseTo(expectedStartLat, -1);
        expect(calledPosition[1]).toBeCloseTo(expectedStartLng, -1);
      }
    });

    it('should switch to the correct floor when begin navigation starts on a different floor', async () => {
      /**
       * COUNTEREXAMPLE GOAL:
       * Demonstrate that on ROUTE_PREVIEW → NAVIGATING transition,
       * if the user is viewing a different floor, the system does NOT 
       * automatically switch to the starting node's floor.
       * 
       * EXPECTED ON UNFIXED CODE: Test FAILS — floor not switched
       * EXPECTED ON FIXED CODE: Test PASSES — floor switched to start node's floor
       */

      // Create two floors
      const floor1 = createTestFloor(1, 'Ground Floor');
      const floor2 = createTestFloor(2, 'Second Floor');
      
      // Start node is on floor 2
      const startNode = { id: 101, label: 'Start on F2', x: 300, y: 500, type: 'qr_anchor', floor_id: 2 };
      floor2.nodes.push(startNode);
      
      const destNode = floor1.nodes.find(n => n.id === 3);
      
      // Route from F2 to F1
      const route = {
        path: [101, 2, 3],
        instructions: [
          { step: 1, turn: 'start', nodeId: 101, floorId: 2, distance: 0, text: 'Start on Floor 2' },
          { step: 2, turn: 'take_elevator', nodeId: 2, floorId: 1, distance: 100, text: 'Take elevator down' },
          { step: 3, turn: 'destination', nodeId: 3, floorId: 1, distance: 50, text: 'Arrive' },
        ],
        totalDistance: 150,
      };

      // Set store to ROUTE_PREVIEW with user viewing floor 1, but start node on floor 2
      useNavStore.setState({
        floor: floor1, // User is viewing floor 1
        floorsById: new Map([[1, floor1], [2, floor2]]),
        currentFloorId: 1, // Currently viewing floor 1
        currentNodeId: startNode.id,
        currentNode: startNode,
        destinationNodeId: destNode.id,
        destinationNode: destNode,
        route,
        status: 'ROUTE_PREVIEW',
        currentStep: 0,
        progress: 0,
        routeLoading: false,
        routeError: null,
      });

      // Render the FloorMap component
      const { container } = render(
        h(TestWrapper, null,
          h(FloorMap)
        )
      );

      // Wait for the map to render
      await waitFor(() => {
        expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
      });

      // Clear any calls from initial render
      mockMapInstance.flyTo.mockClear();
      mockMapInstance.setView.mockClear();

      // Trigger beginNavigation
      act(() => {
        useNavStore.getState().beginNavigation();
      });

      // Wait for status change
      await waitFor(() => {
        expect(useNavStore.getState().status).toBe('NAVIGATING');
      });

      // THE CRITICAL ASSERTION:
      // On FIXED code: currentFloorId should switch to 2 (start node's floor)
      // On UNFIXED code: currentFloorId stays at 1 (user's current view)
      const currentFloorId = useNavStore.getState().currentFloorId;

      // Log for debugging
      if (currentFloorId !== 2) {
        console.log('BUG CONFIRMED: Floor not switched to start node floor');
        console.log(`  Expected floor: 2 (start node floor)`);
        console.log(`  Actual floor: ${currentFloorId}`);
      }

      // CRITICAL: This assertion will FAIL on unfixed code
      expect(currentFloorId).toBe(2);
    });

    it('should fly to the starting node position at appropriate zoom level', async () => {
      /**
       * Additional test to verify zoom level is appropriate when beginning navigation.
       * The map should fly to a zoom level that shows context around the start position.
       */

      const floor = createTestFloor(1);
      const startNode = floor.nodes.find(n => n.id === 1);
      const destNode = floor.nodes.find(n => n.id === 3);
      const route = createTestRoute(1, 3);

      useNavStore.setState({
        floor,
        floorsById: new Map([[1, floor]]),
        currentFloorId: 1,
        currentNodeId: startNode.id,
        currentNode: startNode,
        destinationNodeId: destNode.id,
        destinationNode: destNode,
        route,
        status: 'ROUTE_PREVIEW',
        currentStep: 0,
        progress: 0,
        routeLoading: false,
        routeError: null,
      });

      const { container } = render(
        h(TestWrapper, null,
          h(FloorMap)
        )
      );

      await waitFor(() => {
        expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
      });

      mockMapInstance.flyTo.mockClear();
      mockMapInstance.setView.mockClear();

      act(() => {
        useNavStore.getState().beginNavigation();
      });

      await waitFor(() => {
        expect(useNavStore.getState().status).toBe('NAVIGATING');
      });

      // If flyTo was called, verify it has appropriate zoom
      if (mockMapInstance.flyTo.mock.calls.length > 0) {
        const lastCall = mockMapInstance.flyTo.mock.calls[mockMapInstance.flyTo.mock.calls.length - 1];
        const [, zoom] = lastCall;
        
        // Zoom should be defined and reasonable (not too far out, not too close)
        // The fit zoom for a 400x400 container with 2000x1400 image is approximately -1
        // We expect navigation to show some context, so zoom around -1 to 1 is reasonable
        if (zoom !== undefined) {
          expect(zoom).toBeGreaterThanOrEqual(-4); // Not too far out
          expect(zoom).toBeLessThanOrEqual(3); // Not too close
        }
      }
    });
  });

  describe('Preservation: Explicit re-center still works', () => {
    it('should still allow explicit re-center via map:recenter event', async () => {
      /**
       * Preservation test: Ensure that the explicit re-center functionality
       * (map:recenter event) still works and is not affected by the fix.
       */

      const floor = createTestFloor(1);
      const startNode = floor.nodes.find(n => n.id === 1);

      useNavStore.setState({
        floor,
        floorsById: new Map([[1, floor]]),
        currentFloorId: 1,
        currentNodeId: startNode.id,
        currentNode: startNode,
        status: 'ANCHORED',
      });

      const { container } = render(
        h(TestWrapper, null,
          h(FloorMap)
        )
      );

      await waitFor(() => {
        expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
      });

      mockMapInstance.flyTo.mockClear();

      // Dispatch explicit re-center event
      act(() => {
        window.dispatchEvent(new CustomEvent('map:recenter'));
      });

      await waitFor(() => {
        // The re-center event should trigger flyTo
        expect(mockMapInstance.flyTo).toHaveBeenCalled();
      });

      // Verify flyTo was called with correct position
      const lastCall = mockMapInstance.flyTo.mock.calls[mockMapInstance.flyTo.mock.calls.length - 1];
      const [position] = lastCall;
      const expectedLat = floor.bounds.maxY - startNode.y;
      const expectedLng = startNode.x;
      
      expect(position[0]).toBeCloseTo(expectedLat, -1);
      expect(position[1]).toBeCloseTo(expectedLng, -1);
    });
  });
});
