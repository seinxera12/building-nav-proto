// components/FloorSelector.jsx — floor switcher pill overlay on the map
import { useEffect, useRef, useState } from 'react';
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
  const userLocationFloorId = useNavStore(s => s.userLocationFloorId);
  const [switching, setSwitching] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const timerRef = useRef(null);

  // Determine which floor the user is physically located on.
  // userLocationFloorId is set whenever the user anchors or arrives at a location.
  const userFloorId = userLocationFloorId;

  // Whether the user is viewing a floor different from their physical location
  const isOnDifferentFloor = userFloorId != null && userFloorId !== currentFloorId;

  // Listen to bottomsheet:resize to position the "My Location" button above the sheet
  useEffect(() => {
    const handleResize = (e) => {
      setSheetHeight(e.detail?.height || 0);
    };
    // Get initial height
    const el = document.querySelector('.bottom-sheet');
    if (el) setSheetHeight(el.offsetHeight || 0);

    window.addEventListener('bottomsheet:resize', handleResize);
    return () => window.removeEventListener('bottomsheet:resize', handleResize);
  }, []);

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

  const handleGoToCurrentLocation = () => {
    if (!userFloorId || switching) return;
    handleSwitch(userFloorId);
    // After switching back, recenter on the user's position
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('map:recenter'));
    }, TRANSITION_DURATION + 100);
  };

  return (
    <>
      <div className="floor-selector" role="group" aria-label="フロア選択">
        {/* Render floors bottom-to-top (reversed for vertical stack) */}
        {[...floors].reverse().map(floor => {
          const isActive = floor.floorId === currentFloorId;
          const isUserFloor = floor.floorId === userFloorId;
          return (
            <button
              key={floor.floorId}
              type="button"
              className={`floor-selector__btn${isActive ? ' floor-selector__btn--active' : ''}`}
              onClick={() => handleSwitch(floor.floorId)}
              disabled={switching && !isActive}
              aria-pressed={isActive}
              aria-label={`切り替え先 ${floor.floorName}${isUserFloor ? '（現在地）' : ''}`}
            >
              {isUserFloor && <span className="floor-selector__location-dot" aria-label="あなたの現在地" />}
              <span className="floor-selector__num">F{floor.floorNum}</span>
              <span className="floor-selector__name">{floor.floorName}</span>
            </button>
          );
        })}
      </div>

      {/* "Go to current location" button — shown when viewing a different floor */}
      {isOnDifferentFloor && (
        <button
          type="button"
          className="go-to-location-btn"
          onClick={handleGoToCurrentLocation}
          aria-label="現在地に戻る"
          style={{ bottom: `calc(${20 + sheetHeight}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
          </svg>
          <span>現在地</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
    </>
  );
}
