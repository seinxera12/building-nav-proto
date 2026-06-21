// components/FloorPlanLayer.jsx — Renders SVG (primary) or PNG (fallback) floor plan
// as Leaflet ImageOverlay with fade transitions on floor change.
import { useState, useCallback, useRef, useEffect } from 'react';
import { ImageOverlay, useMap } from 'react-leaflet';
import useNavStore from '../store/useNavStore';

/**
 * Transition timing tokens (mirrored from CSS custom properties):
 * --floor-fade-out: 250ms
 * --floor-fade-in:  300ms
 */
const FADE_OUT_MS = 250;
const FADE_IN_MS = 300;

/**
 * FloorPlanLayer renders the floor plan image on the Leaflet map with smooth
 * crossfade transitions when the floor changes.
 *
 * On floorId change:
 *   1. Fade out the current overlay (opacity 1 → 0 over 250ms)
 *   2. Swap the image source
 *   3. Fade in new overlay (opacity 0 → 1 over 300ms)
 *   4. After fade-in completes, dispatch 'floorplan:transitionend' event
 *      so that the route polyline redraws if navigation is active.
 *
 * Graceful degradation:
 *   - If SVG URL is unavailable or fails to load, falls back to PNG.
 *   - No errors thrown for missing assets.
 */
export default function FloorPlanLayer({ svgUrl, pngUrl, bounds, floorId }) {
  const map = useMap();

  // Track previous floorId to detect changes
  const prevFloorIdRef = useRef(floorId);
  // Track SVG load failure for graceful degradation (per-floor)
  const svgFailedRef = useRef({});
  // Track transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  // The URL currently being displayed (may lag behind props during transition)
  const [displayUrl, setDisplayUrl] = useState(null);
  // Opacity for the active overlay
  const [overlayOpacity, setOverlayOpacity] = useState(0.97);
  // Current floor ID being displayed
  const [displayFloorId, setDisplayFloorId] = useState(null);

  // Ref to the overlay's Leaflet element for direct DOM manipulation
  const overlayRef = useRef(null);
  // Ref for transition timers
  const fadeTimerRef = useRef(null);

  // Check if SVG failed for THIS floor
  const svgFailed = svgFailedRef.current[floorId] || false;
  
  // Determine the resolved URL (SVG primary, PNG fallback)
  const useSvg = svgUrl && !svgFailed;
  const resolvedUrl = useSvg ? svgUrl : pngUrl;

  // Debug logging
  useEffect(() => {
    console.log('[FloorPlanLayer] Props changed:', { floorId, svgUrl, pngUrl, resolvedUrl, displayUrl });
  }, [floorId, svgUrl, pngUrl, resolvedUrl, displayUrl]);

  // Initialize displayUrl on first render or when floorId changes significantly
  useEffect(() => {
    // Always update displayUrl when floorId changes (new floor = new URL)
    if (floorId !== displayFloorId) {
      console.log('[FloorPlanLayer] Floor switch detected:', { from: displayFloorId, to: floorId, url: resolvedUrl });
      setDisplayFloorId(floorId);
      setDisplayUrl(resolvedUrl);
      // Reset SVG failed state for new floor
      svgFailedRef.current[floorId] = false;
    } else if (displayUrl === null && resolvedUrl) {
      // Initial render
      setDisplayUrl(resolvedUrl);
    }
  }, [floorId, resolvedUrl, displayFloorId, displayUrl]);

  // Handle floor change with fade transition
  useEffect(() => {
    // Always trigger a fresh load when floorId changes - don't rely on resolvedUrl comparison
    if (floorId === prevFloorIdRef.current) {
      // Same floor — just update URL if it changed (e.g., SVG fallback to PNG)
      if (resolvedUrl !== displayUrl && !isTransitioning && displayFloorId === floorId) {
        setDisplayUrl(resolvedUrl);
      }
      return;
    }

    console.log('[FloorPlanLayer] Executing floor change transition:', { 
      from: prevFloorIdRef.current, 
      to: floorId,
      newUrl: resolvedUrl 
    });

    // Floor changed — run fade transition
    const oldFloorId = prevFloorIdRef.current;
    prevFloorIdRef.current = floorId;

    // Reset SVG failed state for new floor (use the ref, not useState)
    svgFailedRef.current[floorId] = false;

    // Clear any in-progress transition
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    setIsTransitioning(true);

    // Phase 1: Fade out (250ms)
    setOverlayOpacity(0);

    fadeTimerRef.current = setTimeout(() => {
      // Phase 2: Swap source (instant) - use the resolvedUrl from this render
      setDisplayUrl(resolvedUrl);
      setDisplayFloorId(floorId);

      // Phase 3: Fade in (300ms) — set opacity back, CSS transition handles animation
      // Small delay to allow the new image source to register before fading in
      requestAnimationFrame(() => {
        setOverlayOpacity(0.97);

        fadeTimerRef.current = setTimeout(() => {
          // Phase 4: Transition complete
          setIsTransitioning(false);

          // Dispatch event so route polyline redraws for the visible floor
          // if navigation is active (Requirement 15.3)
          const navStatus = useNavStore.getState().status;
          if (navStatus === 'NAVIGATING' || navStatus === 'REROUTING') {
            window.dispatchEvent(new CustomEvent('floorplan:transitionend', {
              detail: { floorId },
            }));
          }

          // Invalidate map size to ensure proper rendering
          map.invalidateSize({ animate: false });
        }, FADE_IN_MS);
      });
    }, FADE_OUT_MS);

    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [floorId, svgUrl, pngUrl, map, resolvedUrl]);

  // Handle SVG load error → fallback to PNG (using ref for per-floor tracking)
  const handleError = useCallback(() => {
    if (svgUrl && !svgFailedRef.current[floorId]) {
      console.warn(
        `[FloorPlanLayer] SVG failed to load: ${svgUrl}. Falling back to PNG.`
      );
      svgFailedRef.current[floorId] = true;
      setDisplayUrl(pngUrl);
    }
  }, [svgUrl, pngUrl, floorId]);

  // Attach error listener to the overlay's image element
  const handleOverlayAdd = useCallback(
    (e) => {
      const imgEl = e.target?.getElement?.();
      overlayRef.current = e.target;
      if (imgEl) {
        imgEl.addEventListener('error', handleError, { once: true });
        // Apply CSS transition for smooth opacity changes
        imgEl.style.transition = `opacity ${FADE_OUT_MS}ms ease-out`;
      }
    },
    [handleError]
  );

  // Update the DOM element's transition timing based on current phase
  useEffect(() => {
    const el = overlayRef.current?.getElement?.();
    if (!el) return;

    if (isTransitioning) {
      // During fade-out: use fade-out timing
      // During fade-in: switch to fade-in timing
      const timing = overlayOpacity === 0
        ? `opacity ${FADE_OUT_MS}ms ease-out`
        : `opacity ${FADE_IN_MS}ms ease-in`;
      el.style.transition = timing;
    } else {
      el.style.transition = `opacity ${FADE_IN_MS}ms ease-in`;
    }
  }, [isTransitioning, overlayOpacity]);

  if (!displayUrl) return null;

  return (
    <ImageOverlay
      url={displayUrl}
      bounds={bounds}
      opacity={overlayOpacity}
      eventHandlers={{
        add: handleOverlayAdd,
      }}
    />
  );
}
