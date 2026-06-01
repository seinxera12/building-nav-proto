import useNavStore from '../store/useNavStore';
import { animateNodePath, animateRouteSegment } from './animateProgress';

function findNodeByLabel(label) {
  const nodes = useNavStore.getState().floor?.nodes || [];
  return nodes.find(node => node.label === label) || null;
}

function scan(qrCode) {
  return useNavStore.getState().handleScan(qrCode);
}

function selectDestinationByLabel(label) {
  const dest = findNodeByLabel(label);
  if (!dest) return undefined;
  return useNavStore.getState().selectDestination(dest.id);
}

function animateToPreArrivalNode(durationMs) {
  const state = useNavStore.getState();
  const routePath = state.route?.path || [];
  const currentNodeId = state.currentNodeId;
  const targetNodeId = routePath.at(-2);

  if (!currentNodeId || !targetNodeId) return Promise.resolve();

  const startIndex = routePath.indexOf(currentNodeId);
  const endIndex = routePath.indexOf(targetNodeId);
  if (startIndex < 0 || endIndex < 0) return Promise.resolve();

  const sliceIds = startIndex <= endIndex
    ? routePath.slice(startIndex, endIndex + 1)
    : routePath.slice(endIndex, startIndex + 1).reverse();

  return animateNodePath(sliceIds, durationMs);
}

async function animateIntoDestinationThenScan(qrCode, durationMs) {
  const routePath = useNavStore.getState().route?.path || [];
  const preArrivalNodeId = routePath.at(-2);
  const destinationNodeId = routePath.at(-1);

  if (preArrivalNodeId && destinationNodeId) {
    await animateNodePath([preArrivalNodeId, destinationNodeId], durationMs);
  }

  return scan(qrCode);
}

export function buildCafeteriaScenario() {
  return {
    id: 'lobby-cafeteria',
    name: 'Lobby to Cafeteria',
    description: 'A full demo run that uses the real cafeteria route and a real checkpoint QR.',
    steps: [
      {
        label: 'Scan the lobby QR to set the start position',
        execute: () => scan('QR_LOBBY_MAIN'),
      },
      {
        label: 'Pick Cafeteria from search',
        execute: () => selectDestinationByLabel('Cafeteria'),
      },
      {
        label: 'Walk toward the center junction',
        execute: () => animateRouteSegment('Main Lobby', 'Center Junction', 1800),
      },
      {
        label: 'Scan the center junction checkpoint',
        execute: () => scan('QR_CENTER_JCT'),
      },
      {
        label: 'Continue down the corridor',
        execute: () => animateToPreArrivalNode(1600),
      },
      {
        label: 'Scan the cafeteria QR to arrive',
        execute: () => animateIntoDestinationThenScan('QR_CAFETERIA', 900),
      },
    ],
  };
}

export function buildRerouteScenario() {
  return {
    id: 'reroute-demo',
    name: 'Reroute Demo',
    description: 'A wrong scan triggers rerouting and shows the recalculation overlay.',
    steps: [
      {
        label: 'Scan the lobby QR',
        execute: () => scan('QR_LOBBY_MAIN'),
      },
      {
        label: 'Start a route to Cafeteria',
        execute: () => selectDestinationByLabel('Cafeteria'),
      },
      {
        label: 'Walk partway down the route',
        execute: () => animateRouteSegment('Main Lobby', 'Center Junction', 1400),
      },
      {
        label: 'Scan the wrong QR on purpose',
        execute: () => scan('QR_STAIRWELL_A'),
      },
      {
        label: 'Follow the recalculated route',
        execute: () => animateToPreArrivalNode(1800),
      },
      {
        label: 'Scan the cafeteria QR again',
        execute: () => animateIntoDestinationThenScan('QR_CAFETERIA', 900),
      },
    ],
  };
}

export const SIMULATION_SCENARIOS = [
  {
    id: 'lobby-cafeteria',
    label: 'Lobby to Cafeteria',
    build: buildCafeteriaScenario,
  },
  {
    id: 'reroute-demo',
    label: 'Reroute Demo',
    build: buildRerouteScenario,
  },
];
