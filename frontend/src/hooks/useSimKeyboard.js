import { useEffect } from 'react';
import useNavStore from '../store/useNavStore';
import { useSimStore } from '../store/useSimStore';

function shouldIgnoreEvent(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return Boolean(
    target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select',
  );
}

export function useSimKeyboard(isDemoMode) {
  useEffect(() => {
    if (!isDemoMode) return undefined;

    function onKeyDown(event) {
      if (shouldIgnoreEvent(event.target)) return;

      const sim = useSimStore.getState();

      switch (event.key) {
        case 'ArrowRight':
        case ' ':
          event.preventDefault();
          void sim.nextStep();
          break;
        case 'p':
        case 'P':
          event.preventDefault();
          if (sim.autoPlay) {
            sim.stopAutoPlay();
          } else {
            void sim.startAutoPlay(2200);
          }
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          sim.reset();
          useNavStore.getState().reset();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDemoMode]);
}
