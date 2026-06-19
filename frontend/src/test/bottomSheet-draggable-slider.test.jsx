/**
 * Bug Condition Exploration Test — Bottom Sheet Draggable Slider
 * 
 * Property 2: Bug Condition - Bottom sheet behaves as a compact, draggable slider
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * Validates: Requirements 1.4, 1.5 (Expected Behavior 2.4, 2.5)
 * 
 * Bug Condition: 
 * - The sheet cannot be dragged (no pointer handlers on handle)
 * - On first entering NAVIGATING, the sheet covers most of the map (not compact)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import BottomSheet from '../components/BottomSheet';
import useNavStore from '../store/useNavStore';

// Mock the store
vi.mock('../store/useNavStore', () => ({
  default: vi.fn((selector) => {
    const state = {
      runSearch: vi.fn(),
      searchResults: [],
      searchLoading: false,
      selectDestination: vi.fn(),
      beginNavigation: vi.fn(),
      cancelNavigation: vi.fn(),
      route: null,
      currentStep: 0,
      routeLoading: false,
    };
    return selector ? selector(state) : state;
  }),
}));

// Helper to get the sheet element
function getSheetElement(container) {
  return container.querySelector('.bottom-sheet');
}

// Helper to get the drag handle
function getDragHandle(container) {
  return container.querySelector('.bottom-sheet__handle');
}

describe('Bug Condition Exploration: BottomSheet Draggable Slider', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console.error to detect React warnings
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Property 2.4: Sheet responds to drag gestures', () => {
    /**
     * Test: Drag gesture should change sheet height/translate
     * 
     * Bug: The drag handle has NO pointer event handlers
     * Expected after fix: Sheet height/translate changes in response to drag
     */
    it('should respond to pointer drag gestures on the handle', async () => {
      const user = userEvent.setup();
      
      // Render BottomSheet in ANCHORED (idle) state
      const { container } = render(
        <BottomSheet
          status="ANCHORED"
          locationName="Building Entrance"
          destinationName={null}
          distanceLabel={null}
          stepInfo={null}
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const sheet = getSheetElement(container);
      const handle = getDragHandle(container);

      expect(sheet).toBeInTheDocument();
      expect(handle).toBeInTheDocument();

      // Get initial sheet position
      const initialTransform = sheet.style.transform || 
        window.getComputedStyle(sheet).transform;
      const initialTop = sheet.offsetTop;

      // Simulate a drag gesture: pointerdown → pointermove → pointerup
      // The drag handle should have pointer event handlers
      fireEvent.pointerDown(handle, { 
        clientX: 100, 
        clientY: 500,
        pointerId: 1 
      });

      // Move pointer up (dragging the sheet upward should expand it)
      fireEvent.pointerMove(handle, { 
        clientX: 100, 
        clientY: 400,
        pointerId: 1 
      });

      // Release
      fireEvent.pointerUp(handle, { 
        clientX: 100, 
        clientY: 400,
        pointerId: 1 
      });

      // ASSERTION: After drag, the sheet transform/position should change
      // This is the expected behavior (Property 2.4)
      const afterTransform = sheet.style.transform || 
        window.getComputedStyle(sheet).transform;
      const afterTop = sheet.offsetTop;

      // The sheet SHOULD respond to the drag gesture
      // On unfixed code, this will fail because there are no pointer handlers
      expect(
        afterTransform !== initialTransform || afterTop !== initialTop
      ).toBe(true);
    });

    /**
     * Test: Drag should settle into a defined snap state (collapsed or expanded)
     * 
     * Bug: No snap state management
     * Expected after fix: Sheet settles into collapsed or expanded state
     */
    it('should settle into defined snap states after drag', async () => {
      const { container } = render(
        <BottomSheet
          status="ANCHORED"
          locationName="Building Entrance"
          destinationName={null}
          distanceLabel={null}
          stepInfo={null}
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const sheet = getSheetElement(container);
      const handle = getDragHandle(container);

      // Simulate a full drag gesture to expand the sheet
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 500, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 100, clientY: 200, pointerId: 1 }); // Drag up
      fireEvent.pointerUp(handle, { clientX: 100, clientY: 200, pointerId: 1 });

      // After settling, the sheet should be in a defined snap state
      // We check for CSS classes or data attributes that indicate snap state
      const sheetClasses = sheet.className;
      
      // Expected: Either expanded or collapsed (specific snap states)
      // On unfixed code, no snap state classes exist
      const hasSnapState = /expanded|collapsed|snap/.test(sheetClasses);
      
      expect(hasSnapState).toBe(true);
    });
  });

  describe('Property 2.5: Sheet is compact on first NAVIGATING', () => {
    /**
     * Test: On first entering NAVIGATING, sheet height should be compact
     * 
     * Bug: The sheet occupies excessive screen space, obscuring the map
     * Expected: Compact height that preserves map visibility (below threshold)
     */
    it('should have compact height when first entering NAVIGATING state', () => {
      // Render BottomSheet directly in NAVIGATING state (first time)
      const { container } = render(
        <BottomSheet
          status="NAVIGATING"
          locationName="Building Entrance"
          destinationName="Food Court"
          distanceLabel="150m"
          stepInfo="Turn left"
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const sheet = getSheetElement(container);
      expect(sheet).toBeInTheDocument();

      // Get the sheet height
      const sheetHeight = sheet.offsetHeight;
      const windowHeight = window.innerHeight;

      // Calculate the percentage of screen the sheet occupies
      const heightPercentage = (sheetHeight / windowHeight) * 100;

      // ASSERTION: Compact height means less than ~40% of screen
      // (leaving 60%+ for map visibility)
      // On unfixed code, this will fail because the sheet is full height
      const isCompact = heightPercentage < 40;
      
      expect(isCompact).toBe(true);
    });

    /**
     * Test: Sheet should have a data attribute or class indicating compact state in NAVIGATING
     */
    it('should have compact state marker when in NAVIGATING', () => {
      const { container } = render(
        <BottomSheet
          status="NAVIGATING"
          locationName="Building Entrance"
          destinationName="Food Court"
          distanceLabel="150m"
          stepInfo="Turn left"
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const sheet = getSheetElement(container);
      
      // Check for a compact state marker (class, data attribute, or style)
      // The fixed version should have a compact/collapsed state for NAVIGATING
      const hasCompactMarker = 
        sheet.classList.contains('bottom-sheet--compact') ||
        sheet.classList.contains('bottom-sheet--collapsed') ||
        sheet.dataset.sheetState === 'collapsed' ||
        sheet.dataset.sheetState === 'compact';

      expect(hasCompactMarker).toBe(true);
    });
  });

  describe('Combined: Drag interaction and NAVIGATING compact state', () => {
    /**
     * Test: After dragging to expand, switching to NAVIGATING should show compact state first
     * 
     * This tests the interaction between drag state and status changes
     */
    it('should reset to compact when transitioning to NAVIGATING regardless of drag state', () => {
      // First render in ANCHORED state and simulate drag to expand
      const { container, rerender } = render(
        <BottomSheet
          status="ANCHORED"
          locationName="Building Entrance"
          destinationName={null}
          distanceLabel={null}
          stepInfo={null}
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const sheet = getSheetElement(container);
      const handle = getDragHandle(container);

      // Simulate drag to expand
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 500, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 100, clientY: 100, pointerId: 1 });

      // Now switch to NAVIGATING - should reset to compact
      rerender(
        <BottomSheet
          status="NAVIGATING"
          locationName="Building Entrance"
          destinationName="Food Court"
          distanceLabel="150m"
          stepInfo="Turn left"
          onUpdateLocation={vi.fn()}
          onExit={vi.fn()}
          onReached={vi.fn()}
          onLost={vi.fn()}
        />
      );

      const navSheet = getSheetElement(container);
      const sheetHeight = navSheet.offsetHeight;
      const windowHeight = window.innerHeight;
      const heightPercentage = (sheetHeight / windowHeight) * 100;

      // In NAVIGATING, should be compact regardless of previous drag state
      expect(heightPercentage < 40).toBe(true);
    });
  });
});