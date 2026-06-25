import useNavStore from '../store/useNavStore';

export default function ArrivedScreen() {
  const status = useNavStore(s => s.status);
  const destinationNode = useNavStore(s => s.destinationNode);
  const floor = useNavStore(s => s.floor);
  const completeNavigation = useNavStore(s => s.completeNavigation);

  if (status !== 'ARRIVED') return null;

  const poi = floor?.pois?.find(p => p.node_id === destinationNode?.id);
  const destinationName = poi?.name || destinationNode?.label;

  return (
    <div className="arrived-screen">
      <div className="arrived-screen__icon" aria-hidden="true">🎉</div>
      <h2 className="arrived-screen__title">到着しました！</h2>
      {destinationName && (
        <p className="arrived-screen__text">ようこそ {destinationName}</p>
      )}
      <button type="button" className="btn btn--primary arrived-screen__button" onClick={completeNavigation}>
        案内を終了
      </button>
    </div>
  );
}
