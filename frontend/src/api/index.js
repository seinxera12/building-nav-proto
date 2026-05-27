// api/index.js — thin fetch wrapper for backend endpoints

const BASE = '';  // proxied by Vite dev server

/**
 * Fetch floor details, nodes, and POIs for a given floor.
 * GET /map/floor/:floorId
 */
export async function fetchFloor(floorId = 1) {
  const res = await fetch(`${BASE}/map/floor/${floorId}`);
  if (!res.ok) throw new Error(`Floor fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Search POIs by query string.
 * GET /search?q=:query
 */
export async function searchPOIs(query) {
  if (!query || query.trim().length < 2) return [];
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

/**
 * Compute shortest route between two node IDs.
 * GET /route?from_=:fromId&to=:toId
 */
export async function computeRoute(fromId, toId) {
  const res = await fetch(`${BASE}/route?from_=${fromId}&to=${toId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Route failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Simulate a QR scan event.
 * POST /scan
 */
export async function scanQR(qrCode) {
  const res = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_code: qrCode }),
  });
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}
