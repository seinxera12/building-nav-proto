// components/InstructionPanel.jsx - route preview and confirmation navigation panel
import useNavStore from '../store/useNavStore';

const TURN_ICONS = {
  start: '🚀',
  straight: '⬆️',
  left: '↩️',
  right: '↪️',
  destination: '🏁',
};

function distanceLabel(value) {
  return value > 0 ? `${Math.round(value)} px` : '0 px';
}

export default function InstructionPanel() {
  const status = useNavStore(s => s.status);
  const route = useNavStore(s => s.route);
  const routeLoading = useNavStore(s => s.routeLoading);
  const routeError = useNavStore(s => s.routeError);
  const currentStep = useNavStore(s => s.currentStep);
  const progress = useNavStore(s => s.progress);
  const remainingDistance = useNavStore(s => s.remainingDistance);
  const advance = useNavStore(s => s.advanceStep);
  const begin = useNavStore(s => s.beginNavigation);
  const cancel = useNavStore(s => s.cancelNavigation);
  const destNode = useNavStore(s => s.destinationNode);
  const floor = useNavStore(s => s.floor);

  if (routeLoading) {
    return (
      <div className="instruction-panel instruction-panel--loading" id="instruction-panel">
        <div className="instruction-panel__spinner" />
        <span>Computing route...</span>
      </div>
    );
  }

  if (routeError) {
    return (
      <div className="instruction-panel instruction-panel--error" id="instruction-panel">
        <span className="instruction-panel__error-icon">⚠️</span>
        <span>{routeError}</span>
        <button className="btn btn--ghost" onClick={cancel}>Dismiss</button>
      </div>
    );
  }

  if (!route) return null;

  const instructions = route.instructions || [];
  const totalDistance = Number(route.totalDistance) || 0;
  const inst = instructions[currentStep];
  const nextInst = instructions[currentStep + 1];
  const poi = floor?.pois?.find(p => p.node_id === destNode?.id);
  const destinationName = poi?.name || destNode?.label || 'Destination';

  if (status === 'ROUTE_PREVIEW') {
    return (
      <div className="instruction-panel instruction-panel--preview" id="instruction-panel">
        <div className="instruction-panel__header">
          <div className="instruction-panel__dest">
            <span className="instruction-panel__dest-icon">🏁</span>
            <span className="instruction-panel__dest-name">{destinationName}</span>
          </div>
          <button
            className="btn btn--ghost instruction-panel__close"
            onClick={cancel}
            aria-label="Cancel route preview"
          >
            ✕
          </button>
        </div>

        <div className="route-preview__stats">
          <span>{distanceLabel(totalDistance)}</span>
          <span>{instructions.length} instructions</span>
          <span>{Math.max(1, Math.round(totalDistance / 80))} min walk</span>
        </div>

        <div className="instruction-panel__actions">
          <button className="btn btn--secondary" onClick={cancel}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={begin}
            disabled={routeLoading || Boolean(routeError)}
            id="btn-begin-navigation"
          >
            Begin
          </button>
        </div>
      </div>
    );
  }

  if (status !== 'NAVIGATING') return null;

  return (
    <div className="instruction-panel" id="instruction-panel">
      <div className="instruction-panel__header">
        <div className="instruction-panel__dest">
          <span className="instruction-panel__dest-icon">🏁</span>
          <span className="instruction-panel__dest-name">{destinationName}</span>
          <span className="instruction-panel__dist">{distanceLabel(remainingDistance)}</span>
        </div>
        <button
          className="btn btn--ghost instruction-panel__close"
          onClick={() => {
            if (window.confirm('Cancel current navigation?')) cancel();
          }}
          aria-label="Cancel navigation"
        >
          ✕
        </button>
      </div>

      <div className="instruction-panel__progress" role="progressbar" aria-valuenow={progress}>
        <div
          className="instruction-panel__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="instruction-panel__step" key={currentStep}>
        <span className="instruction-panel__turn-icon">
          {TURN_ICONS[inst?.turn] || '➡️'}
        </span>
        <div className="instruction-panel__text-group">
          <p className="instruction-panel__text">{inst?.text}</p>
          <p className="instruction-panel__meta">
            Step {currentStep + 1} of {instructions.length}
            {inst?.distance ? ` · ${distanceLabel(inst.distance)}` : ''}
          </p>
        </div>
      </div>

      {nextInst && (
        <div className="instruction-panel__next">
          <span>Next</span>
          <strong>{nextInst.text}</strong>
        </div>
      )}

      <div className="instruction-panel__actions instruction-panel__actions--nav">
        <button className="btn btn--primary" onClick={advance} id="btn-next-step">
          Next
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm('Cancel current navigation?')) cancel();
          }}
        >
          Cancel Navigation
        </button>
      </div>
    </div>
  );
}
