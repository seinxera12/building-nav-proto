// components/InstructionPanel.jsx - route preview and navigation panel
// Task 5.2.2: extended for cross-floor instruction display
import { useState } from 'react';
import useNavStore, { translatePoi, buildInstructionText } from '../store/useNavStore';

function CancelConfirmDialog({ onConfirm, onDismiss }) {
  return (
    <div className="cancel-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title">
      <div className="cancel-confirm">
        <p className="cancel-confirm__title" id="cancel-confirm-title">案内をキャンセルしますか？</p>
        <p className="cancel-confirm__body">現在のルートが消去されます。</p>
        <div className="cancel-confirm__actions">
          <button className="btn btn--ghost" onClick={onDismiss}>続ける</button>
          <button className="btn btn--danger" onClick={onConfirm}>案内をキャンセル</button>
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
function CrossFloorStepCard({ inst, translations, floorsById }) {
  const icon = TURN_ICONS[inst.turn] ?? '🔀';
  const toFloorId = inst.toFloorId;
  const toFloorName = toFloorId
    ? (floorsById?.get(toFloorId)?.floorName ?? `フロア ${toFloorId}`)
    : null;
  const text = buildInstructionText(inst, translations, floorsById);
  return (
    <div className="instruction-panel__floor-change" aria-label={text}>
      <div className="instruction-panel__floor-change-icon">{icon}</div>
      <div className="instruction-panel__floor-change-body">
        <p className="instruction-panel__floor-change-text">{text}</p>
        {toFloorName && (
          <span className="instruction-panel__floor-change-badge">
            → {toFloorName}
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
  const poiTranslations = useNavStore(s => s.poiTranslations);

  const requestCancel = () => setConfirmOpen(true);
  const confirmCancel = () => { setConfirmOpen(false); cancel(); };
  const dismissCancel = () => setConfirmOpen(false);

  if (routeLoading) {
    return (
      <div className="instruction-panel instruction-panel--loading" id="instruction-panel">
        <div className="instruction-panel__spinner" />
        <span>ルートを計算中…</span>
      </div>
    );
  }

  if (routeError) {
    return (
      <div className="instruction-panel instruction-panel--error" id="instruction-panel">
        <span className="instruction-panel__error-icon">⚠️</span>
        <span>{routeError}</span>
        <button className="btn btn--ghost" onClick={cancel}>閉じる</button>
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
  let destinationName = destNode?.label || '目的地';
  if (destNode?.id) {
    for (const floorData of floorsById.values()) {
      const poi = floorData.pois?.find(p => p.node_id === destNode.id);
      if (poi) { destinationName = poi.name; break; }
    }
    const poi = floor?.pois?.find(p => p.node_id === destNode.id);
    if (poi) destinationName = poi.name;
  }
  destinationName = translatePoi(destinationName, poiTranslations);

  // Route preview summary — show floor transition count if cross-floor
  const crossFloorNote = floorTransitions.length > 0
    ? ` · ${floorTransitions.length} フロア移動`
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
            aria-label="ルートプレビューをキャンセル"
          >
            ✕
          </button>
        </div>

        <div className="route-preview__stats">
          <span>{distanceLabel(totalDistance)}</span>
          <span>{instructions.length} 歩{crossFloorNote}</span>
          <span>{Math.max(1, Math.round(totalDistance / PIXELS_PER_METER / 1.4 / 60))} 分（徒歩）</span>
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
          <button className="btn btn--secondary" onClick={cancel}>キャンセル</button>
          <button
            className="btn btn--primary"
            onClick={begin}
            disabled={routeLoading || Boolean(routeError)}
            id="btn-begin-navigation"
          >
            開始
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
          aria-label="案内をキャンセル"
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
          <CrossFloorStepCard inst={inst} translations={poiTranslations} floorsById={floorsById} />
        ) : (
          <>
            <span className="instruction-panel__turn-icon">
              {TURN_ICONS[inst?.turn] || '➡️'}
            </span>
            <div className="instruction-panel__text-group">
              <p className="instruction-panel__text">{buildInstructionText(inst, poiTranslations, floorsById)}</p>
              <p className="instruction-panel__meta">
                ステップ {currentStep + 1} / {instructions.length}
                {inst?.distance ? ` · ${distanceLabel(inst.distance)}` : ''}
              </p>
            </div>
          </>
        )}
      </div>

      {nextInst && (
        <div className="instruction-panel__next">
          <span>次へ</span>
          <strong>
            {FLOOR_TRANSITION_TURNS.has(nextInst.turn) && (TURN_ICONS[nextInst.turn] + ' ')}
            {buildInstructionText(nextInst, poiTranslations, floorsById)}
          </strong>
        </div>
      )}

      <div className="instruction-panel__actions instruction-panel__actions--nav">
        <button className="btn btn--primary" onClick={advance} id="btn-next-step">
          次へ
        </button>
        <button className="btn btn--ghost" onClick={requestCancel}>
          案内をキャンセル
        </button>
      </div>
    </div>
  );
}
