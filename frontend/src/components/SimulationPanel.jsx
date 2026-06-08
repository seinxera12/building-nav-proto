import { useEffect, useState } from 'react';
import useNavStore from '../store/useNavStore';
import { useSimStore } from '../store/useSimStore';
import { SIMULATION_SCENARIOS } from '../simulation/scenarios';

export default function SimulationPanel() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(SIMULATION_SCENARIOS[0].id);

  const floor = useNavStore(s => s.floor);
  const floorLoading = useNavStore(s => s.floorLoading);
  const navReset = useNavStore(s => s.reset);

  const {
    scenario,
    currentStep,
    isRunning,
    autoPlay,
    isExecuting,
    loadScenario,
    nextStep,
    startAutoPlay,
    stopAutoPlay,
    reset,
  } = useSimStore();

  const scenarioDefinition = SIMULATION_SCENARIOS.find(option => option.id === selectedScenarioId)
    || SIMULATION_SCENARIOS[0];

  useEffect(() => {
    navReset();
    loadScenario(scenarioDefinition.build());
  }, [loadScenario, navReset, scenarioDefinition]);

  if (!scenario) return null;

  const steps = scenario.steps || [];
  const displayStep = Math.min(
    steps.length,
    Math.max(0, currentStep + (isExecuting ? 0 : 1)),
  );
  const activeIndex = Math.min(displayStep, Math.max(steps.length - 1, 0));
  const progress = steps.length > 0
    ? Math.round((displayStep / steps.length) * 100)
    : 0;
  const controlsDisabled = !floor || floorLoading || isExecuting || steps.length === 0;
  const atEnd = displayStep >= steps.length && steps.length > 0;

  const handleReset = () => {
    stopAutoPlay();
    reset();
    navReset();
  };

  return (
    <aside className="demo-panel" aria-label="シミュレーション制御パネル">
      <div className="demo-panel__header">
        <div className="demo-panel__title-group">
          <div className="demo-panel__eyebrow">デモモード</div>
          <h2 className="demo-panel__title">{scenario.name}</h2>
          <p className="demo-panel__desc">{scenario.description}</p>
        </div>

        <label className="demo-panel__select-wrap">
          <span className="demo-panel__select-label">シナリオ</span>
          <select
            className="demo-panel__select"
            value={selectedScenarioId}
            onChange={e => setSelectedScenarioId(e.target.value)}
          >
            {SIMULATION_SCENARIOS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="demo-panel__body">
        <div className="demo-panel__progress" aria-hidden="true">
          <div
            className="demo-panel__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="demo-panel__steps">
          {steps.map((step, index) => {
            const stateClass = index < displayStep
              ? 'demo-panel__step--done'
              : index === activeIndex
                ? 'demo-panel__step--active'
                : '';

            return (
              <li key={`${step.label}-${index}`} className={`demo-panel__step ${stateClass}`.trim()}>
                <span className="demo-panel__step-index">
                  {index < displayStep ? '✓' : index === activeIndex ? '▶' : index + 1}
                </span>
                <span className="demo-panel__step-label">{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="demo-panel__controls">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void nextStep()}
            disabled={controlsDisabled || atEnd}
          >
            次へ ▶
          </button>
          {!autoPlay ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void startAutoPlay(2200)}
              disabled={controlsDisabled || atEnd}
            >
              自動 ⏩
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={stopAutoPlay}
              disabled={controlsDisabled}
            >
              一時停止 ⏸
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleReset}
          >
            リセット ↺
          </button>
        </div>

        <div className="demo-panel__footer">
          <span className="demo-panel__pill">
            {autoPlay
              ? '自動再生'
              : isExecuting
                ? '実行中'
                : atEnd
                  ? '完了'
                  : isRunning
                    ? '準備完了'
                    : '待機中'}
          </span>
          <span className="demo-panel__shortcuts">スペース / P / R</span>
        </div>
      </div>
    </aside>
  );
}
