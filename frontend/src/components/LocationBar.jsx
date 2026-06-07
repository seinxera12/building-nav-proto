// components/LocationBar.jsx — displays current position with pulsing indicator
import useNavStore from '../store/useNavStore';

export default function LocationBar({ onUpdateLocation }) {
  const currentNode = useNavStore(s => s.currentNode);
  const floorLoading = useNavStore(s => s.floorLoading);

  if (floorLoading) {
    return (
      <div className="location-bar" id="location-bar">
        <div className="location-bar__inner">
          <span className="location-bar__loading">Loading map…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="location-bar" id="location-bar">
      <div className="location-bar__inner">
        <span className="location-bar__pulse" aria-hidden="true" />
        <span className="location-bar__icon" aria-hidden="true">📍</span>
        <span className="location-bar__label">
          {currentNode
            ? currentNode.label
            : 'Scan a QR code to set your position'}
        </span>
        <span className="location-bar__type">
          {currentNode?.type && (
            <span className={`badge badge--${currentNode.type}`}>
              {currentNode.type}
            </span>
          )}
        </span>
        <button type="button" className="location-bar__update" onClick={onUpdateLocation}>
          Update
        </button>
      </div>
    </div>
  );
}
