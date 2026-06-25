// components/LocationBar.jsx — displays current position with pulsing indicator
import useNavStore from '../store/useNavStore';

export default function LocationBar({ onUpdateLocation }) {
  const currentNode  = useNavStore(s => s.currentNode);
  const floorLoading = useNavStore(s => s.floorLoading);
  const floor        = useNavStore(s => s.floor);

  const floorLabel = floor?.floorName
    ? `${floor.floorName}${floor.floorNum != null ? ` (F${floor.floorNum})` : ''}`
    : null;

  if (floorLoading) {
    return (
      <div className="location-bar" id="location-bar">
        <div className="location-bar__inner">
          <span className="location-bar__loading">地図を読み込み中…</span>
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
            : 'QRコードをスキャンして現在地を設定してください'}
        </span>
        {floorLabel && (
          <span className="location-bar__floor" aria-label={`現在のフロア：${floorLabel}`}>
            {floorLabel}
          </span>
        )}
        <span className="location-bar__type">
          {currentNode?.type && (
            <span className={`badge badge--${currentNode.type}`}>
              {currentNode.type}
            </span>
          )}
        </span>
        <button type="button" className="location-bar__update" onClick={onUpdateLocation}>
          更新
        </button>
      </div>
    </div>
  );
}
