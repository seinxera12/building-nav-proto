// components/AnimatedRoutePolyline.jsx — Animated route polyline with walked/remaining segments
import { Polyline } from 'react-leaflet';

/**
 * AnimatedRoutePolyline renders the navigation route as two visually
 * distinct segments (walked vs remaining) with CSS-animated dash flow,
 * drop-shadow depth, and a ghost of the previous route during rerouting.
 *
 * Props:
 *   walkedPositions: [number, number][]         — already-traversed portion
 *   remainingPositions: [number, number][]      — upcoming portion (animated)
 *   previousRoutePositions: [number, number][]  — ghost shown during REROUTING
 *   status: string                              — current NavigationStatus
 */
export default function AnimatedRoutePolyline({
  walkedPositions = [],
  remainingPositions = [],
  previousRoutePositions = [],
  status,
}) {
  const hasWalked = walkedPositions.length >= 2;
  const hasRemaining = remainingPositions.length >= 2;
  const hasPrevious = previousRoutePositions.length >= 2;
  const isRerouting = status === 'REROUTING';

  // Guard: render nothing if no valid segments
  if (!hasWalked && !hasRemaining && !(isRerouting && hasPrevious)) {
    return null;
  }

  return (
    <>
      {/* ── Ghost of previous route during REROUTING ── */}
      {isRerouting && hasPrevious && (
        <Polyline
          positions={previousRoutePositions}
          pathOptions={{
            color: 'var(--nav-route, #2196F3)',
            weight: 4,
            opacity: 0.2,
            dashArray: '6, 10',
            lineCap: 'round',
            lineJoin: 'round',
          }}
          className="route-polyline route-polyline--ghost"
        />
      )}

      {/* ── Walked segment: reduced opacity, dashed style ── */}
      {hasWalked && (
        <Polyline
          positions={walkedPositions}
          pathOptions={{
            color: 'var(--nav-route-walked, #6366f1)',
            weight: 4,
            opacity: 0.4,
            dashArray: '8, 12',
            lineCap: 'round',
            lineJoin: 'round',
          }}
          className="route-polyline route-polyline--walked"
        />
      )}

      {/* ── Remaining segment: full opacity with animated dash + drop shadow ── */}
      {hasRemaining && (
        <>
          {/* Shadow halo for depth against floor plan */}
          <Polyline
            positions={remainingPositions}
            pathOptions={{
              color: '#1a237e',
              weight: 9,
              opacity: 0.3,
              lineCap: 'round',
              lineJoin: 'round',
            }}
            className="route-polyline route-polyline--shadow"
          />
          {/* Animated bright core */}
          <Polyline
            positions={remainingPositions}
            pathOptions={{
              color: 'var(--nav-route, #2196F3)',
              weight: 5,
              opacity: 1.0,
              dashArray: '12, 8',
              lineCap: 'round',
              lineJoin: 'round',
            }}
            className="route-polyline route-polyline--remaining"
          />
        </>
      )}
    </>
  );
}
