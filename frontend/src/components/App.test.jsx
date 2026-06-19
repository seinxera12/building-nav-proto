/**
 * Bug Condition Exploration Test — Upgraded Location Overlays
 * Property 3: Bug Condition - Upgraded location overlays
 * 
 * **Validates: Requirements 1.6, 1.7**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * GOAL: Surface counterexamples showing the legacy EntryPrompt renders for both overlays.
 * 
 * Bug Condition Context:
 * - WHEN the user opens the "Update location" overlay THEN the system displays the
 *   legacy EntryPrompt UI rather than the upgraded UI. (Requirement 1.6)
 * - WHEN the app needs the user's starting location ("Where are you?") THEN the system
 *   displays the legacy EntryPrompt UI rather than the upgraded UI. (Requirement 1.7)
 * 
 * Expected Behavior (post-fix):
 * - WHEN the user opens the "Update location" overlay THEN the system SHALL display
 *   the upgraded location-update UI consistent with the new design system. (Requirement 2.6)
 * - WHEN the app needs the user's starting location ("Where are you?") THEN the system
 *   SHALL display the upgraded entry UI consistent with the new design system. (Requirement 2.7)
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// ── Mock the API module ───────────────────────────────────────────────────────
vi.mock('../api/index.js', () => ({
  fetchFloor: vi.fn().mockResolvedValue({
    floorId: 1,
    floorName: 'Ground Floor',
    image_url: '/maps/floor1.webp',
    width: 1400,
    height: 1000,
    nodes: [
      { id: 1, x: 100, y: 100, label: 'Entrance', type: 'entrance' },
      { id: 2, x: 200, y: 200, label: 'Lobby', type: 'lobby' },
      { id: 3, x: 300, y: 300, label: 'Room A', type: 'room' },
    ],
    edges: [
      { from_node: 1, to_node: 2 },
      { from_node: 2, to_node: 3 },
    ],
    pois: [
      { id: 1, name: 'Main Entrance', node_id: 1, category: 'entrance' },
      { id: 2, name: 'Reception', node_id: 2, category: 'service' },
    ],
    qrCodes: [
      { qr_code: 'QR-ENTRANCE', node_id: 1, label: 'Main Entrance' },
      { qr_code: 'QR-LOBBY', node_id: 2, label: 'Lobby' },
    ],
  }),
  fetchFloors: vi.fn().mockResolvedValue([
    { id: 1, floorName: 'Ground Floor' },
  ]),
  computeRoute: vi.fn().mockResolvedValue({
    path: [1, 2, 3],
    totalDistance: 100,
    instructions: [
      { step: 1, turn: 'start', text: 'Start at Entrance', nodeId: 1, distance: 0 },
      { step: 2, turn: 'straight', text: 'Walk to Lobby', nodeId: 2, distance: 50 },
      { step: 3, turn: 'straight', text: 'Arrive at Room A', nodeId: 3, distance: 50 },
    ],
  }),
  scanQR: vi.fn().mockResolvedValue({
    nodeId: 1,
    label: 'Main Entrance',
    floorId: 1,
  }),
  logEvent: vi.fn(),
  searchPOIs: vi.fn().mockResolvedValue([]),
  getCachedQrCheckpoints: vi.fn().mockReturnValue([]),
  normalizeQrPayload: vi.fn((code) => code),
}));

// ── Mock Leaflet and react-leaflet (handled in setup.js) ──────────────────────

describe('Property 3: Bug Condition - Upgraded location overlays', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.location to remove URL params
    window.history.pushState({}, '', '/');
  });

  describe('Bug Condition Context: update_location overlay', () => {
    it('SHALL display upgraded location UI (not legacy EntryPrompt) when "Update location" overlay opens', async () => {
      // This test is expected to FAIL on unfixed code
      // The counterexample will show that EntryPrompt is rendered instead of upgraded UI
      
      render(<App />);

      // Wait for floor data to load
      await waitFor(() => {
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      });

      // Find the location bar update button and click it
      // This triggers the "update_location" overlay
      const updateButton = screen.queryByRole('button', { name: /update/i });
      if (updateButton) {
        await user.click(updateButton);
      }

      // BUG ASSERTION: The legacy EntryPrompt should NOT be present
      // On unfixed code, this WILL be present (the bug)
      const legacyEntryPrompt = screen.queryByRole('dialog');
      
      // On unfixed code: EntryPrompt renders with class "entry-prompt"
      // The legacy UI contains "Scan QR" and "Select from list" buttons
      const legacyScanButton = screen.queryByRole('button', { name: /scan qr/i });
      const legacySelectButton = screen.queryByRole('button', { name: /select from list/i });

      // EXPECTED BEHAVIOR (post-fix): Upgraded UI should be present
      // We look for a marker that indicates the new design-system UI
      // This could be a test id like "upgraded-location-ui" or a class name
      const upgradedLocationUI = screen.queryByTestId('upgraded-location-ui');
      const upgradedLocationUIByClass = document.querySelector('.upgraded-location-overlay');

      // On UNFIXED code: 
      // - legacyEntryPrompt SHOULD be present (BUG)
      // - upgradedLocationUI SHOULD NOT be present
      // 
      // On FIXED code:
      // - legacyEntryPrompt SHOULD NOT be present
      // - upgradedLocationUI SHOULD be present
      
      // This assertion documents the bug:
      // The legacy EntryPrompt renders when it shouldn't
      const hasLegacyUI = legacyEntryPrompt !== null || 
                          legacyScanButton !== null || 
                          legacySelectButton !== null;
      
      const hasUpgradedUI = upgradedLocationUI !== null || 
                           upgradedLocationUIByClass !== null;

      // EXPECTED TO FAIL on unfixed code:
      // The assertion that upgraded UI should be present and legacy UI should be absent
      expect(hasUpgradedUI).toBe(true);
      expect(hasLegacyUI).toBe(false);
    });

    it('SHALL NOT render EntryPrompt when update location overlay is triggered from BottomSheet', async () => {
      render(<App />);

      // Wait for floor data to load
      await waitFor(() => {
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      });

      // The BottomSheet should have an update location action
      // This also triggers the "update_location" overlay
      const bottomSheetUpdateButton = screen.queryByRole('button', { name: /update location/i });
      
      if (bottomSheetUpdateButton) {
        await user.click(bottomSheetUpdateButton);

        // BUG: EntryPrompt with "Scan QR" and "Select from list" should NOT appear
        await waitFor(() => {
          const legacyScanButton = screen.queryByRole('button', { name: /scan qr/i });
          const legacySelectButton = screen.queryByRole('button', { name: /select from list/i });
          
          // EXPECTED TO FAIL: These legacy buttons should NOT be present
          expect(legacyScanButton).not.toBeInTheDocument();
          expect(legacySelectButton).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Bug Condition Context: where_are_you overlay', () => {
    it('SHALL display upgraded entry UI (not legacy EntryPrompt) when app needs starting location', async () => {
      // This test is expected to FAIL on unfixed code
      // The counterexample will show that EntryPrompt is rendered instead of upgraded UI
      
      // Render App without URL loc param and no saved location
      render(<App />);

      // Wait for floor data to load
      await waitFor(() => {
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      });

      // On first load with no location, the "Where are you?" overlay should appear
      // BUG: The legacy EntryPrompt is rendered instead of upgraded UI

      // Look for legacy EntryPrompt elements
      const legacyDialogTitle = screen.queryByRole('heading', { name: /where are you/i });
      const legacyScanButton = screen.queryByRole('button', { name: /scan qr/i });
      const legacySelectButton = screen.queryByRole('button', { name: /select from list/i });

      // EXPECTED BEHAVIOR (post-fix): Upgraded UI should be present
      const upgradedLocationUI = screen.queryByTestId('upgraded-location-ui');
      const upgradedLocationUIByClass = document.querySelector('.upgraded-location-overlay');

      // On UNFIXED code:
      // - legacyDialogTitle, legacyScanButton, legacySelectButton SHOULD be present (BUG)
      // - upgradedLocationUI SHOULD NOT be present
      //
      // On FIXED code:
      // - legacyDialogTitle, legacyScanButton, legacySelectButton SHOULD NOT be present
      // - upgradedLocationUI SHOULD be present

      const hasLegacyUI = legacyDialogTitle !== null || 
                          legacyScanButton !== null || 
                          legacySelectButton !== null;
      
      const hasUpgradedUI = upgradedLocationUI !== null || 
                           upgradedLocationUIByClass !== null;

      // EXPECTED TO FAIL on unfixed code:
      // The assertion that upgraded UI should be present and legacy UI should be absent
      expect(hasUpgradedUI).toBe(true);
      expect(hasLegacyUI).toBe(false);
    });

    it('SHALL NOT render legacy EntryPrompt with "Where are you?" title on first run', async () => {
      render(<App />);

      // Wait for floor data to load and initial state to settle
      await waitFor(() => {
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      });

      // LEGACY UI CHECK: The EntryPrompt component renders a specific structure:
      // - A dialog with role="dialog"
      // - A heading "Where are you?"
      // - Buttons "Scan QR" and "Select from list"
      
      const dialog = screen.queryByRole('dialog');
      const whereAreYouHeading = screen.queryByRole('heading', { name: /where are you/i });

      // EXPECTED TO FAIL on unfixed code:
      // The legacy EntryPrompt dialog should NOT be present
      expect(dialog).not.toBeInTheDocument();
      expect(whereAreYouHeading).not.toBeInTheDocument();
    });
  });

  describe('Counterexample Documentation', () => {
    it('documents the bug: EntryPrompt renders for both overlay types', async () => {
      // This test documents the specific counterexamples that demonstrate the bug
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      });

      // COUNTEREXAMPLE 1: First-run "Where are you?" overlay
      // Expected: Upgraded UI
      // Actual: EntryPrompt with heading "Where are you?"
      const whereAreYouHeading = screen.queryByRole('heading', { name: /where are you/i });
      const legacyScanButton = screen.queryByRole('button', { name: /scan qr/i });
      const legacySelectButton = screen.queryByRole('button', { name: /select from list/i });

      // COUNTEREXAMPLE: These legacy elements ARE present (the bug)
      const hasLegacyFirstRunUI = whereAreYouHeading !== null && 
                                   legacyScanButton !== null && 
                                   legacySelectButton !== null;

      // This assertion FAILS on unfixed code - confirming the bug exists
      // After fix, hasLegacyFirstRunUI will be false
      expect(hasLegacyFirstRunUI).toBe(false);
    });
  });
});
