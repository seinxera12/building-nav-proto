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

function beginNavigation() {
  return useNavStore.getState().beginNavigation();
}

function confirmHere() {
  return useNavStore.getState().advanceStep();
}

function confirmUntilArrived() {
  const nav = useNavStore.getState();
  const route = nav.route;
  if (!route) return undefined;

  const remaining = Math.max(1, (route.instructions || []).length - nav.currentStep);
  for (let i = 0; i < remaining && useNavStore.getState().status === 'NAVIGATING'; i += 1) {
    useNavStore.getState().advanceStep();
  }
  return undefined;
}

function updateLocationByLabel(label) {
  const node = findNodeByLabel(label);
  if (!node) return undefined;
  useNavStore.getState().startLocationUpdate();
  return useNavStore.getState().updateLocation(node.id);
}

function animateToNextInstruction(durationMs) {
  const state = useNavStore.getState();
  const instructions = state.route?.instructions || [];
  const currentNodeId = state.currentNodeId;
  const targetNodeId = instructions[state.currentStep + 1]?.nodeId;

  if (!currentNodeId || !targetNodeId) return Promise.resolve();

  const routePath = state.route?.path || [];
  const startIndex = routePath.indexOf(currentNodeId);
  const endIndex = routePath.indexOf(targetNodeId);
  if (startIndex < 0 || endIndex < 0) return Promise.resolve();

  const sliceIds = startIndex <= endIndex
    ? routePath.slice(startIndex, endIndex + 1)
    : routePath.slice(endIndex, startIndex + 1).reverse();

  return animateNodePath(sliceIds, durationMs);
}

async function walkAndConfirm(durationMs) {
  await animateToNextInstruction(durationMs);
  return confirmHere();
}

export function buildCafeteriaScenario() {
  return {
    id: 'lobby-cafeteria',
    name: 'Lobby to Cafeteria',
    description: 'A full demo run using start anchoring, route preview, and user confirmations.',
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
        label: 'Begin navigation from the route preview',
        execute: () => beginNavigation(),
      },
      {
        label: 'Walk toward the center junction',
        execute: () => animateRouteSegment('Main Lobby', 'Center Junction', 1800),
      },
      {
        label: "Confirm: I'm Here at the next instruction",
        execute: () => confirmHere(),
      },
      {
        label: 'Continue and confirm the next instruction',
        execute: () => walkAndConfirm(1400),
      },
      {
        label: 'Confirm arrival at Cafeteria',
        execute: async () => {
          await animateToNextInstruction(900);
          confirmUntilArrived();
        },
      },
    ],
  };
}

export function buildRerouteScenario() {
  return {
    id: 'reroute-demo',
    name: 'Reroute Demo',
    description: 'A manual location update triggers rerouting and shows the recalculation overlay.',
    steps: [
      {
        label: 'Scan the lobby QR',
        execute: () => scan('QR_LOBBY_MAIN'),
      },
      {
        label: 'Create a route preview to Cafeteria',
        execute: () => selectDestinationByLabel('Cafeteria'),
      },
      {
        label: 'Begin navigation',
        execute: () => beginNavigation(),
      },
      {
        label: 'Walk partway down the route',
        execute: () => animateRouteSegment('Main Lobby', 'Center Junction', 1400),
      },
      {
        label: 'Update location to Stairwell A',
        execute: () => updateLocationByLabel('Stairwell A'),
      },
      {
        label: 'Follow the recalculated route and confirm',
        execute: () => walkAndConfirm(1600),
      },
      {
        label: 'Confirm final arrival',
        execute: async () => {
          await animateToNextInstruction(900);
          confirmUntilArrived();
        },
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
