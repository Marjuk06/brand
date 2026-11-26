export type HapticPattern =
  | 'tap'
  | 'tick'
  | 'select'
  | 'toggleOn'
  | 'toggleOff'
  | 'snap'
  | 'success'
  | 'warning';

const HAPTIC_STORAGE_KEY = 'brandfinder.haptics.v1';

const VIBRATION_ENVELOPES: Record<HapticPattern, number | number[]> = {
  tap: 8,
  tick: 4,
  select: [9, 16, 12],
  toggleOn: [10, 18, 16],
  toggleOff: [7, 14, 5],
  snap: [14, 12, 8],
  success: [14, 24, 18, 24, 30],
  warning: [22, 32, 22],
};

let audioCtx: AudioContext | null = null;
let lastSuccessTimestamp = 0;
let hapticsEnabled = loadHapticPreference();

function loadHapticPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(HAPTIC_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  try {
    localStorage.setItem(HAPTIC_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
  if (enabled) {
    triggerHaptic('toggleOn');
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  durationSec: number,
  peakGain: number,
  delaySec = 0,
  wave: OscillatorType = 'sine',
): void {
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(40, endFreq),
    now + durationSec,
  );

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.005);
}

function playTactileAudio(pattern: HapticPattern): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  switch (pattern) {
    case 'tick':
      playTone(ctx, 1350, 760, 0.012, 0.024);
      break;
    case 'tap':
      playTone(ctx, 420, 170, 0.018, 0.042);
      break;
    case 'snap':
      playTone(ctx, 320, 120, 0.024, 0.055);
      playTone(ctx, 880, 1140, 0.018, 0.02, 0.012);
      break;
    case 'select':
      playTone(ctx, 520, 780, 0.024, 0.038);
      break;
    case 'toggleOn':
      playTone(ctx, 480, 720, 0.026, 0.036);
      playTone(ctx, 720, 980, 0.028, 0.03, 0.022);
      break;
    case 'toggleOff':
      playTone(ctx, 640, 340, 0.025, 0.035);
      break;
    case 'success':
      playTone(ctx, 587.33, 620, 0.065, 0.038, 0);
      playTone(ctx, 880, 910, 0.09, 0.042, 0.055);
      break;
    case 'warning':
      playTone(ctx, 240, 150, 0.045, 0.045, 0, 'triangle');
      playTone(ctx, 190, 120, 0.055, 0.04, 0.06, 'triangle');
      break;
  }
}

export function triggerHaptic(pattern: HapticPattern): void {
  if (!hapticsEnabled) return;

  if (pattern === 'success') {
    const nowMs = Date.now();
    if (nowMs - lastSuccessTimestamp < 650) {
      return;
    }
    lastSuccessTimestamp = nowMs;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    try {
      navigator.vibrate(VIBRATION_ENVELOPES[pattern]);
    } catch {
      // Ignore vibration permission restrictions
    }
  }

  playTactileAudio(pattern);
}

export type HapticEvent =
  | HapticPattern
  | 'tabSnap'
  | 'error';

export const haptics = {
  isSoundEnabled: isHapticsEnabled,
  setSoundEnabled: setHapticsEnabled,
  trigger(event: HapticEvent): void {
    if (event === 'tabSnap') {
      triggerHaptic('snap');
      return;
    }
    if (event === 'error') {
      triggerHaptic('warning');
      return;
    }
    triggerHaptic(event);
  },
};
