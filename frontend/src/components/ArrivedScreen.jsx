import useNavStore from '../store/useNavStore';

export default function ArrivedScreen() {
  const status = useNavStore(s => s.status);
  const route = useNavStore(s => s.route);
  const floor = useNavStore(s => s.floor);
  const reset = useNavStore(s => s.reset);

  if (status !== 'ARRIVED') return null;

  const destId = route?.path?.at(-1);
  const destNode = floor?.nodes?.find(node => node.id === destId);

  return (
    <div className="arrived-screen">
      <div className="arrived-screen__icon" aria-hidden="true">🎉</div>
      <h2 className="arrived-screen__title">You have arrived!</h2>
      {destNode && (
        <p className="arrived-screen__text">Welcome to {destNode.label}</p>
      )}
      <button type="button" className="btn btn--primary arrived-screen__button" onClick={reset}>
        Navigate Again
      </button>
    </div>
  );
}
