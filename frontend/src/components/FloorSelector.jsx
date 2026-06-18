// components/FloorSelector.jsx — floor switcher pill overlay on the map
import { useEffect, useState } from 'react';
import useNavStore from '../store/useNavStore';

export default function FloorSelector() {
  const floorsById    = useNavStore(s => s.floorsById);
  const currentFloorId = useNavStore(s => s.currentFloorId);
  const switchFloor   = useNavStore(s => s.switchFloor);
  const loadFloor     = useNavStore(s => s.loadFloor);
  const floorLoading  = useNavStore(s => s.floorLoading);
  const [switching, setSwitching] = useState(false);

  // floors sorted ground → top
  const floors = [...floorsById.values()].sort((a, b) => a.floorNum - b.floorNum);

  // Don't render if there's only one floor
  if (floors.length <= 1) return null;

  const handleSwitch = async (floorId) => {
    if (floorId === currentFloorId || switching) return;
    setSwitching(true);
    try {
      await switchFloor(floorId);
    } finally {
      setSwitching(false);
    }
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
            {isActive && <span className="floor-selector__dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
