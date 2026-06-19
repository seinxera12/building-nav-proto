/**
 * Test helpers for QR Nav UI tests
 */

/**
 * Creates a mock floor object with nodes, POIs, and QR codes
 */
export function createFloor(floorId = 1, floorNum = 1, floorName = 'Ground Floor') {
  return {
    floorId,
    floorNum,
    floorName,
    nodes: [
      { id: 'node-1', x: 100, y: 100, label: 'Entrance', type: 'checkpoint' },
      { id: 'node-2', x: 200, y: 200, label: 'Reception', type: 'poi' },
      { id: 'node-3', x: 300, y: 300, label: 'Office A', type: 'destination' },
      { id: 'node-4', x: 400, y: 400, label: 'Stairs', type: 'transition' },
      { id: 'node-5', x: 500, y: 500, label: 'Elevator', type: 'transition' },
    ],
    pois: [
      { id: 'poi-1', node_id: 'node-2', name: 'Reception Desk', category: 'service' },
      { id: 'poi-2', node_id: 'node-3', name: 'Office A', category: 'destination' },
    ],
    qrCodes: [
      { qr_code: 'qr-entrance', node_id: 'node-1', label: 'Entrance QR' },
      { qr_code: 'qr-reception', node_id: 'node-2', label: 'Reception QR' },
      { qr_code: 'qr-office-a', node_id: 'node-3', label: 'Office A QR' },
    ],
  };
}

/**
 * Creates a mock route with instructions
 */
export function createRoute(startNodeId, endNodeId, instructions = []) {
  return {
    startNodeId,
    endNodeId,
    totalDistance: instructions.reduce((sum, inst) => sum + (inst.distance || 0), 0),
    instructions: instructions.length > 0 
      ? instructions 
      : [
          { turn: 'straight', text: 'Go straight', distance: 50 },
          { turn: 'left', text: 'Turn left', distance: 30 },
          { turn: 'right', text: 'Turn right', distance: 20 },
        ],
  };
}

/**
 * Status values for navigation state machine
 */
export const NAVIGATION_STATUS = {
  UNLOCATED: 'UNLOCATED',
  ANCHORED: 'ANCHORED',
  ROUTE_PREVIEW: 'ROUTE_PREVIEW',
  NAVIGATING: 'NAVIGATING',
  REROUTING: 'REROUTING',
  ARRIVED: 'ARRIVED',
};