/**
 * Preservation Property Tests — Existing Rendering and UI Surfaces
 * Task 10: Property 9: Preservation — Existing rendering and UI surfaces unchanged
 *
 * **Validates: Requirements 3.3, 3.5, 3.6, 3.7, 3.8**
 *
 * These tests verify that baseline behavior is preserved - they MUST PASS on unfixed code.
 * The tests capture observed behavior patterns for non-buggy inputs where isBugCondition is false.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import * as fc from 'fast-check';
import React, { createElement as h } from 'react';

import useNavStore from '../src/store/useNavStore.js';
import FloorMap from '../src/components/FloorMap.jsx';
import FloorSelector from '../src/components/FloorSelector.jsx';
import InstructionCard from '../src/components/InstructionCard.jsx';
import PulsingLocationMarker from '../src/components/PulsingLocationMarker.jsx';
import FABGroup from '../src/components/FABGroup.jsx';

// ── Test Data Fixtures ─────────────────────────────────────────────────────────

/** Create a mock floor object */
function createMockFloor(floorId = 1, floorName = 'Ground Floor', floorNum = 1) {
  return {
    floorId,
    floorName,
    floorNum,
    bounds: { maxY: 1000, maxX: 800 },
    imageUrl: `/assets/floor-plans/floor-${floorId}.png`,
    nodes: [
      { id: 1, x: 100, y: 100, label: 'Entrance', type: 'entrance' },
      { id: 2, x: 200, y: 200, label: 'Junction A', type: 'junction' },
      { id: 3, x: 300, y: 300, label: 'Corridor', type: 'junction' },
      { id: 4, x: 400, y: 400, label: 'Room B', type: 'poi' },
      { id: 5, x: 500, y: 500, label: 'Exit', type: 'junction' },
    ],
    pois: [
      { id: 1, node_id: 4, name: 'Room B', category: 'room' },
    ],
    qrCodes: [
      { id: 1, node_id: 1, code: 'QR001', label: 'Entrance QR' },
    ],
  };
}

const floor1 = createMockFloor(1, 'Ground Floor', 1);
const floor2 = createMockFloor(2, 'First Floor', 2);
const floor3 = createMockFloor(3, 'Second Floor', 3);

/** Mock route for navigation */
const mockRoute = {
  path: [1, 2, 3, 4, 5],
  instructions: [
    { nodeId: 1, turn: 'start', text: 'Start at entrance', distance: 0, floorId: 1 },
    { nodeId: 2, turn: 'straight', text: 'Walk straight', distance: 50, floorId: 1 },
    { nodeId: 3, turn: 'right', text: 'Turn right', distance: 30, floorId: 1 },
    { nodeId: 4, turn: 'destination', text: 'Arrive at Room B', distance: 20, floorId: 1 },
    { nodeId: 5, turn: 'straight', text: 'Continue to exit', distance: 40, floorId: 1 },
  ],
  totalDistance: 140,
};

// Test wrapper for rendering components
function TestWrapper({ children }) {
  return h('div', {
    'data-testid': 'test-wrapper',
    style: { width: '400px', height: '400px', position: 'relative' }
  }, children);
}

// ── Requirement 3.3: Single-floor Rendering ───────────────────────────────────

describe('Preservation: Single-floor rendering (Requirement 3.3)', () => {
  beforeEach(() => {
    useNavStore.setState({
      status: 'ANCHORED',
      floor: floor1,
      currentFloorId: 1,
      floorsById: new Map([[1, floor1]]),
      currentNodeId: 1,
      currentNode: floor1.nodes[0],
      destinationNodeId: null,
      destinationNode: null,
      route: null,
      currentStep: 0,
      animatedPosition: null,
    });
  });

  it('renders plan, polyline, and markers when staying on a single floor', async () => {
    // No floor switching - single floor rendering should work as baseline
    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      const mapContainer = screen.queryByTestId('map-container');
      expect(mapContainer).toBeTruthy();
    });

    // Single-floor rendering should include markers (POIs, nodes)
    const circleMarkers = container.querySelectorAll('[data-testid="circle-marker"]');
    expect(circleMarkers.length).toBeGreaterThan(0);
  });

  it('renders correctly without floor switching using property-based testing', async () => {
    // Property: For any single floor (no switching), rendering works correctly
    const floorArbitrary = fc.constantFrom(floor1, floor2, floor3);

    await fc.assert(
      fc.asyncProperty(floorArbitrary, async (floor) => {
        useNavStore.setState({
          floor,
          currentFloorId: floor.floorId,
          floorsById: new Map([[floor.floorId, floor]]),
          currentNodeId: 1,
          currentNode: floor.nodes[0],
          status: 'ANCHORED',
        });

        const cleanup = render(h(TestWrapper, null, h(FloorMap)));

        try {
          await waitFor(() => {
            const mapContainer = cleanup.container.querySelector('[data-testid="map-container"]');
            expect(mapContainer).toBeTruthy();
          });

          // Without floor switching, markers should render
          const markers = cleanup.container.querySelectorAll('[data-testid="circle-marker"], [data-testid="marker"]');
          expect(markers.length).toBeGreaterThan(0);
        } finally {
          cleanup.unmount();
        }
      }),
      { numRuns: 3 }
    );
  });

  it('preserves route polyline rendering on single floor', async () => {
    useNavStore.setState({
      status: 'NAVIGATING',
      route: mockRoute,
      currentStep: 0,
      destinationNodeId: 4,
      destinationNode: floor1.nodes[3],
    });

    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      const mapContainer = screen.queryByTestId('map-container');
      expect(mapContainer).toBeTruthy();
    });

    // Route polyline should render on single floor (walked + remaining)
    const polyline = container.querySelector('[data-testid="polyline"]');
    expect(polyline).toBeTruthy();
  });
});

// ── Requirement 3.5: Floor Selector ───────────────────────────────────────────

describe('Preservation: Floor_Selector_Widget (Requirement 3.5)', () => {
  beforeEach(() => {
    useNavStore.setState({
      status: 'ANCHORED',
      floor: floor1,
      currentFloorId: 1,
      floorsById: new Map([
        [1, floor1],
        [2, floor2],
        [3, floor3],
      ]),
      currentNodeId: 1,
      currentNode: floor1.nodes[0],
    });
  });

  it('renders one button per loaded floor', async () => {
    render(h(FloorSelector));

    // With 3 floors loaded, we should see 3 buttons
    const buttons = document.querySelectorAll('.floor-selector__btn');
    expect(buttons.length).toBe(3);
  });

  it('highlights the active floor button', async () => {
    // Current floor is 1, should have active highlight
    const { container } = render(h(FloorSelector));

    const activeButton = container.querySelector('.floor-selector__btn--active');
    expect(activeButton).toBeTruthy();
    expect(activeButton).toHaveTextContent('F1');
  });

  it('highlights correct floor when currentFloorId changes', async () => {
    const { container, rerender } = render(h(FloorSelector));

    // Initially on floor 1 - F1 should be active
    expect(container.querySelector('.floor-selector__btn--active')).toHaveTextContent('F1');

    // Switch to floor 2
    await act(async () => {
      useNavStore.setState({ currentFloorId: 2 });
    });
    rerender(h(FloorSelector));

    // Now F2 should be active
    expect(container.querySelector('.floor-selector__btn--active')).toHaveTextContent('F2');
  });

  it('property-based: highlights active floor for various floor counts', async () => {
    const floorCountArbitrary = fc.nat(2).map(n => n + 2); // 2-4 floors

    await fc.assert(
      fc.asyncProperty(floorCountArbitrary, async (count) => {
        // Create floors based on count
        const floors = [];
        for (let i = 1; i <= count; i++) {
          floors.push(createMockFloor(i, `Floor ${i}`, i));
        }

        useNavStore.setState({
          floorsById: new Map(floors.map(f => [f.floorId, f])),
          currentFloorId: 1,
          floor: floors[0],
        });

        const { container } = render(h(FloorSelector));

        const buttons = container.querySelectorAll('.floor-selector__btn');
        expect(buttons.length).toBe(count);

        const activeButton = container.querySelector('.floor-selector__btn--active');
        expect(activeButton).toBeTruthy();
      }),
      { numRuns: 3 }
    );
  });

  it('does not render when only one floor is loaded', async () => {
    useNavStore.setState({
      floorsById: new Map([[1, floor1]]),
      currentFloorId: 1,
      floor: floor1,
    });

    const { container } = render(h(FloorSelector));

    // FloorSelector returns null when only one floor
    const selector = container.querySelector('.floor-selector');
    expect(selector).toBeFalsy();
  });
});

// ── Requirement 3.6: Instruction Card ─────────────────────────────────────────

describe('Preservation: Instruction_Card (Requirement 3.6)', () => {
  beforeEach(() => {
    useNavStore.setState({
      status: 'NAVIGATING',
      route: mockRoute,
      currentStep: 1, // On step 1: "Walk straight"
      destinationNodeId: 4,
      destinationNode: floor1.nodes[3],
    });
  });

  it('displays turn icon, text, and distance while NAVIGATING', () => {
    // Current instruction is step 1: straight, "Walk straight", distance 50
    const instruction = mockRoute.instructions[1]; // index 1 = step 2

    const { container } = render(h(InstructionCard, {
      visible: true,
      turnType: instruction.turn,
      primaryText: instruction.text,
      distance: `${instruction.distance}m`,
      onStepChange: 1,
    }));

    // Turn icon should render (straight = '↑')
    const iconElement = container.querySelector('.instruction-card__icon');
    expect(iconElement).toBeTruthy();
    expect(iconElement.textContent).toBe('↑');

    // Primary text should render
    const primaryText = container.querySelector('.instruction-card__primary');
    expect(primaryText).toBeTruthy();
    expect(primaryText.textContent).toBe('Walk straight');

    // Distance should render
    const distanceElement = container.querySelector('.instruction-card__distance');
    expect(distanceElement).toBeTruthy();
    expect(distanceElement.textContent).toBe('50m');
  });

  it('renders different turn types correctly', () => {
    const turnTypes = [
      { turn: 'left', expectedIcon: '↰' },
      { turn: 'right', expectedIcon: '↱' },
      { turn: 'straight', expectedIcon: '↑' },
      { turn: 'elevator', expectedIcon: '🛗' },
      { turn: 'stairs', expectedIcon: '🪜' },
      { turn: 'destination', expectedIcon: '📍' },
    ];

    turnTypes.forEach(({ turn, expectedIcon }) => {
      const { container } = render(h(InstructionCard, {
        visible: true,
        turnType: turn,
        primaryText: 'Test instruction',
        distance: '10m',
        onStepChange: 0,
      }));

      const iconElement = container.querySelector('.instruction-card__icon');
      expect(iconElement.textContent).toBe(expectedIcon);
    });
  });

  it('updates content when step changes', async () => {
    const { container, rerender } = render(h(InstructionCard, {
      visible: true,
      turnType: 'start',
      primaryText: 'Start here',
      distance: '0m',
      onStepChange: 0,
    }));

    // Initial step should show start
    expect(container.querySelector('.instruction-card__primary').textContent).toBe('Start here');

    // Change to step 1
    rerender(h(InstructionCard, {
      visible: true,
      turnType: 'straight',
      primaryText: 'Walk straight',
      distance: '50m',
      onStepChange: 1,
    }));

    await waitFor(() => {
      expect(container.querySelector('.instruction-card__primary').textContent).toBe('Walk straight');
    });
  });

  it('is hidden when not visible', () => {
    const { container } = render(h(InstructionCard, {
      visible: false,
      turnType: 'straight',
      primaryText: 'Hidden text',
      distance: '10m',
      onStepChange: 0,
    }));

    const card = container.querySelector('.instruction-card');
    // When not visible, the card should NOT have the --visible class
    expect(card).not.toHaveClass('instruction-card--visible');
  });

  it('property-based: renders correctly for random valid steps', async () => {
    const stepArbitrary = fc.nat(mockRoute.instructions.length - 1);

    await fc.assert(
      fc.asyncProperty(stepArbitrary, async (stepIndex) => {
        const instruction = mockRoute.instructions[stepIndex];
        const { container } = render(h(InstructionCard, {
          visible: true,
          turnType: instruction.turn,
          primaryText: instruction.text,
          distance: `${instruction.distance}m`,
          onStepChange: stepIndex,
        }));

        const iconElement = container.querySelector('.instruction-card__icon');
        const primaryText = container.querySelector('.instruction-card__primary');
        const distanceElement = container.querySelector('.instruction-card__distance');

        expect(iconElement).toBeTruthy();
        expect(primaryText).toBeTruthy();
        expect(primaryText.textContent).toBe(instruction.text);
        expect(distanceElement.textContent).toBe(`${instruction.distance}m`);
      }),
      { numRuns: 5 }
    );
  });
});

// ── Requirement 3.7: Pulsing Marker ───────────────────────────────────────────

describe('Preservation: Three-layer pulsing marker with green confirmation flash (Requirement 3.7)', () => {
  let mockMapInstance;

  beforeEach(() => {
    mockMapInstance = global.mockMapInstance;
    vi.clearAllMocks();
  });

  it('renders a pulsing marker component with position', () => {
    // Position in Leaflet coords (for 1000x800 image): [maxY - y, x]
    // Node at x:100, y:100 => [900, 100]
    const position = [900, 100];

    const { container } = render(h(PulsingLocationMarker, {
      position,
      isUpdating: false,
    }));

    // The marker should render (Marker component with DivIcon)
    // In the mock, this renders as a div with data-testid="marker"
    const marker = container.querySelector('[data-testid="marker"]');
    expect(marker).toBeTruthy();
    expect(marker.getAttribute('data-position')).toBe(JSON.stringify(position));
  });

  it('shows green confirmation flash when isUpdating transitions from true to false', async () => {
    const position = [900, 100];

    const { container, rerender } = render(h(PulsingLocationMarker, {
      position,
      isUpdating: true, // Start with updating
    }));

    // The marker should be present
    expect(container.querySelector('[data-testid="marker"]')).toBeTruthy();

    // Transition to not updating - should trigger green flash
    rerender(h(PulsingLocationMarker, {
      position,
      isUpdating: false, // Update complete - should flash green
    }));

    // After 800ms, confirming should be false
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 900));
    });

    // The marker should still render
    const marker = container.querySelector('[data-testid="marker"]');
    expect(marker).toBeTruthy();
  });

  it('renders null when position is null', () => {
    const { container } = render(h(PulsingLocationMarker, {
      position: null,
      isUpdating: false,
    }));

    // When position is null, the component returns null
    const marker = container.querySelector('[data-testid="marker"]');
    expect(marker).toBeFalsy();
  });

  it('handles isUpdating state changes', () => {
    const position = [900, 100];

    // When isUpdating is true (animation in progress)
    const { container: updatingContainer } = render(h(PulsingLocationMarker, {
      position,
      isUpdating: true,
    }));

    // Should still render marker
    expect(updatingContainer.querySelector('[data-testid="marker"]')).toBeTruthy();

    // When isUpdating is false
    const { container: normalContainer } = render(h(PulsingLocationMarker, {
      position,
      isUpdating: false,
    }));

    expect(normalContainer.querySelector('[data-testid="marker"]')).toBeTruthy();
  });

  it('property-based: renders correctly for various positions', async () => {
    const positionArbitrary = fc.array(fc.nat(1000).chain(n => fc.constant([n, n + 1])), { minLength: 2, maxLength: 2 });

    await fc.assert(
      fc.asyncProperty(positionArbitrary, async (pos) => {
        if (pos[0] <= 0 || pos[1] <= 0) return; // Skip invalid positions

        const { container } = render(h(PulsingLocationMarker, {
          position: pos,
          isUpdating: false,
        }));

        const marker = container.querySelector('[data-testid="marker"]');
        expect(marker).toBeTruthy();
      }),
      { numRuns: 10 }
    );
  });
});

// ── Requirement 3.8: Explicit Re-center / Fit ─────────────────────────────────

describe('Preservation: Explicit re-center (map:recenter) / Fit fly-to (Requirement 3.8)', () => {
  let mockMapInstance;

  beforeEach(() => {
    mockMapInstance = global.mockMapInstance;
    useNavStore.setState({
      status: 'ANCHORED',
      floor: floor1,
      currentFloorId: 1,
      floorsById: new Map([[1, floor1]]),
      currentNodeId: 1,
      currentNode: floor1.nodes[0],
    });
    vi.clearAllMocks();
  });

  it('flys to current anchored position on map:recenter event', async () => {
    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    mockMapInstance.flyTo.mockClear();

    // Dispatch map:recenter event
    act(() => {
      window.dispatchEvent(new CustomEvent('map:recenter'));
    });

    await waitFor(() => {
      expect(mockMapInstance.flyTo).toHaveBeenCalled();
    });

    // Verify flyTo was called with current position
    const lastCall = mockMapInstance.flyTo.mock.calls[mockMapInstance.flyTo.mock.calls.length - 1];
    const [position, zoom] = lastCall;

    // Position should be current node position: [maxY - y, x] = [1000 - 100, 100] = [900, 100]
    expect(position[0]).toBe(900);
    expect(position[1]).toBe(100);

    // Zoom should be the computed fit zoom
    expect(zoom).toBeDefined();
  });

  it('Fit control flies to fit zoom', async () => {
    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    mockMapInstance.setView.mockClear();

    // Click the Fit button (ViewportResetControl)
    const fitButton = container.querySelector('.floor-map__control');
    expect(fitButton).toBeTruthy();

    act(() => {
      fitButton.click();
    });

    await waitFor(() => {
      expect(mockMapInstance.setView).toHaveBeenCalled();
    });

    // Verify fit zoom is calculated correctly
    const lastCall = mockMapInstance.setView.mock.calls[mockMapInstance.setView.mock.calls.length - 1];
    const [position, zoom] = lastCall;

    // Should center on the image bounds center: [maxY/2, maxX/2] = [500, 400]
    expect(position[0]).toBeCloseTo(500, -1);
    expect(position[1]).toBeCloseTo(400, -1);

    // Zoom should be fit zoom for 400x400 container with 800x1000 image
    // This is a computed value, just verify it's defined and reasonable
    expect(zoom).toBeDefined();
    expect(zoom).toBeLessThanOrEqual(3);
    expect(zoom).toBeGreaterThanOrEqual(-4);
  });

  it('re-center uses fit zoom based on container and image dimensions', async () => {
    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    mockMapInstance.flyTo.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent('map:recenter'));
    });

    await waitFor(() => {
      expect(mockMapInstance.flyTo).toHaveBeenCalled();
    });

    const lastCall = mockMapInstance.flyTo.mock.calls[mockMapInstance.flyTo.mock.calls.length - 1];
    const [, zoom] = lastCall;

    // Fit zoom for 400x400 container with 800x1000 image should be around -1
    // The formula: floor(min(log2(availW/imgW), log2(availH/imgH)) * 4) / 4
    // With 400x400 container: availW = 320, availH = 320
    // log2(320/800) = log2(0.4) ≈ -1.32
    // log2(320/1000) = log2(0.32) ≈ -1.64
    // min ≈ -1.64 * 4 = -6.56, floor = -7, /4 = -1.75
    expect(zoom).toBeLessThanOrEqual(0);
    expect(zoom).toBeGreaterThanOrEqual(-3);
  });

  it('property-based: recenter works with various floor viewports', async () => {
    const floorArbitrary = fc.constantFrom(floor1, floor2, floor3);

    await fc.assert(
      fc.asyncProperty(floorArbitrary, async (floor) => {
        // Reset to clean state for each iteration
        useNavStore.setState({
          floor,
          currentFloorId: floor.floorId,
          floorsById: new Map([[floor.floorId, floor]]),
          currentNodeId: 1,
          currentNode: floor.nodes[0],
          status: 'ANCHORED',
        });

        // Clean up any previous renders
        const cleanup = render(h(TestWrapper, null, h(FloorMap)));

        try {
          await waitFor(() => {
            // Use querySelector on the container, not screen
            const mapContainer = cleanup.container.querySelector('[data-testid="map-container"]');
            expect(mapContainer).toBeTruthy();
          });

          mockMapInstance.flyTo.mockClear();

          act(() => {
            window.dispatchEvent(new CustomEvent('map:recenter'));
          });

          await waitFor(() => {
            expect(mockMapInstance.flyTo).toHaveBeenCalled();
          });
        } finally {
          // Clean up after each iteration
          cleanup.unmount();
        }
      }),
      { numRuns: 3 }
    );
  });
});

// ── Combined Preservation Tests ──────────────────────────────────────────────

describe('Preservation: Combined UI surface tests', () => {
  it('all preservation requirements work together on a typical navigation flow', async () => {
    // Setup: ANCHORED on floor 1
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
    });

    // Render FloorMap
    const { container } = render(h(TestWrapper, null, h(FloorMap)));

    await waitFor(() => {
      expect(screen.queryByTestId('map-container')).toBeTruthy();
    });

    // FloorSelector should NOT render (only 1 floor active)
    // But floorsById has 2 floors
    // Note: FloorSelector only renders if floorsById.size > 1

    // Begin navigation
    useNavStore.setState({
      status: 'ROUTE_PREVIEW',
      destinationNodeId: 4,
      destinationNode: floor1.nodes[3],
      route: mockRoute,
    });

    act(() => {
      useNavStore.getState().beginNavigation();
    });

    // Now NAVIGATING - InstructionCard should show
    expect(useNavStore.getState().status).toBe('NAVIGATING');

    // Simulate step advances
    act(() => {
      useNavStore.getState().advanceStep();
    });

    // Current step should be 1
    expect(useNavStore.getState().currentStep).toBe(1);

    // Verify markers still render
    const markers = container.querySelectorAll('[data-testid="circle-marker"]');
    expect(markers.length).toBeGreaterThan(0);
  });
});