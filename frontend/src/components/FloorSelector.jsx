// components/FloorSelector.jsx — floor switcher pill overlay on the map
import { useRef, useState } from 'react';
import useNavStore from '../store/useNavStore';

/**
 * Floor transition timing (design tokens):
 * --floor-fade-out: 250ms
 * --floor-fade-in:  300ms
 * Total transition: 550ms during which buttons are disabled.
 */
const TRANSITION_DURATION = 550; // 250ms fade-out + 300ms fade-in

export default function FloorSelector() {
  const floorsById     = useNavStore(s => s.floorsById);
  const currentFloorId = useNavStore(s => s.currentFloorId);
  const switchFloor    = useNavStore(s => s.switchFloor);
  const [switching, setSwitching] = useState(false);
  const timerRef = useRef(null);

  // floors sorted ground → top
  const floors = [...floorsById.values()].sort((a, b) => a.floorNum - b.floorNum);

  // Don't render if there's only one floor (Requirement 6.1)
  if (floors.length <= 1) return null;

  const handleSwitch = (floorId) => {
    if (floorId === currentFloorId || switching) return;

    // Disable buttons during the full fade-out/fade-in transition (Requirement 6.4)
    setSwitching(true);

    // Trigger the floor switch action (Requirement 6.3)
    switchFloor(floorId);

    // Re-enable after the combined fade-out + fade-in duration
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSwitching(false);
    }, TRANSITION_DURATION);
  };

  return (
    <div className="floor-selector" role="group" aria-label="Floor selector">
      {/* Render floors bottom-to-top (reversed for vertical stack) */}
      {[...floors].reverse().map(floor => {
        const isActive = floor.floorId === currentFloorId;
        return (
          <button
            key={floor.floorId}
            type="button"
            className={`floor-selector__btn${isActive ? ' floor-selector__btn--active' : ''}`}
            onClick={() => handleSwitch(floor.floorId)}
            disabled={switching && !isActive}
            aria-pressed={isActive}
            aria-label={`Switch to ${floor.floorName}`}
          >
            <span className="floor-selector__num">F{floor.floorNum}</span>
            <span className="floor-selector__name">{floor.floorName}</span>
          </button>
        );
      })}
    </div>
  );
}
