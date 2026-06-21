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
 * Test wrapper that renders FlyToPosition and allows position changes
 */
function TestWrapper({ position }) {
  return <FlyToPosition position={position} />;
}

describe('FlyToPosition component - Bug Condition Exploration', () => {
  
  beforeEach(() => {
    // Reset mocks
    mockMapInstance.flyTo.mockClear();
    mockMapInstance.getZoom.mockReturnValue(0);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  /**
   * TEST: FlyToPosition should NOT call map.flyTo for location updates
   * 
   * This test validates the EXPECTED BEHAVIOR after the fix:
   * When the position prop changes (simulating location update), 
   * map.flyTo should NOT be called. The camera should stay still
   * while the location dot animates.
   * 
   * EXPECTED ON UNFIXED CODE: 
   *   - Test FAILS (flyTo IS called when it should NOT be)
   *   - This confirms the bug exists
   * EXPECTED AFTER FIX: 
   *   - Test PASSES (flyTo is NOT called for location updates)
   */
  it('should NOT call map.flyTo when position prop changes (EXPECTED: fail on unfixed code)', async () => {
    // Initial position
    const initialPosition = [500, 100]; // toLatLng({x:100, y:100}, 600)
    
    // Render with initial position
    const { rerender } = render(<TestWrapper position={initialPosition} />);
    
    // Wait for useEffect to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    // Clear mock calls from initial position
    // The first render should skip flyTo due to `if (!prev) return;`
    mockMapInstance.flyTo.mockClear();
    
    // Now change the position - simulating a location update
    // This is what happens when user scans QR or selects a node
    const newPosition = [300, 300]; // toLatLng({x:300, y:300}, 600)
    
    // Re-render with new position
    rerender(<TestWrapper position={newPosition} />);
    
    // Wait for useEffect to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    console.log('flyTo call count after position change:', mockMapInstance.flyTo.mock.calls.length);
    console.log('flyTo calls:', mockMapInstance.flyTo.mock.calls);
    
    // EXPECTED BEHAVIOR: flyTo should NOT be called for location updates
    // ON UNFIXED CODE: flyTo IS called → test FAILS (bug confirmed)
    // AFTER FIX: flyTo is NOT called → test PASSES
    expect(mockMapInstance.flyTo).not.toHaveBeenCalled();
  });
  
  /**
   * TEST: Same position should NOT trigger flyTo (this already works)
   */
  it('should NOT call flyTo when position is the same', async () => {
    const position = [300, 300];
    const { rerender } = render(<TestWrapper position={position} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    mockMapInstance.flyTo.mockClear();
    
    // Re-render with same position
    rerender(<TestWrapper position={position} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    // Same position should not trigger flyTo
    expect(mockMapInstance.flyTo).not.toHaveBeenCalled();
  });
});