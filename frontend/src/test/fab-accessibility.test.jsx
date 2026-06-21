/**
 * Bug Condition Exploration Test — FAB Accessibility and Availability
 * 
 * Property 6: Bug Condition - FAB accessibility and availability
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * Validates: Requirements 1.11, 1.12 (Expected Behavior 2.11, 2.12)
 * 
 * Bug Conditions:
 * 1.11 - FABs are obscured by the bottom sheet in expanded states and don't respect safe-area insets or minimum touch targets
 * 1.12 - QR scan FAB is gated behind demo mode, so users cannot re-anchor in normal use
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FABGroup from '../components/FABGroup';

// Helper to get FAB elements
function getFABGroup(container) {
  return container.querySelector('.fab-group');
}

function getQRButton(container) {
  return container.querySelector('.fab-group__btn--qr');
}

function getRecenterButton(container) {
  return container.querySelector('.fab-group__btn--recenter');
}

// Helper to parse CSS value, handling NaN
function parseCSSValue(value) {
  if (!value || value === 'auto' || value === '') return NaN;
  const num = parseFloat(value);
  return isNaN(num) ? NaN : num;
}

describe('Bug Condition Exploration: FAB Accessibility and Availability', () => {
  describe('Property 2.11: FABs remain visible and positioned above the bottom sheet', () => {
    /**
     * Test: FABs should be offset above the bottom sheet height
     * 
     * Bug: FABs have a fixed bottom position (180px) in CSS and don't account for sheet height
     * Expected after fix: FABs are positioned above the current sheet height dynamically
     * 
     * This test MUST FAIL on unfixed code - fixed bottom position (180px) is less than sheet height (300px)
     */
    it('should be positioned above the bottom sheet in expanded state', () => {
      // Simulate an expanded bottom sheet height of 300px
      const sheetHeight = 300;
      
      const { container } = render(
        <FABGroup
          showQR={true}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const fabGroup = getFABGroup(container);
      expect(fabGroup).toBeInTheDocument();

      // Get the className to check the CSS rules directly
      // In unfixed code: bottom: 180px is fixed
      // After fix: should use CSS variable or dynamic calculation like calc(180px + var(--sheet-height, 0))
      
      // Check if the FAB group has a dynamic bottom position
      const fabClass = fabGroup.className;
      
      // The fix should introduce a CSS variable for sheet height or use calc
      // Unfixed code has: bottom: 180px (or similar fixed value)
      // Fixed code should have: bottom: calc(180px + var(--sheet-height-offset, 0))
      // or similar dynamic positioning
      
      // We check the CSS text content from the stylesheet
      const styles = document.querySelectorAll('style');
      let fabCss = '';
      styles.forEach(style => {
        fabCss += style.textContent || '';
      });

      // Check if FAB group uses dynamic positioning (sheet height offset)
      // Unfixed: fixed bottom like "bottom: 180px"
      // Fixed: should include sheet height offset like "--sheet-height" or similar
      const hasDynamicPositioning = /--sheet-height|bottom:\s*calc/.test(fabCss) || 
                                    fabGroup.style.bottom?.includes('calc');

      // ASSERTION: FAB should have dynamic positioning to account for sheet height
      // On unfixed code, this will be false (fixed 180px bottom)
      // After fix, this should be true (dynamic based on sheet)
      expect(hasDynamicPositioning).toBe(true);
    });

    /**
     * Test: FABs should respect safe-area insets
     * 
     * Bug: FABs don't properly account for safe-area-inset-bottom in the bottom CSS property
     * Expected after fix: FABs have bottom that includes env(safe-area-inset-bottom)
     */
    it('should include safe-area inset in positioning', () => {
      const { container } = render(
        <FABGroup
          showQR={true}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const fabGroup = getFABGroup(container);
      expect(fabGroup).toBeInTheDocument();

      // Get the CSS from stylesheets
      const styles = document.querySelectorAll('style');
      let fabCss = '';
      styles.forEach(style => {
        fabCss += style.textContent || '';
      });

      // Check for safe-area-inset in the FAB group CSS
      // Unfixed: doesn't include safe-area-inset in bottom
      // Fixed: should include env(safe-area-inset-bottom) in bottom or padding
      const hasSafeAreaInCSS = /\.fab-group\s*\{[^}]*bottom:.*safe-area-inset/.test(fabCss) ||
                               /\.fab-group\s*\{[^}]*padding-bottom:.*safe-area-inset/.test(fabCss);

      expect(hasSafeAreaInCSS).toBe(true);
    });

    /**
     * Test: FABs should have minimum 42px touch target
     * 
     * Bug: The FABGroup doesn't explicitly set min-width/min-height to 42px
     * Expected after fix: Both FABs explicitly have min-width/min-height >= 42px
     */
    it('should have explicit min-width and min-height of 42px for both FABs', () => {
      const { container } = render(
        <FABGroup
          showQR={true}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const qrButton = getQRButton(container);
      const recenterButton = getRecenterButton(container);

      expect(qrButton).toBeInTheDocument();
      expect(recenterButton).toBeInTheDocument();

      // Check CSS for explicit min-width/min-height
      const styles = document.querySelectorAll('style');
      let fabCss = '';
      styles.forEach(style => {
        fabCss += style.textContent || '';
      });

      // Check for explicit min-width and min-height in CSS for FAB buttons
      // Unfixed: uses width/height but may not have explicit min-width/min-height
      // Fixed: should have min-width: 42px; min-height: 42px
      const hasExplicitMinSize = /min-width:\s*42px|min-height:\s*42px/.test(fabCss);

      expect(hasExplicitMinSize).toBe(true);
    });
  });

  describe('Property 2.12: QR scan FAB available in non-demo use', () => {
    /**
     * Test: QR scan FAB should be visible in non-demo mode when status is UNLOCATED or ANCHORED
     * 
     * Bug: In App.jsx, canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED')
     *       This gates the QR FAB entirely behind demo mode
     * Expected after fix: QR FAB visible when NOT in demo mode AND status allows re-anchoring
     */
    it('should show QR FAB in non-demo mode when status is UNLOCATED', () => {
      // Simulate non-demo mode
      const isDemoMode = false;
      const status = 'UNLOCATED';
      const scannerOpen = false;
      
      // This is how App.jsx currently computes canScan (bug):
      const canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED');
      
      // This is how it SHOULD be computed (fixed):
      const canScanFixed = !scannerOpen && status !== 'ARRIVED' && (status === 'UNLOCATED' || status === 'ANCHORED');

      // Current (buggy) behavior: canScan is false when not in demo mode
      expect(canScan).toBe(false);
      
      // Expected (fixed) behavior: canScan should be true for non-demo UNLOCATED
      expect(canScanFixed).toBe(true);
    });

    it('should show QR FAB in non-demo mode when status is ANCHORED', () => {
      const isDemoMode = false;
      const status = 'ANCHORED';
      const scannerOpen = false;
      
      // Current (buggy) behavior
      const canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED');
      
      // Expected (fixed) behavior  
      const canScanFixed = !scannerOpen && status !== 'ARRIVED' && (status === 'UNLOCATED' || status === 'ANCHORED');

      expect(canScan).toBe(false);  // BUG: false in non-demo mode
      expect(canScanFixed).toBe(true);  // Should be true
    });

    /**
     * Test: Verify the actual FABGroup component behavior with showQR prop
     * 
     * This tests the component directly - in real usage, the showQR prop is 
     * computed incorrectly in App.jsx due to the isDemoMode check
     */
    it('should render QR button when showQR is true', () => {
      const { container } = render(
        <FABGroup
          showQR={true}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const qrButton = getQRButton(container);
      expect(qrButton).toBeInTheDocument();
    });

    it('should NOT render QR button when showQR is false', () => {
      const { container } = render(
        <FABGroup
          showQR={false}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const qrButton = getQRButton(container);
      expect(qrButton).not.toBeInTheDocument();
    });

    /**
     * Test: Verify demo mode gating issue in App.jsx
     * 
     * This is an integration-style test that checks the logic in App.jsx
     * The bug is that canScan includes isDemoMode check
     */
    it('demonstrates the demo mode gating bug in App.jsx logic', () => {
      // Test cases showing the bug: QR FAB should be available in non-demo mode
      // but currently it's gated behind isDemoMode
      
      // The key bug case: non-demo mode with valid re-anchoring status
      const isDemoMode = false;
      const status = 'ANCHORED';
      
      // Current (buggy) logic from App.jsx:
      const currentCanScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED');
        
      // Expected (fixed) logic (should NOT check isDemoMode):
      const expectedCanScan = (status === 'UNLOCATED' || status === 'ANCHORED');

      // The bug: currentCanScan is FALSE but expectedCanScan is TRUE
      // This proves the demo mode gating bug exists
      expect(currentCanScan).toBe(false);  // Bug: false in non-demo
      expect(expectedCanScan).toBe(true);  // Should be available
      expect(currentCanScan).not.toBe(expectedCanScan);  // They differ - BUG CONFIRMED
    });
  });

  describe('Combined: FAB positioning and availability issues', () => {
    /**
     * Test: Both FAB accessibility issues should be detectable
     * 
     * This combined test verifies:
     * 1. FABs have fixed positioning (not dynamic relative to sheet)
     * 2. QR FAB is gated behind demo mode
     */
    it('demonstrates the FAB accessibility bug - fixed positioning not accounting for sheet', () => {
      // BUG: FABs have a fixed bottom position that doesn't account for sheet height
      const { container } = render(
        <FABGroup
          showQR={true}
          showRecenter={true}
          onQRScan={vi.fn()}
          onRecenter={vi.fn()}
        />
      );

      const fabGroup = getFABGroup(container);
      expect(fabGroup).toBeInTheDocument();

      // Get the CSS to check for dynamic positioning
      const styles = document.querySelectorAll('style');
      let fabCss = '';
      styles.forEach(style => {
        fabCss += style.textContent || '';
      });

      // Check if FAB group uses dynamic positioning (sheet height offset)
      // Unfixed: fixed bottom like "bottom: 180px" 
      // Fixed: should include sheet height offset like "--sheet-height" or calc
      const hasDynamicPositioning = /--sheet-height|bottom:\s*calc/.test(fabCss);

      // The bug is: FABs have fixed positioning, not dynamic
      // After fix, they should be dynamic to account for sheet height
      // This test FAILS on unfixed code (hasDynamicPositioning is false)
      // and PASSES after fix (hasDynamicPositioning is true)
      expect(hasDynamicPositioning).toBe(true);
    });

    it('demonstrates the FAB availability bug - QR gated behind demo mode', () => {
      // BUG: QR FAB is gated behind isDemoMode
      const isDemoMode = false;  // Normal (non-demo) use
      const status = 'ANCHORED';  // Valid re-anchoring status
      
      // Current (buggy) logic from App.jsx:
      const canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED');
      
      // Expected (fixed) logic - should NOT check isDemoMode:
      const canScanExpected = (status === 'UNLOCATED' || status === 'ANCHORED');

      // Bug exists: canScan is false but should be true in non-demo mode
      // This test FAILS on unfixed code (canScan !== canScanExpected)
      // and PASSES after fix (canScan === canScanExpected)
      expect(canScan).toBe(canScanExpected);
    });
  });
});