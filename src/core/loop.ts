export interface LoopState {
  /** Accumulated / scrubbed seconds */
  time: number;
  /** Playback speed multiplier */
  speed: number;
  paused: boolean;
  /** Manual scrub offset applied on top of running clock when paused */
  scrub: number;
}

export type FrameCallback = (t: number, dt: number) => void;

/**
 * requestAnimationFrame loop with pause + time scrub support.
 * When paused, `t` stays at scrub value. When playing, `t = scrub + elapsed * speed`.
 */
export function createLoop(onFrame: FrameCallback): {
  state: LoopState;
  start: () => void;
  stop: () => void;
  setPaused: (paused: boolean) => void;
  setScrub: (seconds: number) => void;
  setSpeed: (speed: number) => void;
} {
  const state: LoopState = {
    time: 0,
    speed: 1,
    paused: false,
    scrub: 0,
  };

  let raf = 0;
  let last = performance.now();
  let runningElapsed = 0;

  const tick = (now: number) => {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let dt = 0;
    if (!state.paused) {
      runningElapsed += rawDt * state.speed;
      dt = rawDt * state.speed;
      state.time = state.scrub + runningElapsed;
    } else {
      state.time = state.scrub;
      dt = 0;
    }

    onFrame(state.time, dt);
    raf = requestAnimationFrame(tick);
  };

  return {
    state,
    start() {
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
    setPaused(paused: boolean) {
      if (paused && !state.paused) {
        // Freeze scrub at current time so resume continues smoothly
        state.scrub = state.time;
        runningElapsed = 0;
      } else if (!paused && state.paused) {
        state.scrub = state.time;
        runningElapsed = 0;
        last = performance.now();
      }
      state.paused = paused;
    },
    setScrub(seconds: number) {
      state.scrub = seconds;
      runningElapsed = 0;
      state.time = seconds;
    },
    setSpeed(speed: number) {
      state.speed = speed;
    },
  };
}
