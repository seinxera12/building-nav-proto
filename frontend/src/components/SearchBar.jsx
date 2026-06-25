// components/SearchBar.jsx — debounced POI search with dropdown results
import { useState, useEffect, useRef, useCallback } from 'react';
import useNavStore, { translatePoi } from '../store/useNavStore';

export default function SearchBar() {
  const runSearch       = useNavStore(s => s.runSearch);
  const selectDest      = useNavStore(s => s.selectDestination);
  const results         = useNavStore(s => s.searchResults);
  const searchLoading   = useNavStore(s => s.searchLoading);
  const poiTranslations = useNavStore(s => s.poiTranslations);

  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const debounceRef       = useRef(null);
  const wrapperRef        = useRef(null);

  // Debounced search — 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((nodeId, floorId) => {
    setQuery('');
    setOpen(false);
    selectDest(nodeId, floorId);
  }, [selectDest]);

  const handleQueryChange = (value) => {
    setQuery(value);
    setOpen(value.trim().length >= 2);
  };

  // Category icons
  const catIcon = (cat) => {
    switch (cat) {
      case 'poi':       return '📌';
      case 'elevator':  return '🛗';
      case 'entrance':  return '🚪';
      case 'stairs':    return '🪜';
      default:          return '📍';
    }
  };

  return (
    <div className="search-bar" id="search-bar" ref={wrapperRef}>
      <div className="search-bar__input-wrap">
        <span className="search-bar__icon" aria-hidden="true">🔍</span>
        <input
          id="search-input"
          type="text"
          placeholder="目的地を検索…"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
          className="search-bar__input"
        />
        {query && (
          <button
            className="search-bar__clear"
            onClick={() => { setQuery(''); setOpen(false); }}
            aria-label="検索をクリア"
          >
            ✕
          </button>
        )}
      </div>

      {open && (searchLoading || results.length > 0 || query.trim().length >= 2) && (
        <ul className="search-bar__dropdown" id="search-results">
          {searchLoading ? (
            <li className="search-bar__item search-bar__item--loading">検索中…</li>
          ) : results.length === 0 ? (
            <li className="search-bar__item search-bar__item--empty">該当する結果がありません</li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.node_id}-${i}`}
                className="search-bar__item"
                onClick={() => handleSelect(r.node_id, r.floorId)}
              >
                <span className="search-bar__item-icon">{catIcon(r.category)}</span>
                <div className="search-bar__item-info">
                  <span className="search-bar__item-name">{translatePoi(r.name, poiTranslations)}</span>
                  <span className="search-bar__item-cat">
                    {translatePoi(r.name, poiTranslations) !== r.name && (
                      <span className="search-bar__item-en">{r.name} · </span>
                    )}
                    {r.category}
                    {r.floorName ? ` · ${r.floorName}` : ''}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
