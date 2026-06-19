// api/index.js - backend fetches with localStorage-backed offline fallbacks

const BASE = ''; // proxied by Vite dev server
const SESSION_ID_KEY = 'qrnav:session-id';
const EVENT_QUEUE_KEY = 'qrnav:event-queue';
const CACHE_PREFIX = 'qrnav:cache:';
const QR_CACHE_KEY = `${CACHE_PREFIX}qr-codes`;
const GRAPH_CACHE_KEY = `${CACHE_PREFIX}graph`;

let offlineHandler = () => {};

export function setOfflineHandler(handler) {
  offlineHandler = typeof handler === 'function' ? handler : () => {};
}

function setOffline(value, metadata = {}) {
  offlineHandler(Boolean(value), metadata);
}

function cacheKey(name) {
  return `${CACHE_PREFIX}${name}`;
}

function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, cachedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn('Cache write failed:', key, err);
  }
}

function cachedData(key) {
  return readCache(key)?.data ?? null;
}

async function fetchJson(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed: ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function networkFirst(url, cacheName, timeoutMs = 3000, options = {}) {
  const key = cacheKey(cacheName);
  try {
    const data = await fetchJson(url, options, timeoutMs);
    writeCache(key, data);
    setOffline(false);
    return data;
  } catch (err) {
    const cached = cachedData(key);
    if (cached) {
      setOffline(true, { reason: err.message, cacheKey: key });
      return cached;
    }
    throw err;
  }
}

function routeCacheName(fromId, toId) {
  return `route:${fromId}:${toId}`;
}

function normalizeQrMap(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.qrCode] = row;
    return acc;
  }, {});
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function shortestPath(graph, fromId, toId, accessibleOnly = false) {
  const start = Number(fromId);
  const end = Number(toId);
  if (start === end) return [start];

  const nodes = new Map((graph.nodes || []).map(node => [node.id, node]));
  if (!nodes.has(start) || !nodes.has(end)) return [];

  const adj = new Map();
  for (const edge of graph.edges || []) {
    if (!edge.walkable && edge.walkable !== undefined) continue;
    if (accessibleOnly && edge.accessible === false) continue;
    const reverseCost = edge.reverse_cost ?? edge.cost;
    const fromList = adj.get(edge.from_node) || [];
    const toList = adj.get(edge.to_node) || [];
    fromList.push({ nodeId: edge.to_node, cost: Number(edge.cost) || 0 });
    toList.push({ nodeId: edge.from_node, cost: Number(reverseCost) || 0 });
    adj.set(edge.from_node, fromList);
    adj.set(edge.to_node, toList);
  }

  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const visited = new Set();

  while (visited.size < nodes.size) {
    let current = null;
    let currentDist = Infinity;
    for (const [nodeId, nodeDist] of dist.entries()) {
      if (!visited.has(nodeId) && nodeDist < currentDist) {
        current = nodeId;
        currentDist = nodeDist;
      }
    }
    if (current === null || current === end) break;
    visited.add(current);

    for (const edge of adj.get(current) || []) {
      const nextDist = currentDist + edge.cost;
      if (nextDist < (dist.get(edge.nodeId) ?? Infinity)) {
        dist.set(edge.nodeId, nextDist);
        prev.set(edge.nodeId, current);
      }
    }
  }

  if (!prev.has(end)) return [];
  const path = [];
  let node = end;
  while (node !== undefined) {
    path.push(node);
    node = prev.get(node);
  }
  return path.reverse();
}

function computeTurn(prev, curr, next) {
  const v1x = curr.x - prev.x;
  const v1y = curr.y - prev.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 20 || len2 < 20) return 'straight';

  let angle = (Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x)) * (180 / Math.PI);
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  if (Math.abs(angle) < 30) return 'straight';
  if (Math.abs(angle) > 150) return 'u_turn';
  return angle > 0 ? 'right' : 'left';
}

const FLOOR_TRANSITION_TYPES = new Set(['elevator', 'stairs', 'escalator']);

function instructionText(turn, curr, next, toFloorId) {
  if (FLOOR_TRANSITION_TYPES.has(turn)) {
    const verb = turn === 'stairs' ? 'Take the stairs'
               : turn === 'escalator' ? 'Take the escalator'
               : 'Take the elevator';
    return `${verb} at ${curr.label} to Floor ${toFloorId ?? '?'}`;
  }
  const templates = {
    start:       `Start at ${curr.label}, head toward ${next.label}`,
    straight:    `Continue straight toward ${next.label}`,
    left:        `Turn left at ${curr.label}`,
    right:       `Turn right at ${curr.label}`,
    u_turn:      `Turn around at ${curr.label}`,
    destination: `Arrive at ${curr.label}`,
  };
  return templates[turn] || `Continue to ${next.label}`;
}

function buildOfflineRoute(graph, fromId, toId, accessibleOnly = false) {
  const path = shortestPath(graph, fromId, toId, accessibleOnly);
  if (!path.length) return null;

  const nodeMap = new Map((graph.nodes || []).map(node => [node.id, node]));
  // Build edge lookup: "u:v" → edge for floor_change / edge_type
  const edgeMap = new Map();
  for (const edge of graph.edges || []) {
    edgeMap.set(`${edge.from_node}:${edge.to_node}`, edge);
    edgeMap.set(`${edge.to_node}:${edge.from_node}`, edge);
  }
  const qrRows = Object.values(cachedData(QR_CACHE_KEY) || {});
  const qrByNodeId = new Map(qrRows.map(qr => [qr.nodeId, qr]));
  const instructions = [];
  const floorTransitions = [];

  for (let index = 0; index < path.length; index += 1) {
    const curr = nodeMap.get(path[index]);
    if (!curr) continue;

    const currFloorId = curr.floor_id ?? null;
    let turn = 'destination';
    let dist = 0;
    let next = curr;
    let toFloorId = null;
    let isTransition = false;

    if (index === 0 && path.length > 1) {
      next = nodeMap.get(path[index + 1]);
      turn = 'start';
      dist = distance(curr, next);
    } else if (index < path.length - 1) {
      next = nodeMap.get(path[index + 1]);
      const edgeKey = `${path[index]}:${path[index + 1]}`;
      const edge = edgeMap.get(edgeKey);
      const edgeType = edge?.edge_type ?? 'walkable';
      const floorChange = edge?.floor_change ?? false;
      const nextFloorId = next.floor_id ?? null;

      if ((floorChange || FLOOR_TRANSITION_TYPES.has(edgeType)) && currFloorId !== nextFloorId) {
        turn = FLOOR_TRANSITION_TYPES.has(edgeType) ? edgeType : 'elevator';
        dist = 0;
        toFloorId = nextFloorId;
        isTransition = true;
        floorTransitions.push({
          fromFloor: currFloorId,
          toFloor: nextFloorId,
          connectorNodeId: path[index],
          type: turn,
        });
      } else {
        const prev = nodeMap.get(path[index - 1]);
        turn = computeTurn(prev, curr, next);
        dist = distance(curr, next);
      }
    }

    const inst = {
      step: instructions.length + 1,
      text: instructionText(turn, curr, next, toFloorId),
      distance: Math.round(dist * 10) / 10,
      turn,
      nodeId: curr.id,
      floorId: currFloorId,
    };
    if (isTransition) {
      inst.toFloorId = toFloorId;
      inst.nodeLabel = curr.label;
    }
    instructions.push(inst);
  }

  const totalDistance = path
    .slice(0, -1)
    .reduce((sum, nodeId, index) => {
      const edge = edgeMap.get(`${nodeId}:${path[index + 1]}`);
      if (edge?.floor_change) return sum; // don't add connector "distance"
      return sum + distance(nodeMap.get(nodeId), nodeMap.get(path[index + 1]));
    }, 0);

  return {
    path,
    instructions,
    checkpoints: path.slice(1, -1)
      .map(nodeId => qrByNodeId.get(nodeId))
      .filter(Boolean)
      .map(qr => ({ nodeId: qr.nodeId, qrCode: qr.qrCode, label: qr.label })),
    totalDistance: Math.round(totalDistance * 10) / 10,
    floorTransitions,
  };
}

export function getCachedQrCheckpoints() {
  return Object.values(cachedData(QR_CACHE_KEY) || {});
}

export function getCachedGraph() {
  return cachedData(GRAPH_CACHE_KEY);
}

export function getCacheMetadata() {
  const values = [QR_CACHE_KEY, GRAPH_CACHE_KEY]
    .map(key => readCache(key)?.cachedAt)
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite);

  return values.length ? { cachedAt: new Date(Math.min(...values)).toISOString() } : null;
}

export async function fetchFloor(floorId = 1) {
  try {
    return await networkFirst(`${BASE}/map/floor/${floorId}`, `floor:${floorId}`, 3000);
  } catch (err) {
    // If the error is a JSON parse error, re-throw with context
    if (err.message?.includes('Unexpected token')) {
      throw new Error(`Failed to parse floor data for ID ${floorId}. Check if the backend is running and returning valid JSON.`);
    }
    throw err;
  }
}

export async function fetchFloors(buildingId = 1) {
  return fetchJson(`${BASE}/buildings/${buildingId}/floors`, {}, 3000);
}

export async function fetchAllQrCodes() {
  const rows = await networkFirst(`${BASE}/qr-codes/all`, 'qr-codes:list', 3000);
  const map = normalizeQrMap(rows);
  writeCache(QR_CACHE_KEY, map);
  return rows;
}

export async function fetchGraph() {
  const graph = await networkFirst(`${BASE}/graph`, 'graph:latest', 3000);
  writeCache(GRAPH_CACHE_KEY, graph);
  return graph;
}

export async function seedCommonRoutes(floor) {
  const qrCodes = getCachedQrCheckpoints();
  const entrance = qrCodes.find(qr => qr.type === 'entrance') || qrCodes[0];
  const poiNodeIds = (floor?.pois || []).map(poi => poi.node_id);
  if (!entrance || !poiNodeIds.length) return;

  await Promise.allSettled(
    poiNodeIds.map(nodeId => computeRoute(entrance.nodeId, nodeId)),
  );
}

export async function searchPOIs(query) {
  if (!query || query.trim().length < 2) return [];
  const res = await fetchJson(`${BASE}/search?q=${encodeURIComponent(query.trim())}`, {}, 2500);
  return res;
}

export async function computeRoute(fromId, toId, accessibleOnly = false) {
  const name = routeCacheName(fromId, toId) + (accessibleOnly ? ':accessible' : '');
  try {
    return await networkFirst(`${BASE}/route?from_=${fromId}&to=${toId}${accessibleOnly ? '&accessible_only=true' : ''}`, name, 3000);
  } catch (err) {
    const graph = cachedData(GRAPH_CACHE_KEY);
    const route = graph ? buildOfflineRoute(graph, fromId, toId, accessibleOnly) : null;
    if (route) {
      writeCache(cacheKey(name), route);
      setOffline(true, { reason: err.message, fallback: 'client-route' });
      return route;
    }
    throw err;
  }
}

export async function sendChatRequest(body) {
  return fetchJson(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 10000);
}

export async function scanQR(qrCode) {
  const normalizedQrCode = normalizeQrPayload(qrCode);
  try {
    const result = await fetchJson(`${BASE}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_code: normalizedQrCode }),
    }, 2000);
    const cachedMap = cachedData(QR_CACHE_KEY) || {};
    cachedMap[normalizedQrCode] = {
      qrCode: normalizedQrCode,
      nodeId: result.nodeId,
      label: result.label,
      x: result.x,
      y: result.y,
      type: result.type,
      floorId: result.floorId,
    };
    writeCache(QR_CACHE_KEY, cachedMap);
    setOffline(false);
    return result;
  } catch (err) {
    const qr = cachedData(QR_CACHE_KEY)?.[normalizedQrCode];
    if (!qr) throw err;
    setOffline(true, { reason: err.message, fallback: 'qr-cache' });
    return {
      nodeId: qr.nodeId,
      label: qr.label,
      x: qr.x,
      y: qr.y,
      type: qr.type,
      floorId: qr.floorId,
    };
  }
}

export function normalizeQrPayload(payload) {
  const value = String(payload || '').trim();
  if (!value) return value;

  try {
    const url = new URL(value);
    return url.searchParams.get('loc') || value;
  } catch {
    return value;
  }
}

function readEventQueue() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeEventQueue(queue) {
  localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue.slice(-50)));
}

export async function flushEventQueue() {
  const queue = readEventQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const event of queue) {
    try {
      await fetchJson(`${BASE}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }, 3000);
    } catch {
      remaining.push(event);
    }
  }
  writeEventQueue(remaining);
}

export async function logEvent(eventType, payload = {}) {
  const event = {
    session_id: getSessionId(),
    event_type: eventType,
    payload,
  };

  try {
    await fetchJson(`${BASE}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }, 2000);
  } catch {
    writeEventQueue([...readEventQueue(), event]);
    setOffline(true, { fallback: 'event-queue' });
  }
}

export async function healthPing() {
  return fetchJson(`${BASE}/health`, {}, 3000);
}
// Floor viewport persistence
const VIEWPORT_PREFIX = 'qrnav:viewport:';

export function saveFloorViewport(floorId, viewport) {
  try {
    localStorage.setItem(`${VIEWPORT_PREFIX}${floorId}`, JSON.stringify(viewport));
  } catch (err) {
    console.warn('Failed to save floor viewport:', err);
  }
}

export function getFloorViewport(floorId) {
  try {
    const data = localStorage.getItem(`${VIEWPORT_PREFIX}${floorId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}