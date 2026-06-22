// components/BottomSheet.jsx — idle + route preview + navigation bottom sheet overlay
// Requirements: 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3
import { useEffect, useRef, useState, useCallback } from 'react';
import useNavStore from '../store/useNavStore';

// Snap states configuration
const SNAP_STATES = {
  COLLAPSED: 'collapsed',
  EXPANDED: 'expanded',
};

// Height thresholds (in pixels) for snap decisions
const COLLAPSED_HEIGHT = 180;  // Compact height for NAVIGATING
const EXPANDED_HEIGHT = 400;   // Full expanded height
const SNAP_THRESHOLD = 50;     // Velocity threshold for snap decision
const VELOCITY_THRESHOLD = 0.5; // Min velocity (pixels/ms) to trigger snap direction

/**
 * BottomSheet floats above the map as an absolute overlay.
 * - UNLOCATED: render nothing
 * - ANCHORED (idle): location name, "Update" button, destination search, quick-access pills
 * - ROUTE_PREVIEW: destination summary, distance/time, Begin/Cancel buttons
 * - NAVIGATING: destination, distance/time, instruction text, action buttons, "Exit"
 * - REROUTING: shows "Recalculating..." within navigation state
 *
 * Dispatches `bottomsheet:resize` custom event with height so FloorMap can add
 * bottom padding and route lines aren't hidden behind it.
 * 
 * Supports drag gestures on the handle with snap states (collapsed/expanded).
 * NAVIGATING state defaults to compact (collapsed) height so the map stays visible.
 */
export default function BottomSheet({
  status,
  locationName,
  destinationName,
  distanceLabel,
  stepInfo,
  onUpdateLocation,
  onExit,
  onReached,
  onLost,
}) {
  const sheetRef = useRef(null);
  const prevStatusRef = useRef(status);
  
  // Drag state for sheet interaction
  const [sheetState, setSheetState] = useState(SNAP_STATES.COLLAPSED);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ y: 0, translateY: 0, time: 0 });
  const lastMoveRef = useRef({ y: 0, time: 0 });
  // Use refs to avoid stale closures in event listeners
  const isDraggingRef = useRef(isDragging);
  const translateYRef = useRef(translateY);
  
  // Keep refs in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  
  useEffect(() => {
    translateYRef.current = translateY;
  }, [translateY]);

  // Search state for idle mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const debounceRef = useRef(null);

  // Store actions
  const runSearch = useNavStore(s => s.runSearch);
  const searchResults = useNavStore(s => s.searchResults);
  const searchLoading = useNavStore(s => s.searchLoading);
  const selectDestination = useNavStore(s => s.selectDestination);
  const beginNavigation = useNavStore(s => s.beginNavigation);
  const cancelNavigation = useNavStore(s => s.cancelNavigation);
  const route = useNavStore(s => s.route);
  const currentStep = useNavStore(s => s.currentStep);
  const routeLoading = useNavStore(s => s.routeLoading);

  // Current instruction for navigation state
  const currentInstruction = route?.instructions?.[currentStep] || null;

  // Pixels per meter for distance display
  const PIXELS_PER_METER = 8;
  const totalSteps = route?.instructions?.length || 0;
  const walkMinutes = (() => {
    if (!route) return '';
    const totalDist = Number(route.totalDistance) || 0;
    if (totalDist <= 0) return '';
    const meters = totalDist / PIXELS_PER_METER;
    return `${Math.max(1, Math.round(meters / 1.4 / 60))} min`;
  })();

  // Dispatch height to map whenever the sheet renders or status changes
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) {
      window.dispatchEvent(new CustomEvent('bottomsheet:resize', { detail: { height: 0 } }));
      return;
    }

    const notify = () => {
      const baseHeight = el.offsetHeight;
      // translateY pushes content up from bottom, so effective visible height increases
      const effectiveHeight = baseHeight + translateYRef.current;
      window.dispatchEvent(new CustomEvent('bottomsheet:resize', { detail: { height: effectiveHeight } }));
    };

    notify();
    const ro = new ResizeObserver(notify);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  // Notify height changes during drag (throttled)
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const baseHeight = el.offsetHeight;
    const effectiveHeight = baseHeight + translateY;
    window.dispatchEvent(new CustomEvent('bottomsheet:resize', { detail: { height: effectiveHeight } }));
  }, [translateY]);

  // Track previous status for crossfade direction
  useEffect(() => {
    prevStatusRef.current = status;
  }, [status]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.trim().length < 2) {
      debounceRef.current = setTimeout(() => {
        setSearchOpen(false);
      }, 0);
      return () => clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery);
      setSearchOpen(true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, runSearch]);

  // Reset to compact (collapsed) state when entering NAVIGATING
  useEffect(() => {
    if (status === 'NAVIGATING' || status === 'REROUTING') {
      setSheetState(SNAP_STATES.COLLAPSED);
      setTranslateY(0);
    }
  }, [status]);

  // Drag handlers for the sheet handle
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      y: e.clientY,
      translateY: translateY,
      time: Date.now(),
    };
    lastMoveRef.current = { y: e.clientY, time: Date.now() };
  }, [translateY]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const deltaY = dragStartRef.current.y - e.clientY;
    const newTranslateY = Math.max(0, Math.min(deltaY, EXPANDED_HEIGHT - COLLAPSED_HEIGHT));
    setTranslateY(newTranslateY);
    
    lastMoveRef.current = { y: e.clientY, time: Date.now() };
  }, [isDragging]);

  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsDragging(false);
    
    // Determine snap target based on current translateY position
    // translateY increases when dragging upward (expands the sheet)
    const currentHeight = COLLAPSED_HEIGHT + translateY;
    const midPoint = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
    
    // Use position threshold to determine snap state
    const targetState = currentHeight > midPoint ? SNAP_STATES.EXPANDED : SNAP_STATES.COLLAPSED;
    
    // Animate to snap state
    if (targetState === SNAP_STATES.EXPANDED) {
      setTranslateY(EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
      setSheetState(SNAP_STATES.EXPANDED);
    } else {
      setTranslateY(0);
      setSheetState(SNAP_STATES.COLLAPSED);
    }
  }, [isDragging, translateY]);

  // Global pointer up listener to catch drags that go outside the component
  useEffect(() => {
    if (!isDragging) return;
    
    const onGlobalPointerUp = () => {
      if (!isDraggingRef.current) return;
      
      // Use the ref value for current translateY
      const currentTranslateY = translateYRef.current;
      
      // Determine snap target based on current translateY position
      const currentHeight = COLLAPSED_HEIGHT + currentTranslateY;
      const midPoint = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
      
      // Use position threshold to determine snap state
      const targetState = currentHeight > midPoint ? SNAP_STATES.EXPANDED : SNAP_STATES.COLLAPSED;
      
      // Animate to snap state
      if (targetState === SNAP_STATES.EXPANDED) {
        setTranslateY(EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
        setSheetState(SNAP_STATES.EXPANDED);
      } else {
        setTranslateY(0);
        setSheetState(SNAP_STATES.COLLAPSED);
      }
      
      setIsDragging(false);
    };
    
    const onGlobalPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      
      const deltaY = dragStartRef.current.y - e.clientY;
      const newTranslateY = Math.max(0, Math.min(deltaY, EXPANDED_HEIGHT - COLLAPSED_HEIGHT));
      setTranslateY(newTranslateY);
    };
    
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointermove', onGlobalPointerMove);
    
    return () => {
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointermove', onGlobalPointerMove);
    };
  }, [isDragging]);

  const handleSearchSelect = useCallback((nodeId, floorId) => {
    setSearchQuery('');
    setSearchOpen(false);
    selectDestination(nodeId, floorId);
  }, [selectDestination]);

  // Quick destination category handler
  const handleQuickSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  // Don't render when unlocated
  if (status === 'UNLOCATED') return null;

  const isNavigating = status === 'NAVIGATING' || status === 'REROUTING';
  const isPreview = status === 'ROUTE_PREVIEW';
  const isAnchored = status === 'ANCHORED';

  return (
    <div 
      className={`bottom-sheet bottom-sheet--${sheetState} ${isDragging ? 'bottom-sheet--dragging' : ''}`} 
      ref={sheetRef} 
      role="region" 
      aria-label="Navigation panel"
      data-sheet-state={sheetState}
      style={{ transform: `translateY(${-translateY}px)` }}
    >
      {/* Drag handle */}
      <div 
        className="bottom-sheet__handle" 
        aria-hidden="true"
        onPointerDown={handlePointerDown}
      >
        <span className="bottom-sheet__handle-pill" />
      </div>

      {/* Crossfade wrapper */}
      <div className="bottom-sheet__content">
        {/* ═══ IDLE STATE — ANCHORED ═══ */}
        <div
          className={`bottom-sheet__state bottom-sheet__state--idle ${isAnchored ? 'bottom-sheet__state--active' : ''}`}
          aria-hidden={!isAnchored}
        >
          <div className="bottom-sheet__location-row">
            <div className="bottom-sheet__location-info">
              <span className="bottom-sheet__location-icon" aria-hidden="true">📍</span>
              <span className="bottom-sheet__location-name">
                {locationName || 'Current Location'}
              </span>
            </div>
            <button
              className="bottom-sheet__update-btn"
              onClick={onUpdateLocation}
              type="button"
              aria-label="Update current location"
            >
              Update
            </button>
          </div>

          {/* Functional search bar */}
          <div className="bottom-sheet__search-wrap">
            <div className="bottom-sheet__search-input-row">
              <span className="bottom-sheet__search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                className="bottom-sheet__search-input"
                placeholder="Where do you want to go?"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search destinations"
              />
              {searchQuery && (
                <button
                  className="bottom-sheet__search-clear"
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                  type="button"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {searchOpen && (
              <ul className="bottom-sheet__search-results">
                {searchLoading ? (
                  <li className="bottom-sheet__search-item bottom-sheet__search-item--loading">Searching…</li>
                ) : searchResults.length === 0 ? (
                  <li className="bottom-sheet__search-item bottom-sheet__search-item--empty">No results found</li>
                ) : (
                  searchResults.map((r, i) => (
                    <li
                      key={`${r.node_id}-${i}`}
                      className="bottom-sheet__search-item"
                      onClick={() => handleSearchSelect(r.node_id, r.floorId)}
                    >
                      <span className="bottom-sheet__search-item-name">{r.name}</span>
                      <span className="bottom-sheet__search-item-cat">
                        {r.category}{r.floorName ? ` · ${r.floorName}` : ''}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {/* Quick destination pills */}
          <div className="bottom-sheet__pills" aria-label="Quick destinations">
            <button type="button" className="bottom-sheet__pill" onClick={() => handleQuickSearch('food')}>
              🍽️ Food Court
            </button>
            <button type="button" className="bottom-sheet__pill" onClick={() => handleQuickSearch('restroom')}>
              🚻 Restrooms
            </button>
            <button type="button" className="bottom-sheet__pill" onClick={() => handleQuickSearch('elevator')}>
              🛗 Elevator
            </button>
          </div>
        </div>

        {/* ═══ ROUTE PREVIEW STATE ═══ */}
        <div
          className={`bottom-sheet__state bottom-sheet__state--preview ${isPreview ? 'bottom-sheet__state--active' : ''}`}
          aria-hidden={!isPreview}
        >
          <div className="bottom-sheet__dest-row">
            <span className="bottom-sheet__dest-icon" aria-hidden="true">🏁</span>
            <span className="bottom-sheet__dest-name">{destinationName || 'Destination'}</span>
          </div>

          <div className="bottom-sheet__nav-meta">
            {distanceLabel && (
              <span className="bottom-sheet__distance">{distanceLabel}</span>
            )}
            {walkMinutes && (
              <span className="bottom-sheet__step-info">{walkMinutes} walk</span>
            )}
            {totalSteps > 0 && (
              <span className="bottom-sheet__step-info">{totalSteps} steps</span>
            )}
          </div>

          <div className="bottom-sheet__preview-actions">
            <button
              className="btn btn--primary bottom-sheet__action-btn"
              onClick={beginNavigation}
              disabled={routeLoading}
              type="button"
            >
              {routeLoading ? 'Computing…' : 'Begin Navigation'}
            </button>
            <button
              className="btn btn--secondary bottom-sheet__action-btn"
              onClick={cancelNavigation}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* ═══ NAVIGATION STATE — NAVIGATING / REROUTING ═══ */}
        <div
          className={`bottom-sheet__state bottom-sheet__state--nav ${isNavigating ? 'bottom-sheet__state--active' : ''}`}
          aria-hidden={!isNavigating}
        >
          <div className="bottom-sheet__dest-row">
            <span className="bottom-sheet__dest-icon" aria-hidden="true">🏁</span>
            <span className="bottom-sheet__dest-name">{destinationName || 'Destination'}</span>
          </div>

          {/* Current instruction */}
          {currentInstruction && status === 'NAVIGATING' && (
            <div className="bottom-sheet__instruction" aria-live="polite">
              <span className="bottom-sheet__instruction-text">
                {currentInstruction.text}
              </span>
            </div>
          )}

          {status === 'REROUTING' && (
            <div className="bottom-sheet__instruction bottom-sheet__instruction--rerouting">
              <span className="bottom-sheet__instruction-text">Recalculating route…</span>
            </div>
          )}

          <div className="bottom-sheet__nav-meta">
            {distanceLabel && (
              <span className="bottom-sheet__distance">{distanceLabel}</span>
            )}
            {stepInfo && (
              <span className="bottom-sheet__step-info">{stepInfo}</span>
            )}
          </div>

          <div className="bottom-sheet__nav-actions">
            <button
              className="btn btn--primary bottom-sheet__action-btn"
              onClick={onReached}
              type="button"
            >
              Next Step
            </button>
            <button
              className="btn btn--secondary bottom-sheet__action-btn"
              onClick={onLost}
              type="button"
            >
              I'm lost / Re-anchor
            </button>
          </div>

          <button
            className="bottom-sheet__exit-btn"
            onClick={onExit}
            type="button"
            aria-label="Exit navigation"
          >
            Exit Navigation
          </button>
        </div>
      </div>
    </div>
  );
}
