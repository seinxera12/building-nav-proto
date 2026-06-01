import useNavStore from '../store/useNavStore';

let activeFrame = null;
let activeResolve = null;

function finishAnimation(clearMarker = true) {
  if (activeFrame !== null) {
    cancelAnimationFrame(activeFrame);
    activeFrame = null;
  }

  if (clearMarker) {
    useNavStore.setState({ animatedPosition: null });
  }

  if (activeResolve) {
    const resolve = activeResolve;
    activeResolve = null;
    resolve();
  }
}

export function cancelProgressAnimation() {
  finishAnimation(true);
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getNodesByIds(nodeIds) {
  const nodes = useNavStore.getState().floor?.nodes || [];
  return nodeIds
    .map(nodeId => nodes.find(node => node.id === nodeId))
    .filter(Boolean);
}

export function animateProgress(fromPct, toPct, durationMs) {
  cancelProgressAnimation();

  const state = useNavStore.getState();
  const route = state.route;
  const nodes = state.floor?.nodes || [];
  const safeDuration = Math.max(1, durationMs || 0);
  const startPct = clampPct(fromPct);
  const endPct = clampPct(toPct);

  if (!route?.path || route.path.length < 2 || nodes.length === 0) {
    useNavStore.setState({
      progress: Math.round(endPct),
      animatedPosition: null,
    });
    return Promise.resolve();
  }

  const pathNodes = route.path
    .map(nodeId => nodes.find(node => node.id === nodeId))
    .filter(Boolean);

  if (pathNodes.length < 2) {
    useNavStore.setState({
      progress: Math.round(endPct),
      animatedPosition: null,
    });
    return Promise.resolve();
  }

  const startIdx = Math.max(
    0,
    Math.min(pathNodes.length - 1, Math.floor((startPct / 100) * (pathNodes.length - 1))),
  );
  const endIdx = Math.max(
    startIdx,
    Math.min(pathNodes.length - 1, Math.floor((endPct / 100) * (pathNodes.length - 1))),
  );
  const segment = pathNodes.slice(startIdx, endIdx + 1);

  if (segment.length < 2) {
    useNavStore.setState({
      progress: Math.round(endPct),
      animatedPosition: null,
    });
    return Promise.resolve();
  }

  const cumulative = [0];
  for (let i = 1; i < segment.length; i += 1) {
    const prev = segment[i - 1];
    const curr = segment[i];
    const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    cumulative.push(cumulative[i - 1] + dist);
  }

  const totalDistance = cumulative[cumulative.length - 1];
  if (totalDistance <= 0) {
    useNavStore.setState({
      progress: Math.round(endPct),
      animatedPosition: null,
    });
    return Promise.resolve();
  }

  return new Promise(resolve => {
    activeResolve = resolve;
    let startTime = null;

    const frame = timestamp => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / safeDuration, 1);
      const eased = easeInOut(t);
      const targetDistance = eased * totalDistance;

      let segmentIndex = segment.length - 2;
      for (let i = 1; i < cumulative.length; i += 1) {
        if (cumulative[i] >= targetDistance) {
          segmentIndex = i - 1;
          break;
        }
      }

      const segmentStart = cumulative[segmentIndex];
      const segmentEnd = cumulative[segmentIndex + 1] ?? segmentStart;
      const segmentLength = segmentEnd - segmentStart;
      const segmentT = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0;

      const startNode = segment[segmentIndex];
      const endNode = segment[Math.min(segmentIndex + 1, segment.length - 1)];
      const x = startNode.x + (endNode.x - startNode.x) * segmentT;
      const y = startNode.y + (endNode.y - startNode.y) * segmentT;

      const currentProgress = startPct + (endPct - startPct) * eased;
      useNavStore.setState({
        animatedPosition: { x, y },
        progress: Math.round(currentProgress),
      });

      if (t < 1) {
        activeFrame = requestAnimationFrame(frame);
        return;
      }

      finishAnimation(true);
    };

    activeFrame = requestAnimationFrame(frame);
  });
}

export function animateNodePath(nodeIds, durationMs, options = {}) {
  const { clearOnComplete = false } = options;
  const nodes = getNodesByIds(nodeIds);
  if (nodes.length < 2) {
    return Promise.resolve();
  }

  cancelProgressAnimation();

  const safeDuration = Math.max(1, durationMs || 0);
  const cumulative = [0];
  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(curr.x - prev.x, curr.y - prev.y));
  }

  const totalDistance = cumulative[cumulative.length - 1];
  if (totalDistance <= 0) {
    if (clearOnComplete) {
      useNavStore.setState({ animatedPosition: null });
    }
    return Promise.resolve();
  }

  return new Promise(resolve => {
    activeResolve = resolve;
    let startTime = null;

    const frame = timestamp => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / safeDuration, 1);
      const eased = easeInOut(t);
      const targetDistance = eased * totalDistance;

      let segmentIndex = nodes.length - 2;
      for (let i = 1; i < cumulative.length; i += 1) {
        if (cumulative[i] >= targetDistance) {
          segmentIndex = i - 1;
          break;
        }
      }

      const segmentStart = cumulative[segmentIndex];
      const segmentEnd = cumulative[segmentIndex + 1] ?? segmentStart;
      const segmentLength = segmentEnd - segmentStart;
      const segmentT = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0;

      const startNode = nodes[segmentIndex];
      const endNode = nodes[Math.min(segmentIndex + 1, nodes.length - 1)];
      const x = startNode.x + (endNode.x - startNode.x) * segmentT;
      const y = startNode.y + (endNode.y - startNode.y) * segmentT;

      useNavStore.setState({
        animatedPosition: { x, y },
      });

      if (t < 1) {
        activeFrame = requestAnimationFrame(frame);
        return;
      }

      finishAnimation(clearOnComplete);
    };

    activeFrame = requestAnimationFrame(frame);
  });
}

export function animateRouteSegment(fromLabel, toLabel, durationMs, options = {}) {
  const state = useNavStore.getState();
  const route = state.route;
  const floorNodes = state.floor?.nodes || [];
  if (!route?.path || route.path.length < 2) {
    return Promise.resolve();
  }

  const fromNode = floorNodes.find(node => node.label === fromLabel);
  const toNode = floorNodes.find(node => node.label === toLabel);
  if (!fromNode || !toNode) {
    return Promise.resolve();
  }

  const startIdx = route.path.indexOf(fromNode.id);
  const endIdx = route.path.indexOf(toNode.id);
  if (startIdx < 0 || endIdx < 0) {
    return Promise.resolve();
  }

  const segmentNodeIds = startIdx <= endIdx
    ? route.path.slice(startIdx, endIdx + 1)
    : route.path.slice(endIdx, startIdx + 1).reverse();

  return animateNodePath(segmentNodeIds, durationMs, options);
}
