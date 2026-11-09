// Plays x(t) as sound: the time axis is compressed until the forcing period becomes a 220 Hz note.

import { coefficients, defaultStep, rk4Step } from "./model.js";

const SAMPLES_PER_PERIOD = 200;
const DURATION = 3.5;
let context = null;
let current = null;

export function playTrajectory(params, x0, v0, t0) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return 0;
  context ??= new AudioContextClass();
  context.resume();
  current?.stop();

  const rate = context.sampleRate;
  const count = Math.floor(rate * DURATION);
  const c = coefficients(params);
  const forced = params.omega > 0 && params.A > 0;
  const h = forced ? (2 * Math.PI) / params.omega / SAMPLES_PER_PERIOD / (rate / 44100) : defaultStep(params, x0, v0);
  const samples = new Float32Array(count);
  const out = [x0, v0];
  let mean = 0;
  for (let i = 0; i < count; i++) {
    rk4Step(t0 + i * h, out[0], out[1], h, c, out);
    if (!(Math.abs(out[0]) < 1e3)) break;
    samples[i] = out[0];
    mean += out[0] / count;
  }
  let peak = 1e-9;
  for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(samples[i] - mean));
  const fade = Math.floor(rate * 0.04);
  for (let i = 0; i < count; i++) {
    const envelope = Math.min(1, i / fade, (count - 1 - i) / fade);
    samples[i] = ((samples[i] - mean) / peak) * 0.3 * envelope;
  }

  const buffer = context.createBuffer(1, count, rate);
  buffer.copyToChannel(samples, 0);
  current = context.createBufferSource();
  current.buffer = buffer;
  current.connect(context.destination);
  current.start();
  return DURATION;
}
