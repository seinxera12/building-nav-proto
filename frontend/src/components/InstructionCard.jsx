// components/InstructionCard.jsx — floating top-of-map navigation instruction card
// Requirements 9.1–9.5: turn icon, instruction text, distance, animate on step change, hidden when inactive
import { useEffect, useRef, useState } from 'react';

const TURN_ICONS = {
  left: '↰',
  right: '↱',
  straight: '↑',
  u_turn: '↩',
  elevator: '🛗',
  stairs: '🪜',
  escalator: '↗',
  destination: '📍',
  start: '🚶',
};

const FALLBACK_ICON = '➡️';

export default function InstructionCard({
  visible = false,
  turnType = '',
  primaryText = '',
  secondaryText = '',
  distance = '',
  onStepChange = 0,
}) {
  const [animClass, setAnimClass] = useState('');
  const [displayed, setDisplayed] = useState({ turnType, primaryText, secondaryText, distance });
  const prevStep = useRef(onStepChange);
  const timeoutRef = useRef(null);

  // On step change: exit animation → swap content → enter animation
  useEffect(() => {
    if (prevStep.current === onStepChange) {
      // Initial render or same step — just set content directly
      setDisplayed({ turnType, primaryText, secondaryText, distance });
      return;
    }

    prevStep.current = onStepChange;

    // Trigger exit animation
    setAnimClass('instruction-card__content--exit');

    // Clear any pending timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // After exit duration (200ms), swap content and trigger enter
    timeoutRef.current = setTimeout(() => {
      setDisplayed({ turnType, primaryText, secondaryText, distance });
      setAnimClass('instruction-card__content--enter');

      // Remove enter class after animation completes (250ms)
      timeoutRef.current = setTimeout(() => {
        setAnimClass('');
      }, 250);
    }, 200);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onStepChange, turnType, primaryText, secondaryText, distance]);

  const icon = TURN_ICONS[displayed.turnType] || FALLBACK_ICON;

  return (
    <div
      className={`instruction-card ${visible ? 'instruction-card--visible' : ''}`}
      aria-hidden={!visible}
    >
      <div className={`instruction-card__content ${animClass}`}>
        <span className="instruction-card__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="instruction-card__text-wrap">
          <p className="instruction-card__primary">{displayed.primaryText}</p>
          {displayed.secondaryText && (
            <p className="instruction-card__secondary">{displayed.secondaryText}</p>
          )}
        </div>
        {displayed.distance && (
          <span className="instruction-card__distance">{displayed.distance}</span>
        )}
      </div>
    </div>
  );
}
