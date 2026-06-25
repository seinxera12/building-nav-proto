import useNavStore from '../store/useNavStore.js';

function staleLabel(cachedAt) {
  if (!cachedAt) return null;
  const ageMs = Date.now() - new Date(cachedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 24 * 60 * 60 * 1000) return null;
  const days = Math.max(1, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
  return `Cached ${days} day${days === 1 ? '' : 's'} ago - may be outdated.`;
}

export default function OfflineBanner() {
  const offline = useNavStore(s => s.offline);
  const lastCacheAt = useNavStore(s => s.lastCacheAt);
  const label = staleLabel(lastCacheAt);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status">
      <strong>オフライン</strong>
      <span>キャッシュデータを使用しています。</span>
      {label && <span className="offline-banner__stale">{label}</span>}
    </div>
  );
}
