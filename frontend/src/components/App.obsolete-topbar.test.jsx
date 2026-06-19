// App.obsolete-topbar.test.jsx — Bug condition exploration test for Property 4
// Validates: Requirements 1.8, 1.9 (bugfix.md)
//
// PROPERTY 4: Bug Condition — Obsolete top-bar controls removed and status reflected
//
// CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
// DO NOT attempt to fix the test or the code when it fails
//
// GOAL: Surface counterexamples showing the redundant header "Update" control
// and the header not reflecting `status`
//
// Scoped PBT Approach: Scope to `render_shell` and `status_change` across
// UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock the navigation store to control status transitions
const mockStoreState = {
  status: 'UNLOCATED',
  currentNodeId: null,
  currentNode: null,
  floorLoading: false,
  floorError: null,
  floor: null,
  floorsById: new Map(),
  destinationNode: null,
  route: null,
  currentStep: 0,
  loadFloors: vi.fn(() => Promise.resolve([{ floorId: 1, floorName: 'Ground Floor', floorNum: 1, nodes: [], pois: [], qrCodes: [] }])),
  handleScan: vi.fn(() => Promise.resolve()),
  anchorNode: vi.fn(() => Promise.resolve()),
  selectDestination: vi.fn(() => Promise.resolve()),
  beginNavigation: vi.fn(),
  cancelNavigation: vi.fn(),
  advanceStep: vi.fn(),
  completeNavigation: vi.fn(),
  setError: vi.fn(),
  setScanErrorRecovery: vi.fn(),
  toggleChat: vi.fn(),
  chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
};

// Create a mutable store state for tests
let storeState = { ...mockStoreState };

vi.mock('./store/useNavStore', () => ({
  default: (selector) => selector(storeState),
}));

// Helper to update store state for status transitions
function setStoreState(partial) {
  storeState = { ...storeState, ...partial };
}

// Helper to create a floor with nodes
function createFloor(floorId = 1, floorNum = 1, floorName = 'Ground Floor') {
  return {
    floorId,
    floorNum,
    floorName,
    nodes: [
      { id: 'node-1', x: 100, y: 100, label: 'Entrance', type: 'checkpoint' },
      { id: 'node-2', x: 200, y: 200, label: 'Reception', type: 'poi' },
      { id: 'node-3', x: 300, y: 300, label: 'Office A', type: 'destination' },
    ],
    pois: [
      { id: 'poi-1', node_id: 'node-2', name: 'Reception Desk', category: 'service' },
    ],
    qrCodes: [
      { qr_code: 'qr-entrance', node_id: 'node-1', label: 'Entrance QR' },
    ],
  };
}

describe('Property 4: Bug Condition — Obsolete top-bar controls removed and status reflected', () => {
  beforeEach(() => {
    // Reset store state
    storeState = { ...mockStoreState };
    vi.clearAllMocks();
    
    // Mock URL constructor for demo mode detection
    global.window ??= {};
    window.location ??= { href: 'http://localhost/', search: '' };
    window.URLSearchParams = vi.fn(() => ({
      has: vi.fn(() => false),
    }));
  });

  describe('Requirement 1.8: No redundant top-bar "Update" control', () => {
    it('FAILS on unfixed code: should NOT have redundant header "Update" button (duplicates bottom sheet action)', async () => {
      // Setup: Floor loaded with current node anchored
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'ANCHORED',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
      });

      // Render the app
      render(<App />);

      // BUG CONDITION CHECK: Look for the redundant header "Update" button
      // The unfixed code renders LocationBar with an "Update" button
      // This duplicates the bottom sheet's update action
      const updateButtons = screen.getAllByRole('button', { name: /update/i });

      // EXPECTED BEHAVIOR (will fail on unfixed code):
      // There should be NO redundant "Update" button in the header
      // The bottom sheet is the single source of the update action
      // FAILING: unfixed code has both LocationBar's "Update" AND bottom sheet's update
      
      // Find the LocationBar's update button specifically
      const locationBar = screen.getByTestId('location-bar') || document.getElementById('location-bar');
      
      // On unfixed code, LocationBar contains an "Update" button
      // This is the bug - there should NOT be a duplicate update action
      if (locationBar) {
        const locationBarUpdateBtn = locationBar.querySelector('.location-bar__update');
        
        // BUG CONFIRMED: locationBarUpdateBtn exists in unfixed code
        // This is the counterexample - the redundant Update button
        expect(locationBarUpdateBtn).toBeNull(); // WILL FAIL on unfixed code
      } else {
        // If no location bar found, check for any update button in header
        const header = document.querySelector('.app-header');
        if (header) {
          const headerUpdateBtn = header.querySelector('button');
          expect(headerUpdateBtn).toBeNull(); // WILL FAIL on unfixed code
        }
      }
    });

    it('FAILS on unfixed code: should not have LocationBar component with duplicate update action', async () => {
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'ANCHORED',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
      });

      render(<App />);

      // BUG CONDITION: LocationBar renders with class "location-bar"
      // containing a duplicate "Update" button
      const locationBars = document.querySelectorAll('.location-bar');
      
      // EXPECTED: LocationBar should either not exist or not have an Update button
      for (const bar of locationBars) {
        const updateBtn = bar.querySelector('.location-bar__update');
        expect(updateBtn).toBeNull(); // WILL FAIL on unfixed code
      }
    });
  });

  describe('Requirement 1.9: Header/status surface reflects current navigation status', () => {
    const statusLabels = {
      UNLOCATED: 'Unlocated',
      ANCHORED: 'Anchored',
      ROUTE_PREVIEW: 'Previewing Route',
      NAVIGATING: 'Navigating',
      REROUTING: 'Recalculating',
      ARRIVED: 'Arrived',
    };

    // Test each status transition
    const statusTransitions = [
      { from: 'UNLOCATED', to: 'ANCHORED', label: 'Anchored' },
      { from: 'ANCHORED', to: 'ROUTE_PREVIEW', label: 'Previewing Route' },
      { from: 'ROUTE_PREVIEW', to: 'NAVIGATING', label: 'Navigating' },
      { from: 'NAVIGATING', to: 'ARRIVED', label: 'Arrived' },
    ];

    it.each(statusTransitions)(
      'FAILS on unfixed code: header should reflect status "$to" after transition from "$from"',
      async ({ to }) => {
        const floor = createFloor();
        
        // Set up the state for the target status
        const stateUpdate = {
          floor,
          floorLoading: false,
          status: to,
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
        };

        if (to === 'ROUTE_PREVIEW' || to === 'NAVIGATING') {
          stateUpdate.destinationNode = floor.nodes[2];
          stateUpdate.route = {
            instructions: [{ turn: 'straight', text: 'Go straight', distance: 50 }],
            totalDistance: 50,
          };
        }

        setStoreState(stateUpdate);
        render(<App />);

        // BUG CONDITION CHECK: The header should reflect the current status
        // The unfixed code's LocationBar only shows the node label, not the status
        
        // Look for status text anywhere in the header
        const header = document.querySelector('.app-header');
        expect(header).not.toBeNull();

        // EXPECTED BEHAVIOR: Header should show the current navigation status
        // This will FAIL on unfixed code because LocationBar only shows node label
        const statusText = screen.queryByText(new RegExp(to, 'i'));
        
        // BUG: On unfixed code, there's no status reflection in the header
        // The header only shows the node label (e.g., "Entrance") not the status
        expect(statusText).not.toBeNull(); // WILL FAIL on unfixed code
      }
    );

    it('FAILS on unfixed code: should show status label when status changes to NAVIGATING', async () => {
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'NAVIGATING',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
        destinationNode: floor.nodes[2],
        route: {
          instructions: [{ turn: 'straight', text: 'Walk to Office A', distance: 100 }],
          totalDistance: 100,
        },
        currentStep: 0,
      });

      render(<App />);

      // BUG CONDITION: Check if header reflects "NAVIGATING" status
      // The unfixed code's LocationBar shows only "Entrance" (node label)
      // It should show something like "Navigating to Office A" or "NAVIGATING"
      
      const header = document.querySelector('.app-header');
      const headerText = header?.textContent || '';

      // EXPECTED: Header text should indicate the NAVIGATING status
      // FAILING: unfixed code shows only the node label
      const hasNavigatingStatus = 
        headerText.toLowerCase().includes('navigating') ||
        headerText.toLowerCase().includes('navigating');

      expect(hasNavigatingStatus).toBe(true); // WILL FAIL on unfixed code
    });

    it('FAILS on unfixed code: should show status label when status changes to ROUTE_PREVIEW', async () => {
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'ROUTE_PREVIEW',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
        destinationNode: floor.nodes[2],
        route: {
          instructions: [{ turn: 'straight', text: 'Walk to Office A', distance: 100 }],
          totalDistance: 100,
        },
      });

      render(<App />);

      // BUG CONDITION: Check if header reflects "ROUTE_PREVIEW" status
      const header = document.querySelector('.app-header');
      const headerText = header?.textContent || '';

      // EXPECTED: Header should indicate route preview mode
      // FAILING: unfixed code shows only the node label
      const hasPreviewStatus = 
        headerText.toLowerCase().includes('preview') ||
        headerText.toLowerCase().includes('route');

      expect(hasPreviewStatus).toBe(true); // WILL FAIL on unfixed code
    });
  });

  describe('Counterexample documentation for unfixed code', () => {
    it('documents the bug: LocationBar Update button duplicates bottom sheet action', async () => {
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'ANCHORED',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
      });

      render(<App />);

      // COUNTEREXAMPLE 1: The redundant "Update" button in LocationBar
      const locationBar = document.querySelector('.location-bar');
      
      // This documents what we find in the unfixed code:
      if (locationBar) {
        const updateBtn = locationBar.querySelector('.location-bar__update');
        
        // BUG EVIDENCE: updateBtn exists and is clickable
        // This is a duplicate of the bottom sheet's update action
        if (updateBtn) {
          // Counterexample captured: LocationBar has redundant Update button
          // Expected: No Update button in LocationBar
          // Actual: Update button exists
          expect(updateBtn).toBeNull(); // WILL FAIL
        }
      }
    });

    it('documents the bug: Header shows only node label, not navigation status', async () => {
      const floor = createFloor();
      setStoreState({
        floor,
        floorLoading: false,
        status: 'NAVIGATING',
        currentNodeId: 'node-1',
        currentNode: floor.nodes[0],
        destinationNode: floor.nodes[2],
        route: {
          instructions: [{ turn: 'straight', text: 'Walk to Office A', distance: 100 }],
          totalDistance: 100,
        },
        currentStep: 0,
      });

      render(<App />);

      // COUNTEREXAMPLE 2: Header does not reflect NAVIGATING status
      const header = document.querySelector('.app-header');
      const locationBarLabel = document.querySelector('.location-bar__label');
      
      // BUG EVIDENCE: LocationBar label shows "Entrance" not "NAVIGATING"
      if (locationBarLabel) {
        const labelText = locationBarLabel.textContent;
        
        // Counterexample captured: Label shows node label, not status
        // Expected: Label/status surface shows "NAVIGATING" or navigation status
        // Actual: Label shows "Entrance" (just the node label)
        const showsStatus = 
          labelText?.toLowerCase().includes('navigating') ||
          labelText?.toLowerCase().includes('navigation');
        
        expect(showsStatus).toBe(true); // WILL FAIL
      }
    });
  });
});
