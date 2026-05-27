// components/InstructionPanel.jsx — turn-by-turn navigation panel
import useNavStore from '../store/useNavStore';

/* Turn direction → icon mapping */
const TURN_ICONS = {
  start:       '🚀',
  straight:    '⬆️',
  left:        '↩️',
  right:       '↪️',
  destination: '🏁',
};

export default function InstructionPanel() {
  const route       = useNavStore(s => s.route);
  const routeLoading = useNavStore(s => s.routeLoading);
  const routeError  = useNavStore(s => s.routeError);
  const currentStep = useNavStore(s => s.currentStep);
  const progress    = useNavStore(s => s.progress);
  const advance     = useNavStore(s => s.advanceStep);
  const goBack      = useNavStore(s => s.previousStep);
  const cancel      = useNavStore(s => s.cancelRoute);
  const destNode    = useNavStore(s => s.destinationNode);

  // Loading state
  if (routeLoading) {
    return (
      <div className="instruction-panel instruction-panel--loading" id="instruction-panel">
        <div className="instruction-panel__spinner" />
        <span>Computing route…</span>
      </div>
    );
  }

  // Error state
  if (routeError) {
    return (
      <div className="instruction-panel instruction-panel--error" id="instruction-panel">
        <span className="instruction-panel__error-icon">⚠️</span>
        <span>{routeError}</span>
        <button className="btn btn--ghost" onClick={cancel}>Dismiss</button>
      </div>
    );
  }

  // No active route
  if (!route) return null;

  const { instructions, totalDistance } = route;
  const inst = instructions[currentStep];
  const isFirst = currentStep === 0;
  const isLast  = currentStep === instructions.length - 1;

  return (
    <div className="instruction-panel" id="instruction-panel">
      {/* Header */}
      <div className="instruction-panel__header">
        <div className="instruction-panel__dest">
          <span className="instruction-panel__dest-icon">🏁</span>
          <span className="instruction-panel__dest-name">
            {destNode?.label || 'Destination'}
          </span>
          <span className="instruction-panel__dist">
            {totalDistance > 0 ? `${Math.round(totalDistance)} px` : ''}
          </span>
        </div>
        <button
          className="btn btn--ghost instruction-panel__close"
          onClick={cancel}
          aria-label="Cancel navigation"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="instruction-panel__progress" role="progressbar" aria-valuenow={progress}>
        <div
          className="instruction-panel__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current instruction */}
      <div className="instruction-panel__step">
        <span className="instruction-panel__turn-icon">
          {TURN_ICONS[inst?.turn] || '➡️'}
        </span>
        <div className="instruction-panel__text-group">
          <p className="instruction-panel__text">{inst?.text}</p>
          <p className="instruction-panel__meta">
            Step {currentStep + 1} of {instructions.length}
            {inst?.distance ? ` · ${Math.round(inst.distance)} px` : ''}
          </p>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="instruction-panel__actions">
        <button
          className="btn btn--secondary"
          onClick={goBack}
          disabled={isFirst}
          id="btn-prev-step"
        >
          ← Back
        </button>
        <button
          className="btn btn--primary"
          onClick={advance}
          disabled={isLast}
          id="btn-next-step"
        >
          {isLast ? 'Arrived!' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
