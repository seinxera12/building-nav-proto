/**
 * Bug Condition Exploration Test: Location animation decoupled from camera
 * 
 * **Property 7: Bug Condition** - Location animation decoupled from the camera
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * 
 * GOAL: Surface counterexamples showing FlyToPosition pans the whole map 
 * during a location-dot animation
 * 
 * Scoped PBT Approach: Scope to a concrete `location_update` (QR scan and 
 * manual node select) where the location dot animates
 * 
 * Assert `map.flyTo` is NOT called for the location-dot (`currentPos`) change 
 * while the marker/`animatedPosition` updates (from Expected Behavior 2.13)
 * 
 * **Validates: Requirements 1.13**
 */

import React, { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// Get the mock map instance from setup.js
const mockMapInstance = global.mockMapInstance;

/**
 * FlyToPosition - Direct copy from FloorMap.jsx (BUGGY VERSION)
 * This is the component that causes the regression
 * 
 * BUG: It calls map.flyTo on EVERY position change, including location updates
 * from QR scan or node selection. This causes the map to pan while the 
 * location dot animates, which is visually disorienting.
 */
function FlyToPosition({ position }) {
  const map = { 
    getZoom: () => 0,
    flyTo: mockMapInstance.flyTo 
  };
  const prevPositionRef = useRef(null);

  useEffect(() => {
    if (!position) return;

    const prev = prevPositionRef.current;
    prevPositionRef.current = position;

    // Only fly when position actually changes (not on first render)
    if (!prev) return;
    if (prev[0] === position[0] && prev[1] === position[1]) return;

    // BUG: This flyTo call happens on EVERY position change
    // Including location updates from QR scan or manual node selection
    const currentZoom = map.getZoom();
    map.flyTo(position, currentZoom, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [position, map]);

  return null;
}

/**
 * Simulates the FloorMap behavior with currentPos derived from currentNode
 * toLatLng: [maxY - node.y, node.x]
 */
function TestFloorMapScenario({ currentNode }) {
  const maxY = 600;
  
  // Simulate how FloorMap computes currentPos from currentNode
  const currentPos = currentNode 
    ? [maxY - currentNode.y, currentNode.x] 
    : null;

  return <FlyToPosition position={currentPos} />;
}

describe('Location animation decoupled from camera - Bug Condition Exploration', () => {
  
  beforeEach(() => {
    mockMapInstance.flyTo.mockClear();
    mockMapInstance.getZoom.mockReturnValue(0);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  /**
   * TEST: Location update should NOT trigger map.flyTo
   * 
   * This test validates the EXPECTED BEHAVIOR after the fix:
   * When a user's location changes (via QR scan or manual node selection),
   * the map camera should NOT pan to follow the location dot.
   * The dot should animate smoothly while the map stays still.
   * 
   * SCENARIO: User scans QR code at node-2, or selects node-2 manually
   * - Before: currentNode = node-1 at (100, 100) → currentPos = [500, 100]
   * - After: currentNode = node-2 at (300, 300) → currentPos = [300, 300]
   * 
   * EXPECTED ON UNFIXED CODE: 
   *   - Test FAILS (flyTo IS called when it should NOT be)
   *   - This confirms the bug exists
   * EXPECTED AFTER FIX: 
   *   - Test PASSES (flyTo is NOT called for location updates)
   */
  it('should NOT call map.flyTo when location updates via QR scan or node selection', async () => {
    const node1 = { id: 'node-1', x: 100, y: 100, label: 'Entrance' };
    const node2 = { id: 'node-2', x: 300, y: 300, label: 'Office' };
    
    // Initial position: node-1 at (100, 100) → toLatLng = [600-100, 100] = [500, 100]
    const { rerender } = render(<TestFloorMapScenario currentNode={node1} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    // Clear mock from initial position
    mockMapInstance.flyTo.mockClear();
    
    // Simulate location update: QR scan or manual node selection
    // New position: node-2 at (300, 300) → toLatLng = [600-300, 300] = [300, 300]
    rerender(<TestFloorMapScenario currentNode={node2} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    console.log('Test: Location update should NOT trigger flyTo');
    console.log('flyTo call count:', mockMapInstance.flyTo.mock.calls.length);
    
    // EXPECTED BEHAVIOR: flyTo should NOT be called for location updates
    // ON UNFIXED CODE: flyTo IS called → test FAILS (bug confirmed)
    // AFTER FIX: flyTo is NOT called → test PASSES
    expect(mockMapInstance.flyTo).not.toHaveBeenCalled();
  });
  
  /**
   * TEST: Multiple location updates should NOT trigger flyTo
   * 
   * Even when the user moves through multiple locations, camera should stay still
   */
  it('should NOT call flyTo for any location update in a sequence', async () => {
    const nodes = [
      { id: 'node-1', x: 100, y: 100, label: 'Entrance' },
      { id: 'node-2', x: 200, y: 200, label: 'Hallway' },
      { id: 'node-3', x: 300, y: 300, label: 'Office' },
      { id: 'node-4', x: 400, y: 400, label: 'Stairs' },
    ];
    
    // Start with first node
    const { rerender } = render(<TestFloorMapScenario currentNode={nodes[0]} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    mockMapInstance.flyTo.mockClear();
    
    // Simulate walking through multiple locations
    for (let i = 1; i < nodes.length; i++) {
      rerender(<TestFloorMapScenario currentNode={nodes[i]} />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
    }
    
    // EXPECTED BEHAVIOR: flyTo should NOT be called for ANY location update
    // ON UNFIXED CODE: flyTo IS called 3 times → test FAILS
    // AFTER FIX: flyTo is NOT called → test PASSES
    console.log('flyTo call count after multiple updates:', mockMapInstance.flyTo.mock.calls.length);
    
    expect(mockMapInstance.flyTo).not.toHaveBeenCalled();
  });
  
  /**
   * TEST: Identical position should NOT trigger flyTo (this already works)
   * 
   * This verifies the optimization in the existing code - same position
   * should not trigger flyTo. This test should PASS on both fixed and unfixed.
   */
  it('should NOT call flyTo when position does not actually change', async () => {
    const node = { id: 'node-1', x: 100, y: 100, label: 'Entrance' };
    
    const { rerender } = render(<TestFloorMapScenario currentNode={node} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    mockMapInstance.flyTo.mockClear();
    
    // Re-render with same position
    rerender(<TestFloorMapScenario currentNode={node} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    // Same position should not trigger flyTo (this already works)
    expect(mockMapInstance.flyTo).not.toHaveBeenCalled();
  });
});