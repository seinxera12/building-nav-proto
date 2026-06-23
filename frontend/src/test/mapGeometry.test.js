// mapGeometry.test.js — Unit tests for pure geometry helpers.
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Leaflet uses browser APIs; provide a minimal stub so L.latLngBounds works
// in the jsdom environment without a real map instance.
beforeAll(() => {
  // L.latLngBounds is called by routeLatLngBounds
  // The real leaflet is imported in mapGeometry.js; jsdom provides enough for it.
});

import {
  segmentBearingDeg,
  nextHeadingNode,
  routeLatLngBounds,
} from '../components/mapGeometry.js';

// ── segmentBearingDeg ───────────────────────────────────────────────────────

describe('segmentBearingDeg', () => {
  it('returns 0 for null inputs', () => {
    expect(segmentBearingDeg(null, null)).toBe(0);
    expect(segmentBearingDeg({ x: 0, y: 0 }, null)).toBe(0);
    expect(segmentBearingDeg(null, { x: 0, y: 0 })).toBe(0);
  });

  it('straight up on screen: b is above a (pixel y decreases upward)', () => {
    // a=(100,200), b=(100,100): same x, b.y < a.y → dy = 200-100 = 100 > 0 → bearing 0
    const a = { x: 100, y: 200 };
    const b = { x: 100, y: 100 };
    expect(segmentBearingDeg(a, b)).toBeCloseTo(0, 5);
  });

  it('straight down on screen: b.y > a.y → bearing 180', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 100, y: 200 };
    expect(segmentBearingDeg(a, b)).toBeCloseTo(180, 5);
  });

  it('straight right on screen: b.x > a.x, same y → bearing 90', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 200, y: 100 };
    expect(segmentBearingDeg(a, b)).toBeCloseTo(90, 5);
  });

  it('straight left on screen: b.x < a.x, same y → bearing 270', () => {
    const a = { x: 200, y: 100 };
    const b = { x: 100, y: 100 };
    expect(segmentBearingDeg(a, b)).toBeCloseTo(270, 5);
  });

  it('diagonal: up-right at 45°', () => {
    const a = { x: 0, y: 100 };
    const b = { x: 100, y: 0 }; // dx=100, dy=100 → atan2(100,100)=45°
    expect(segmentBearingDeg(a, b)).toBeCloseTo(45, 5);
  });

  it('diagonal: down-left at 225°', () => {
    const a = { x: 100, y: 0 };
    const b = { x: 0, y: 100 }; // dx=-100, dy=-100 → atan2(-100,-100)=-135° → 225°
    expect(segmentBearingDeg(a, b)).toBeCloseTo(225, 5);
  });

  it('normalises negative atan2 result to [0, 360)', () => {
    // Any bearing should be in [0, 360)
    const cases = [
      [{ x: 0, y: 0 }, { x: -1, y: 1 }],
      [{ x: 0, y: 0 }, { x: -1, y: -1 }],
    ];
    for (const [a, b] of cases) {
      const deg = segmentBearingDeg(a, b);
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThan(360);
    }
  });
});

// ── nextHeadingNode ────────────────────────────────────────────────────────

describe('nextHeadingNode', () => {
  const nodeA = { id: 1, x: 0, y: 0 };
  const nodeB = { id: 2, x: 100, y: 0 };
  const nodeC = { id: 3, x: 200, y: 0 };
  // duplicate-position node (same coords as nodeB)
  const nodeBdup = { id: 4, x: 100, y: 0 };

  const nodeById = new Map([
    [1, nodeA],
    [2, nodeB],
    [3, nodeC],
    [4, nodeBdup],
  ]);

  it('returns the next different-position node', () => {
    const route = { path: [1, 2, 3] };
    expect(nextHeadingNode(route, 1, nodeById)).toBe(nodeB);
  });

  it('returns null at end of path', () => {
    const route = { path: [1, 2, 3] };
    expect(nextHeadingNode(route, 3, nodeById)).toBeNull();
  });

  it('returns null when currentNodeId not in path', () => {
    const route = { path: [1, 2, 3] };
    expect(nextHeadingNode(route, 99, nodeById)).toBeNull();
  });

  it('skips duplicate-position nodes', () => {
    // path: 2 → 4(dup of B) → 3
    const route = { path: [2, 4, 3] };
    // from node 2 (x:100,y:0), node 4 has same pos → should skip to node 3
    expect(nextHeadingNode(route, 2, nodeById)).toBe(nodeC);
  });

  it('returns null when remaining nodes are all missing from nodeById', () => {
    const route = { path: [1, 99, 100] };
    expect(nextHeadingNode(route, 1, nodeById)).toBeNull();
  });

  it('handles null/missing route gracefully', () => {
    expect(nextHeadingNode(null, 1, nodeById)).toBeNull();
    expect(nextHeadingNode({ path: [] }, 1, nodeById)).toBeNull();
  });
});

// ── routeLatLngBounds ──────────────────────────────────────────────────────

describe('routeLatLngBounds', () => {
  const maxY = 1000;
  const nodeA = { id: 1, x: 100, y: 200 };
  const nodeB = { id: 2, x: 400, y: 600 };
  const nodeC = { id: 3, x: 700, y: 300 };

  const nodeById = new Map([
    [1, nodeA],
    [2, nodeB],
    [3, nodeC],
  ]);

  it('returns null for empty route', () => {
    expect(routeLatLngBounds({ path: [] }, nodeById, maxY)).toBeNull();
  });

  it('returns null when route is null/undefined', () => {
    expect(routeLatLngBounds(null, nodeById, maxY)).toBeNull();
    expect(routeLatLngBounds(undefined, nodeById, maxY)).toBeNull();
  });

  it('returns null for single point (need at least 2)', () => {
    expect(routeLatLngBounds({ path: [1] }, nodeById, maxY)).toBeNull();
  });

  it('returns null when no path nodes found in nodeById', () => {
    expect(routeLatLngBounds({ path: [99, 100] }, nodeById, maxY)).toBeNull();
  });

  it('returns bounds object for 2+ valid nodes', () => {
    const bounds = routeLatLngBounds({ path: [1, 2, 3] }, nodeById, maxY);
    expect(bounds).not.toBeNull();
    expect(typeof bounds.getSouth).toBe('function'); // L.LatLngBounds
  });

  it('bounds contain the correct latlng points (CRS.Simple: lat = maxY - y, lng = x)', () => {
    const bounds = routeLatLngBounds({ path: [1, 2] }, nodeById, maxY);
    // nodeA → lat=800, lng=100; nodeB → lat=400, lng=400
    expect(bounds.getSouth()).toBeCloseTo(Math.min(800, 400), 1);
    expect(bounds.getNorth()).toBeCloseTo(Math.max(800, 400), 1);
    expect(bounds.getWest()).toBeCloseTo(Math.min(100, 400), 1);
    expect(bounds.getEast()).toBeCloseTo(Math.max(100, 400), 1);
  });

  it('filters out node IDs not present in nodeById (cross-floor)', () => {
    // node 99 is not in nodeById (cross-floor); only 1 and 2 should be used
    const bounds = routeLatLngBounds({ path: [1, 99, 2] }, nodeById, maxY);
    expect(bounds).not.toBeNull();
  });
});
