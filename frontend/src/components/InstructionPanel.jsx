// components/InstructionPanel.jsx - route preview and navigation panel
// Task 5.2.2: extended for cross-floor instruction display
import { useState } from 'react';
import useNavStore from '../store/useNavStore';

function CancelConfirmDialog({ onConfirm, onDismiss }) {
  return (
    <div className="cancel-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title">
      <div className="cancel-confirm">
        <p className="cancel-confirm__title" id="cancel-confirm-title">Cancel navigation?</p>
        <p className="cancel-confirm__body">Your current route will be cleared.</p>
        <div className="cancel-confirm__actions">
          <button className="btn btn--ghost" onClick={onDismiss}>Keep going</button>
          <button className="btn btn--danger" onClick={onConfirm}>Cancel navigation</button>
        </div>
      </div>
    </div>
  );
}

const TURN_ICONS = {
  start:       '🚀',
  straight:    '⬆️',
  left:        '↩️',
  right:       '↪️',
  u_turn:      '↙️',
  destination: '🏁',
  elevator:    '🛗',
  stairs:      '🪜',
  escalator:   '↕️',
};

const FLOOR_TRANSITION_TURNS = new Set(['elevator', 'stairs', 'escalator']);

// floor plan: 2000 px wide ≈ 250 m → 8 px per metre
const PIXELS_PER_METER = 8;

function distanceLabel(value) {
  if (!value || value <= 0) return '';
  const meters = value / PIXELS_PER_METER;
  return meters < 1 ? '< 1m' : `~${Math.round(meters)}m`;
}

// Task 5.2.1: CrossFloorStepCard — displayed in place of a normal step when crossing floors
function CrossFloorStepCard({ inst }) {
  const icon = TURN_ICONS[inst.turn] ?? '🔀';
  const toFloorId = inst.toFloorId;
  return (
    <div className="instruction-panel__floor-change" aria-label={inst.text}>
      <div className="instruction-panel__floor-change-icon">{icon}</div>
      <div className="instruction-panel__floor-change-body">
        <p className="instruction-panel__floor-change-text">{inst.text}</p>
        {toFloorId && (
          <span className="instruction-panel__floor-change-badge">
            → Floor {toFloorId}
          </span>
        )}
      </div>
    </div>
  );
}

export default function InstructionPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status          = useNavStore(s => s.status);
  const route           = useNavStore(s => s.route);
  const routeLoading    = useNavStore(s => s.routeLoading);
  const routeError      = useNavStore(s => s.routeError);
  const currentStep     = useNavStore(s => s.currentStep);
  const progress        = useNavStore(s => s.progress);
  const remainingDist   = useNavStore(s => s.remainingDistance);
  const advance         = useNavStore(s => s.advanceStep);
  const begin           = useNavStore(s => s.beginNavigation);
  const cancel          = useNavStore(s => s.cancelNavigation);
  const destNode        = useNavStore(s => s.destinationNode);
  const floorsById      = useNavStore(s => s.floorsById);
  const floor           = useNavStore(s => s.floor);

  const requestCancel = () => setConfirmOpen(true);
  const confirmCancel = () => { setConfirmOpen(false); cancel(); };
  const dismissCancel = () => setConfirmOpen(false);

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

  const instructions  = route.instructions || [];
  const totalDistance = Number(route.totalDistance) || 0;
  const floorTransitions = route.floorTransitions || [];
  const inst     = instructions[currentStep];
  const nextInst = instructions[currentStep + 1];

  // Destination name — look in all loaded floors
  let destinationName = destNode?.label || 'Destination';
  if (destNode?.id) {
    for (const floorData of floorsById.values()) {
      const poi = floorData.pois?.find(p => p.node_id === destNode.id);
      if (poi) { destinationName = poi.name; break; }
    }
    // Also check active floor
    const poi = floor?.pois?.find(p => p.node_id === destNode.id);
    if (poi) destinationName = poi.name;
  }

  // Route preview summary — show floor transition count if cross-floor
  const crossFloorNote = floorTransitions.length > 0
    ? ` · ${floorTransitions.length} floor change${floorTransitions.length > 1 ? 's' : ''}`
    : '';

  const isFloorTransitionStep = inst && FLOOR_TRANSITION_TURNS.has(inst.turn);

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
          <span>{instructions.length} steps{crossFloorNote}</span>
          <span>{Math.max(1, Math.round(totalDistance / PIXELS_PER_METER / 1.4 / 60))} min walk</span>
        </div>

        {/* Show floor transition summary in preview */}
        {floorTransitions.length > 0 && (
          <div className="route-preview__transitions">
            {floorTransitions.map((ft, i) => (
              <span key={i} className="route-preview__transition-badge">
                {TURN_ICONS[ft.type] ?? '🔀'} {ft.fromFloorName} → {ft.toFloorName}
              </span>
            ))}
          </div>
        )}

        <div className="instruction-panel__actions">
          <button className="btn btn--secondary" onClick={cancel}>Cancel</button>
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
      {confirmOpen && (
        <CancelConfirmDialog onConfirm={confirmCancel} onDismiss={dismissCancel} />
      )}

      <div className="instruction-panel__header">
        <div className="instruction-panel__dest">
          <span className="instruction-panel__dest-icon">🏁</span>
          <span className="instruction-panel__dest-name">{destinationName}</span>
          <span className="instruction-panel__dist">{distanceLabel(remainingDist)}</span>
        </div>
        <button
          className="btn btn--ghost instruction-panel__close"
          onClick={requestCancel}
          aria-label="Cancel navigation"
        >
          ✕
        </button>
      </div>

      <div className="instruction-panel__progress" role="progressbar" aria-valuenow={progress}>
        <div className="instruction-panel__progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Task 5.2.2: render CrossFloorStepCard for transition steps, normal step otherwise */}
      <div
        className="instruction-panel__step"
        key={currentStep}
        aria-live="polite"
        aria-atomic="true"
      >
        {isFloorTransitionStep ? (
          <CrossFloorStepCard inst={inst} />
        ) : (
          <>
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
          </>
        )}
      </div>

      {nextInst && (
        <div className="instruction-panel__next">
          <span>Next</span>
          <strong>
            {FLOOR_TRANSITION_TURNS.has(nextInst.turn) && (TURN_ICONS[nextInst.turn] + ' ')}
            {nextInst.text}
          </strong>
        </div>
      )}

      <div className="instruction-panel__actions instruction-panel__actions--nav">
        <button className="btn btn--primary" onClick={advance} id="btn-next-step">
          Next
        </button>
        <button className="btn btn--ghost" onClick={requestCancel}>
          Cancel Navigation
        </button>
      </div>
    </div>
  );
}
