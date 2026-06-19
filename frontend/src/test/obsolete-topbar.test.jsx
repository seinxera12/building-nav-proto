/**
 * Bug Condition Exploration Test — Obsolete Top-Bar Removed and Status Reflected
 * 
 * Property 4: Bug Condition - Obsolete top-bar controls removed and status reflected
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * Validates: Requirements 1.8, 1.9 (Expected Behavior 2.8, 2.9)
 * 
 * Bug Condition: 
 * - The header has a redundant "Update" button (duplicate of bottom sheet action)
 * - The header shows only node label, not the navigation status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import App from '../App';
import useNavStore from '../store/useNavStore';
import { createFloor } from './testHelpers';

// Mock the store with proper state
vi.mock('../store/useNavStore', () => {
  const mockFunctions = {
    loadFloors: vi.fn(() => Promise.resolve([])),
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
    setDestinationNode: vi.fn(),
  };

  return {
    default: vi.fn((selector) => {
      // Create a mock state based on what's being selected
      const mockState = {
        // Core state
        status: 'UNLOCATED',
        currentNodeId: null,
        currentNode: null,
        floor: null,
        floorLoading: true,  // Start in loading state to prevent auto-load
        floorError: null,
        floorsById: new Map(),
        destinationNode: null,
        destinationNodeId: null,
        route: null,
        currentStep: 0,
        routeLoading: false,
        error: null,
        scanErrorRecovery: false,
        
        // Derived/computed
        loadFloors: mockFunctions.loadFloors,
        handleScan: mockFunctions.handleScan,
        anchorNode: mockFunctions.anchorNode,
        selectDestination: mockFunctions.selectDestination,
        beginNavigation: mockFunctions.beginNavigation,
        cancelNavigation: mockFunctions.cancelNavigation,
        advanceStep: mockFunctions.advanceStep,
        completeNavigation: mockFunctions.completeNavigation,
        setError: mockFunctions.setError,
        setScanErrorRecovery: mockFunctions.setScanErrorRecovery,
        toggleChat: mockFunctions.toggleChat,
        setDestinationNode: mockFunctions.setDestinationNode,
        
        // Chatbot state
        chatbot: { 
          isOpen: false, 
          messages: [], 
          isListening: false, 
          isProcessing: false, 
          isAvailable: true, 
          detectedLanguage: 'en', 
          selectedLanguage: null, 
          accessibilityMode: false, 
          sessionId: 'test-session', 
          candidates: [], 
          needsConfirmation: false 
        },
      };
      
      return selector ? selector(mockState) : mockState;
    }),
  };
});

// Helper to set store state for tests
function setStoreStatus(status, options = {}) {
  const store = useNavStore.getState?.() || useNavStore(null);
  // Update the mock state by re-calling the mock
  useNavStore.mockImplementation((selector) => {
    const mockState = {
      status,
      currentNodeId: options.currentNodeId || null,
      currentNode: options.currentNode || null,
      floor: options.floor || null,
      floorLoading: options.floorLoading !== undefined ? options.floorLoading : false,
      floorError: options.floorError || null,
      floorsById: options.floorsById || new Map(),
      destinationNode: options.destinationNode || null,
      destinationNodeId: options.destinationNodeId || null,
      route: options.route || null,
      currentStep: options.currentStep || 0,
      routeLoading: false,
      error: null,
      scanErrorRecovery: false,
      loadFloors: vi.fn(() => Promise.resolve([])),
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
      setDestinationNode: vi.fn(),
      chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
    };
    return selector ? selector(mockState) : mockState;
  });
}

describe('Property 4: Bug Condition — Obsolete top-bar controls removed and status reflected', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console.error to detect React warnings
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset mock to default state
    useNavStore.mockImplementation((selector) => {
      const mockState = {
        status: 'UNLOCATED',
        currentNodeId: null,
        currentNode: null,
        floor: null,
        floorLoading: false,
        floorError: null,
        floorsById: new Map(),
        destinationNode: null,
        destinationNodeId: null,
        route: null,
        currentStep: 0,
        routeLoading: false,
        error: null,
        scanErrorRecovery: false,
        loadFloors: vi.fn(() => Promise.resolve([])),
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
        setDestinationNode: vi.fn(),
        chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
      };
      return selector ? selector(mockState) : mockState;
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('Requirement 1.8: No redundant top-bar "Update" control', () => {
    /**
     * Test: Should NOT have redundant header "Update" button
     * 
     * Bug: The unfixed code has a LocationBar component in the header
     * with an "Update" button that duplicates the bottom sheet's update action
     * 
     * Expected after fix: No Update button in the header (bottom sheet is single source)
     */
    it('FAILS on unfixed code: should NOT have redundant header "Update" button', async () => {
      const floor = createFloor();
      
      // Set up state: ANCHORED with current node
      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status: 'ANCHORED',
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode: null,
          destinationNodeId: null,
          route: null,
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // BUG CONDITION CHECK: Look for the redundant header "Update" button
      // The unfixed code renders LocationBar with an "Update" button
      // This duplicates the bottom sheet's update action
      
      // Find the LocationBar's update button specifically
      const locationBarUpdateBtn = container.querySelector('.location-bar__update');
      
      // BUG CONFIRMED: locationBarUpdateBtn exists in unfixed code
      // This is the counterexample - the redundant Update button
      // Expected: locationBarUpdateBtn should be null (no redundant button)
      expect(locationBarUpdateBtn).toBeNull(); // WILL FAIL on unfixed code
    });

    /**
     * Test: LocationBar should not have duplicate update action
     * 
     * Bug: The header contains LocationBar with Update button
     * Expected after fix: LocationBar removed or Update button removed
     */
    it('FAILS on unfixed code: should not have LocationBar with duplicate update action', async () => {
      const floor = createFloor();
      
      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status: 'ANCHORED',
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode: null,
          destinationNodeId: null,
          route: null,
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // BUG CONDITION: LocationBar renders with class "location-bar"
      // containing a duplicate "Update" button
      const locationBars = container.querySelectorAll('.location-bar');
      
      // Expected: No LocationBar with Update button
      for (const bar of locationBars) {
        const updateBtn = bar.querySelector('.location-bar__update');
        expect(updateBtn).toBeNull(); // WILL FAIL on unfixed code
      }
    });
  });

  describe('Requirement 1.9: Header/status surface reflects current navigation status', () => {
    /**
     * Test: Header should reflect current navigation status
     * 
     * Bug: The unfixed code's LocationBar only shows the node label, not the status
     * Expected after fix: Header shows the current navigation status (e.g., "NAVIGATING")
     */
    it.each([
      { status: 'ANCHORED', expectedText: /anchored/i },
      { status: 'ROUTE_PREVIEW', expectedText: /preview|route/i },
      { status: 'NAVIGATING', expectedText: /navigating/i },
      { status: 'ARRIVED', expectedText: /arrived/i },
    ])('FAILS on unfixed code: header should reflect status "$status"', async ({ status, expectedText }) => {
      const floor = createFloor();
      
      const route = status === 'ROUTE_PREVIEW' || status === 'NAVIGATING' ? {
        instructions: [{ turn: 'straight', text: 'Go straight', distance: 50 }],
        totalDistance: 50,
      } : null;
      
      const destinationNode = status === 'ROUTE_PREVIEW' || status === 'NAVIGATING' 
        ? floor.nodes[2] 
        : null;

      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status,
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode,
          destinationNodeId: destinationNode?.id || null,
          route,
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // BUG CONDITION CHECK: The header should reflect the current status
      // The unfixed code's LocationBar only shows the node label, not the status
      
      const header = container.querySelector('.app-header');
      expect(header).not.toBeNull();

      // Look for status text anywhere in the header
      const headerText = header.textContent || '';
      
      // EXPECTED BEHAVIOR: Header should show the current navigation status
      // This will FAIL on unfixed code because LocationBar only shows node label
      const hasStatusText = expectedText.test(headerText);
      expect(hasStatusText).toBe(true); // WILL FAIL on unfixed code
    });

    /**
     * Test: When NAVIGATING, header should show navigating status
     */
    it('FAILS on unfixed code: should show status label when status changes to NAVIGATING', async () => {
      const floor = createFloor();
      
      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status: 'NAVIGATING',
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode: floor.nodes[2],
          destinationNodeId: 'node-3',
          route: {
            instructions: [{ turn: 'straight', text: 'Walk to Office A', distance: 100 }],
            totalDistance: 100,
          },
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // BUG CONDITION: Check if header reflects "NAVIGATING" status
      // The unfixed code's LocationBar shows only node label (e.g., "Entrance")
      // It should show something like "Navigating to Office A" or "NAVIGATING"
      
      const header = container.querySelector('.app-header');
      const headerText = header?.textContent || '';

      // EXPECTED: Header text should indicate the NAVIGATING status
      // FAILING: unfixed code shows only the node label
      const hasNavigatingStatus = 
        headerText.toLowerCase().includes('navigating');

      expect(hasNavigatingStatus).toBe(true); // WILL FAIL on unfixed code
    });
  });

  describe('Counterexample documentation for unfixed code', () => {
    /**
     * Documents counterexample: Redundant Update button in LocationBar
     */
    it('documents the bug: LocationBar Update button duplicates bottom sheet action', async () => {
      const floor = createFloor();
      
      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status: 'ANCHORED',
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode: null,
          destinationNodeId: null,
          route: null,
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // COUNTEREXAMPLE 1: The redundant "Update" button in LocationBar
      const locationBar = container.querySelector('.location-bar');
      
      // This documents what we find in the unfixed code:
      if (locationBar) {
        const updateBtn = locationBar.querySelector('.location-bar__update');
        
        // BUG EVIDENCE: updateBtn exists and is clickable
        // This is a duplicate of the bottom sheet's update action
        if (updateBtn) {
          // Counterexample captured: LocationBar has redundant Update button
          // Expected: No Update button in LocationBar
          // Actual: Update button exists
          expect(updateBtn).toBeNull(); // WILL FAIL - documents bug
        }
      }
    });

    /**
     * Documents counterexample: Header shows only node label, not navigation status
     */
    it('documents the bug: Header shows only node label, not navigation status', async () => {
      const floor = createFloor();
      
      useNavStore.mockImplementation((selector) => {
        const mockState = {
          status: 'NAVIGATING',
          currentNodeId: 'node-1',
          currentNode: floor.nodes[0],
          floor,
          floorLoading: false,
          floorError: null,
          floorsById: new Map([[floor.floorId, floor]]),
          destinationNode: floor.nodes[2],
          destinationNodeId: 'node-3',
          route: {
            instructions: [{ turn: 'straight', text: 'Walk to Office A', distance: 100 }],
            totalDistance: 100,
          },
          currentStep: 0,
          routeLoading: false,
          error: null,
          scanErrorRecovery: false,
          loadFloors: vi.fn(() => Promise.resolve([])),
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
          setDestinationNode: vi.fn(),
          chatbot: { isOpen: false, messages: [], isListening: false, isProcessing: false, isAvailable: true, detectedLanguage: 'en', selectedLanguage: null, accessibilityMode: false, sessionId: 'test-session', candidates: [], needsConfirmation: false },
        };
        return selector ? selector(mockState) : mockState;
      });

      const { container } = render(<App />);

      // COUNTEREXAMPLE 2: Header does not reflect NAVIGATING status
      const locationBarLabel = container.querySelector('.location-bar__label');
      
      // BUG EVIDENCE: LocationBar label shows node label, not status
      if (locationBarLabel) {
        const labelText = locationBarLabel.textContent;
        
        // Counterexample captured: Label shows node label, not status
        // Expected: Label/status surface shows "NAVIGATING" or navigation status
        // Actual: Label shows node label (e.g., "Entrance")
        const showsStatus = 
          labelText?.toLowerCase().includes('navigating') ||
          labelText?.toLowerCase().includes('navigation');
        
        expect(showsStatus).toBe(true); // WILL FAIL - documents bug
      }
    });
  });
});