// components/LocationPicker.jsx — upgraded location UI for entry and update overlays
// Replaces the legacy EntryPrompt with a design-system-consistent UI
import { useState } from 'react';

export default function LocationPicker({
  mode = 'entry', // 'entry' (first-run "Where are you?") or 'update' (update location)
  locations = [],
  currentNodeId = null,
  onScan,
  onSelect,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);

  const isUpdate = mode === 'update';

  const normalized = query.trim().toLowerCase();
  const filtered = locations
    .filter(location => {
      if (!normalized) return true;
      return [location.label, location.detail, location.type]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalized));
    })
    .slice(0, 30);

  // Current location label for update mode
  const currentLocationLabel = (() => {
    if (!currentNodeId) return null;
    const loc = locations.find(item => item.nodeId === currentNodeId);
    return loc?.label || 'Current location';
  })();

  const handleSelect = (location) => {
    setListOpen(false);
    setQuery('');
    if (onSelect) {
      onSelect(location);
    }
  };

  const handleScanClick = () => {
    if (onScan) {
      onScan();
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      className="upgraded-location-overlay"
      data-testid="upgraded-location-ui"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-picker-title"
    >
      <div className={`location-picker ${listOpen ? 'location-picker--expanded' : ''}`}>
        {/* Header */}
        <div className="location-picker__header">
          <div className="location-picker__title-block">
            <span className="location-picker__eyebrow">Location</span>
            <h2 id="location-picker-title">
              {isUpdate ? 'Update your location' : 'Where are you?'}
            </h2>
          </div>
          {isUpdate && (
            <button
              type="button"
              className="location-picker__close"
              onClick={handleClose}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Current location display for update mode */}
        {isUpdate && currentNodeId && (
          <div className="location-picker__current">
            <span className="location-picker__current-icon">📍</span>
            <span className="location-picker__current-label">
              Currently: {currentLocationLabel}
            </span>
          </div>
        )}

        {/* Action buttons — primary entry points */}
        <div className="location-picker__actions">
          <button
            type="button"
            className="location-picker__action location-picker__action--scan"
            onClick={handleScanClick}
          >
            <span className="location-picker__action-icon" aria-hidden="true">📷</span>
            <span className="location-picker__action-text">
              <strong>Scan QR Code</strong>
              <small>Tap a wall marker to set location</small>
            </span>
          </button>

          <button
            type="button"
            className="location-picker__action location-picker__action--browse"
            onClick={() => setListOpen(!listOpen)}
          >
            <span className="location-picker__action-icon" aria-hidden="true">📋</span>
            <span className="location-picker__action-text">
              <strong>Browse Locations</strong>
              <small>Select from known places</small>
            </span>
          </button>
        </div>

        {/* Location list — expandable */}
        {listOpen && (
          <div className="location-picker__list-container">
            <div className="location-picker__search">
              <span className="location-picker__search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                className="location-picker__search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search rooms, entrances..."
                aria-label="Search locations"
              />
              {query && (
                <button
                  type="button"
                  className="location-picker__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <ul className="location-picker__list" role="listbox" aria-label="Locations">
              {filtered.length === 0 ? (
                <li className="location-picker__empty">
                  {query ? 'No matching places found' : 'No locations available'}
                </li>
              ) : (
                filtered.map(location => (
                  <li key={location.id || location.nodeId}>
                    <button
                      type="button"
                      className={`location-picker__item ${
                        location.nodeId === currentNodeId
                          ? 'location-picker__item--current'
                          : ''
                      }`}
                      onClick={() => handleSelect(location)}
                      role="option"
                      aria-selected={location.nodeId === currentNodeId}
                    >
                      <span className="location-picker__item-icon" aria-hidden="true">
                        {location.nodeId === currentNodeId ? '✓' : '○'}
                      </span>
                      <span className="location-picker__item-content">
                        <strong className="location-picker__item-label">
                          {location.label}
                        </strong>
                        <span className="location-picker__item-detail">
                          {location.detail || location.type || 'Location'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}