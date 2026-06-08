import { useState } from 'react';

export default function EntryPrompt({
  mode = 'entry',
  locations = [],
  currentNodeId = null,
  onScan,
  onSelect,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const normalized = query.trim().toLowerCase();
  const filtered = locations
    .filter(location => {
      if (!normalized) return true;
      return [location.label, location.detail, location.type]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalized));
    })
    .slice(0, 30);
  const isUpdate = mode === 'update';

  return (
    <div className="entry-prompt" role="dialog" aria-modal="true" aria-labelledby="entry-prompt-title">
      <div className={listOpen ? 'entry-prompt__card entry-prompt__card--expanded' : 'entry-prompt__card'}>
        <div className="entry-prompt__header">
          <div>
            <p className="entry-prompt__eyebrow">場所</p>
            <h2 id="entry-prompt-title">{isUpdate ? '現在地を更新' : '現在地はどこですか？'}</h2>
          </div>
          {isUpdate && (
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              閉じる
            </button>
          )}
        </div>

        {isUpdate && currentNodeId && (
          <p className="entry-prompt__current">
            現在地: {locations.find(item => item.nodeId === currentNodeId)?.label || 'Current location'}
          </p>
        )}

        <div className="entry-prompt__actions">
          <button type="button" className="entry-prompt__option" onClick={onScan}>
            <span aria-hidden="true">📷</span>
            <strong>QRをスキャン</strong>
            <small>近くの壁マーカーを使用してください。</small>
          </button>
          <button
            type="button"
            className="entry-prompt__option entry-prompt__option--select"
            onClick={() => setListOpen(true)}
          >
            <span aria-hidden="true">📍</span>
            <strong>リストから選択</strong>
            <small>既知の場所から選択してください。</small>
          </button>
        </div>

        {listOpen && (
          <>
            <input
              className="entry-prompt__search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="部屋、入口、ロビーを検索..."
              type="search"
              autoFocus
            />

            <div className="entry-prompt__list">
              {filtered.length === 0 && (
                <p className="entry-prompt__empty">一致する場所がありません。</p>
              )}
              {filtered.map(location => (
                <button
                  type="button"
                  key={location.id || location.nodeId}
                  className={
                    location.nodeId === currentNodeId
                      ? 'entry-prompt__checkpoint entry-prompt__checkpoint--current'
                      : 'entry-prompt__checkpoint'
                  }
                  onClick={() => onSelect(location)}
                >
                  <span className="entry-prompt__radio" aria-hidden="true" />
                  <span>
                    <strong>{location.label}</strong>
                    <small>{location.detail || location.type || 'place'}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
