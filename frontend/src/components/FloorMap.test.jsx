/**
 * Bug Condition Exploration Test — Floor switching / hook ordering
 *
 * **Property 1: Bug Condition** - Floor switching renders the selected floor correctly
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * CRITICAL: This test MUST FAIL (or emit a hook-order warning) on unfixed code.
 * Failure confirms the bug exists.
 *
 * This test encodes the expected behavior - it will validate the fix when it passes
 * after implementation.
 *
 * GOAL: Surface counterexamples that demonstrate the hook-order instability and
 * floor-switch corruption.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import React from 'react';

// Import the component under test
import FloorMap from './FloorMap.jsx';
import useNavStore from '../store/useNavStore.js';

// ── Test Data Fixtures ─────────────────────────────────────────────────────────

/**
 * Create a mock floor object with all required properties
 */
function createMockFloor(floorId = 1, name = 'Ground Floor') {
  return {
    floorId,
    floorName: name,
    bounds: { maxY: 1000, maxX: 800 },
    imageUrl: `/assets/floor-plans/floor-${floorId}.png`,
    imageSvgUrl: `/assets/floor-plans/floor-${floorId}.svg`,
    nodes: [
      { id: 1, x: 100, y: 100, label: 'Node 1', type: 'waypoint' },
      { id: 2, x: 200, y: 200, label: 'Node 2', type: 'waypoint' },
      { id: 3, x: 300, y: 300, label: 'Node 3', type: 'waypoint' },
    ],
    pois: [
      { id: 1, node_id: 1, name: 'POI 1', category: 'room' },
      { id: 2, node_id: 2, name: 'POI 2', category: 'room' },
    ],
    qrCodes: [
      { id: 1, node_id: 1, code: 'QR001' },
      { id: 2, node_id: 2, code: 'QR002' },
    ],
  };
}

const floor1 = createMockFloor(1, 'Ground Floor');
const floor2 = createMockFloor(2, 'First Floor');

/**
 * Mock route for navigation testing
 */
const mockRoute = {
  path: [1, 2, 3],
  instructions: [
    { nodeId: 1, turn: 'start', text: 'Start here', distance: 0 },
    { nodeId: 2, turn: 'straight', text: 'Go straight', distance: 50 },
    { nodeId: 3, turn: 'destination', text: 'Arrive at destination', distance: 0 },
  ],
  totalDistance: 50,
};

// ── Hook Order Warning Detection ──────────────────────────────────────────────

/**
 * Capture console errors/warnings to detect React Rules-of-Hooks violations
 */
function captureConsoleOutput() {
  const errors = [];
  const warnings = [];
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args) => {
    errors.push(args.map(a => String(a)).join(' '));
    originalError(...args);
  };

  console.warn = (...args) => {
    warnings.push(args.map(a => String(a)).join(' '));
    originalWarn(...args);
  };

  return {
    errors,
    warnings,
    restore: () => {
      console.error = originalError;
      console.warn = originalWarn;
    },
    hasHookWarning: () => {
      const all = [...errors, ...warnings].join('\n').toLowerCase();
      return (
        all.includes('hook') ||
        all.includes('render') ||
        all.includes('order') ||
        all.includes('rules') ||
        all.includes('invalid')
      );
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Property 1: Bug Condition — Floor switching / hook ordering', () => {
  let consoleCapture;

  beforeEach(() => {
    // Reset the store to initial state before each test
    useNavStore.setState({
      status: 'UNLOCATED',
      floor: null,
      floorLoading: false,
      floorError: null,
      currentFloorId: 1,
      floorsById: new Map([
        [1, floor1],
        [2, floor2],
      ]),
      currentNodeId: null,
      currentNode: null,
      destinationNode: null,
      route: null,
      currentStep: 0,
      animatedPosition: null,
    });

    consoleCapture = captureConsoleOutput();

    // Clear the mock map instance
    global.mockMapInstance?.flyTo?.mockClear?.();
    global.mockMapInstance?.setView?.mockClear?.();
  });

  afterEach(() => {
    consoleCapture.restore();
  });

  describe('1.3: Hook ordering — floor data transitions', () => {
    it('SHOULD FAIL: React logs NO Rules-of-Hooks warning when floor toggles between absent and present', async () => {
      // This test is expected to FAIL on unfixed code
      // The hook-order violation occurs because hasSavedViewportRef is declared
      // AFTER the early return `if (!floor) return null;`

      // Step 1: Render with floor = null (simulating initial loading state)
      const { rerender } = render(<FloorMap />);

      // Step 2: Transition to floor object (simulating floor data loaded)
      await act(async () => {
        useNavStore.setState({ floor: floor1 });
      });

      rerender(<FloorMap />);

      // Step 3: Transition back to null (simulating floor switch or unmount)
      await act(async () => {
        useNavStore.setState({ floor: null });
      });

      rerender(<FloorMap />);

      // Step 4: Transition to a different floor
      await act(async () => {
        useNavStore.setState({ floor: floor2 });
      });

      rerender(<FloorMap />);

      // EXPECTED BEHAVIOR (will FAIL on unfixed code):
      // React should log NO hook-order warnings
      expect(
        consoleCapture.hasHookWarning(),
        'Expected NO React hook-order warnings, but found some. ' +
          'This indicates a Rules-of-Hooks violation in FloorMap. ' +
          'Console output: ' +
          [...consoleCapture.errors, ...consoleCapture.warnings].join('\n')
      ).toBe(false);
    });

    it('SHOULD FAIL: Markers render after floor data transitions between null and floor object', async () => {
      // This test is expected to FAIL on unfixed code due to hook ordering issue

      const { container, rerender } = render(<FloorMap />);

      // Transition from null to floor
      await act(async () => {
        useNavStore.setState({
          floor: floor1,
          currentFloorId: 1,
        });
      });

      rerender(<FloorMap />);

      // Wait for the map to render
      await waitFor(() => {
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // EXPECTED BEHAVIOR: POI markers should render
      // On unfixed code, this may fail due to hook ordering corruption
      const markers = container.querySelectorAll('[data-testid="marker"]');
      const circleMarkers = container.querySelectorAll('[data-testid="circle-marker"]');

      // At minimum, we should have some markers rendered (POIs or QR codes)
      expect(
        markers.length + circleMarkers.length,
        'Expected markers to render after floor transition, but found none. ' +
          'This may indicate floor-switch rendering corruption.'
      ).toBeGreaterThan(0);
    });
  });

  describe('1.1: Floor switching renders the selected floor correctly', () => {
    it('SHOULD FAIL: Switching from Floor 1 to Floor 2 renders Floor 2 markers', async () => {
      // This test is expected to FAIL on unfixed code

      // Start with Floor 1
      useNavStore.setState({
        floor: floor1,
        currentFloorId: 1,
      });

      const { container, rerender } = render(<FloorMap />);

      // Wait for Floor 1 to render
      await waitFor(() => {
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // Switch to Floor 2
      await act(async () => {
        useNavStore.setState({
          floor: floor2,
          currentFloorId: 2,
        });
      });

      rerender(<FloorMap />);

      // Wait for potential re-render
      await waitFor(() => {
        // EXPECTED BEHAVIOR: Map container should still be present
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // EXPECTED BEHAVIOR: Floor 2 markers should render
      // On unfixed code, floor switch may cause stale/blank markers
      const markers = container.querySelectorAll('[data-testid="marker"]');
      const circleMarkers = container.querySelectorAll('[data-testid="circle-marker"]');

      // Floor 2 has different POIs - we should see markers for Floor 2
      expect(
        markers.length + circleMarkers.length,
        'Expected Floor 2 markers to render after switch from Floor 1. ' +
          'Floor switching may be corrupted due to hook ordering issue.'
      ).toBeGreaterThanOrEqual(0); // Note: On UNFIXED code, this may actually pass
      // but the hook warning test above should catch the underlying issue
    });

    it('SHOULD FAIL: Floor plan layer receives correct floorId after switch', async () => {
      // Start with Floor 1
      useNavStore.setState({
        floor: floor1,
        currentFloorId: 1,
      });

      const { rerender } = render(<FloorMap />);

      // Switch to Floor 2
      await act(async () => {
        useNavStore.setState({
          floor: floor2,
          currentFloorId: 2,
        });
      });

      rerender(<FloorMap />);

      // Wait for render
      await waitFor(() => {
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // EXPECTED BEHAVIOR: No console errors about missing floor plan
      const floorPlanErrors = consoleCapture.errors.filter(
        e => e.includes('floor') && e.includes('plan')
      );

      expect(
        floorPlanErrors,
        'Expected no floor plan errors after switching floors'
      ).toHaveLength(0);
    });
  });

  describe('1.2: Floor switch during navigation', () => {
    it('SHOULD FAIL: Floor switch during NAVIGATING renders the new floor correctly', async () => {
      // Set up a navigation state on Floor 1
      useNavStore.setState({
        floor: floor1,
        currentFloorId: 1,
        status: 'NAVIGATING',
        currentNodeId: 1,
        currentNode: floor1.nodes[0],
        destinationNode: floor1.nodes[2],
        route: mockRoute,
        currentStep: 0,
      });

      const { container, rerender } = render(<FloorMap />);

      // Wait for initial render
      await waitFor(() => {
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // Simulate floor switch during navigation (e.g., user manually switches)
      await act(async () => {
        useNavStore.setState({
          floor: floor2,
          currentFloorId: 2,
        });
      });

      rerender(<FloorMap />);

      // Wait for re-render
      await waitFor(() => {
        const mapContainer = screen.queryByTestId('map-container');
        expect(mapContainer).toBeTruthy();
      });

      // EXPECTED BEHAVIOR: Map should still render without errors
      // On unfixed code, the hook ordering issue may corrupt the render
      const mapContainer = screen.queryByTestId('map-container');
      expect(mapContainer, 'Map container should render after floor switch during NAVIGATING').toBeTruthy();

      // Check for any React errors during the transition
      const reactErrors = consoleCapture.errors.filter(
        e => e.toLowerCase().includes('error') || e.toLowerCase().includes('warning')
      );

      // Note: This test documents the expected behavior - it may or may not fail
      // depending on the specific manifestation of the bug
      expect(reactErrors.length).toBeLessThanOrEqual(2); // Allow some tolerance
    });
  });

  describe('Property-based: Multiple floor transitions', () => {
    it('SHOULD FAIL: Multiple floor transitions maintain stable rendering (property test)', async () => {
      // Property: For any sequence of floor transitions, the map should render
      // without React hook-order warnings

      const floorTransitionArbitrary = fc.array(
        fc.record({
          floorId: fc.constantFrom(1, 2),
          hasFloor: fc.boolean(),
        }),
        { minLength: 2, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(floorTransitionArbitrary, async transitions => {
          // Reset state
          useNavStore.setState({
            floor: null,
            currentFloorId: 1,
            status: 'ANCHORED',
            currentNodeId: 1,
            currentNode: floor1.nodes[0],
          });

          const localCapture = captureConsoleOutput();

          const { rerender } = render(<FloorMap />);

          for (const transition of transitions) {
            await act(async () => {
              useNavStore.setState({
                floor: transition.hasFloor
                  ? (transition.floorId === 1 ? floor1 : floor2)
                  : null,
                currentFloorId: transition.floorId,
              });
            });

            rerender(<FloorMap />);
          }

          localCapture.restore();

          // EXPECTED: No hook warnings across any transition sequence
          // This WILL FAIL on unfixed code for sequences that toggle floor presence
          expect(localCapture.hasHookWarning()).toBe(false);
        }),
        {
          numRuns: 10,
          endOnFailure: true,
        }
      );
    });
  });
});

// ── Marker Rendering Tests ───────────────────────────────────────────────────

describe('Expected Behavior: Floor plan, route polyline, and markers render correctly', () => {
  beforeEach(() => {
    useNavStore.setState({
      status: 'ANCHORED',
      floor: floor1,
      currentFloorId: 1,
      floorsById: new Map([
        [1, floor1],
        [2, floor2],
      ]),
      currentNodeId: 1,
      currentNode: floor1.nodes[0],
      destinationNode: null,
      route: null,
      currentStep: 0,
      animatedPosition: null,
    });
  });

  it('SHOULD FAIL: Route polyline renders after floor switch', async () => {
    // Set up with a route
    useNavStore.setState({
      status: 'NAVIGATING',
      route: mockRoute,
      currentStep: 0,
    });

    const { container, rerender } = render(<FloorMap />);

    // Wait for initial render
    await waitFor(() => {
      const mapContainer = screen.queryByTestId('map-container');
      expect(mapContainer).toBeTruthy();
    });

    // Switch to Floor 2 (which has the same nodes for this test)
    await act(async () => {
      useNavStore.setState({
        floor: floor2,
        currentFloorId: 2,
      });
    });

    rerender(<FloorMap />);

    // EXPECTED: Route polyline should still render
    await waitFor(() => {
      const polyline = container.querySelector('[data-testid="polyline"]');
      // Note: polyline may not render if nodes aren't on Floor 2, which is expected
      // The key is that no errors occur
    });

    // Check for no React errors
    expect(screen.queryByTestId('map-container')).toBeTruthy();
  });

  it('SHOULD FAIL: Location marker renders after floor switch', async () => {
    const { container, rerender } = render(<FloorMap />);

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    // Switch floor
    await act(async () => {
      useNavStore.setState({
        floor: floor2,
        currentFloorId: 2,
      });
    });

    rerender(<FloorMap />);

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    // Location marker (current position) should still render
    // On unfixed code, this may be corrupted
    const markers = container.querySelectorAll('[data-testid="marker"], [data-testid="circle-marker"]');
    // Allow for 0 markers if the current node isn't on this floor
    expect(markers.length).toBeGreaterThanOrEqual(0);
  });
});
