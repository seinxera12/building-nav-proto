// mapGeometry.js — Pure geometry helpers for FloorMap camera logic.
// All functions are coordinate-system-aware:
//   CRS.Simple latlng = [maxY - pixelY, pixelX]
//   Screen Y increases downward; Leaflet lat increases upward.

import L from 'leaflet';

/**
 * Bearing (degrees clockwise from screen-up) for the segment A → B.
 * Screen Y is flipped vs pixel Y, so we use (a.y - b.y) as the "up" axis.
 * 0° = segment points straight up on screen; 90° = right; 180° = down.
 */
export function segmentBearingDeg(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = a.y - b.y; // flip: screen-up = pixel-y decreasing
  const deg = Math.atan2(dx, dy) * (180 / Math.PI);
  return ((deg % 360) + 360) % 360; // normalise to [0, 360)
}

/**
 * Returns the first node on route.path after currentNodeId that has a
 * different (x, y) position — skips zero-length/duplicate-position nodes.
 * Returns null when at the end of the path or not found.
 */
export function nextHeadingNode(route, currentNodeId, nodeById) {
  const path = route?.path || [];
  const i = path.indexOf(currentNodeId);
  if (i < 0) return null;
  const current = nodeById.get(currentNodeId);
  for (let j = i + 1; j < path.length; j++) {
    const n = nodeById.get(path[j]);
    if (!n) continue;
    if (!current || n.x !== current.x || n.y !== current.y) return n;
  }
  return null;
}

/**
 * Returns an L.LatLngBounds covering all nodes in route.path that exist in
 * nodeById (i.e. on the current floor). Returns null when fewer than 2 points
 * are found — caller should fall back to imageBounds.
 *
 * toLatLng: (node, maxY) => [maxY - node.y, node.x]
 */
export function routeLatLngBounds(route, nodeById, maxY) {
  const pts = (route?.path || [])
    .map(id => nodeById.get(id))
    .filter(Boolean)
    .map(n => [maxY - n.y, n.x]);

  if (pts.length < 2) return null;
  return L.latLngBounds(pts);
}
