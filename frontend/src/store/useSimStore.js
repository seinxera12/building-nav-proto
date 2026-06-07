import { create } from 'zustand';
import { cancelProgressAnimation } from '../simulation/animateProgress';

function clearTimer(timerRef) {
  if (timerRef !== null) {
    clearTimeout(timerRef);
  }
}

export const useSimStore = create((set, get) => ({
  scenario: null,
  currentStep: -1,
  isRunning: false,
  autoPlay: false,
  isExecuting: false,
  timerRef: null,

  loadScenario: scenario => {
    const { timerRef } = get();
    clearTimer(timerRef);
    cancelProgressAnimation();
    set({
      scenario,
      currentStep: -1,
      isRunning: false,
      autoPlay: false,
      isExecuting: false,
      timerRef: null,
    });
  },

  nextStep: async () => {
    const { scenario, currentStep, isExecuting } = get();
    if (!scenario || isExecuting) return false;

    const next = currentStep + 1;
    if (next >= scenario.steps.length) {
      set({ autoPlay: false, timerRef: null });
      return false;
    }

    const step = scenario.steps[next];
    set({
      currentStep: next,
      isRunning: true,
      isExecuting: true,
    });

    try {
      await Promise.resolve(step.execute());
    } finally {
      set({ isExecuting: false });
    }

    return true;
  },

  startAutoPlay: async (delayMs = 2000) => {
    const { scenario, autoPlay, isExecuting } = get();
    if (!scenario || autoPlay || isExecuting) return;

    const scheduleNext = () => {
      if (!get().autoPlay) return;

      const tick = async () => {
        if (!get().autoPlay) return;

        const advanced = await get().nextStep();
        if (!advanced || !get().autoPlay) {
          set({ autoPlay: false, timerRef: null });
          return;
        }

        if (get().currentStep >= get().scenario.steps.length - 1) {
          set({ autoPlay: false, timerRef: null });
          return;
        }

        const nextTimer = setTimeout(tick, delayMs);
        set({ timerRef: nextTimer });
      };

      const initialDelay = get().currentStep < 0 ? 0 : delayMs;
      const timer = setTimeout(tick, initialDelay);
      set({ timerRef: timer });
    };

    set({ autoPlay: true, isRunning: true });
    scheduleNext();
  },

  stopAutoPlay: () => {
    const { timerRef } = get();
    clearTimer(timerRef);
    set({ autoPlay: false, timerRef: null });
  },

  reset: () => {
    const { timerRef } = get();
    clearTimer(timerRef);
    cancelProgressAnimation();
    set({
      currentStep: -1,
      isRunning: false,
      autoPlay: false,
      isExecuting: false,
      timerRef: null,
    });
  },
}));
