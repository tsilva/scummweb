import { performance } from 'node:perf_hooks';
import { shortId } from './ids.js';

export class FrameHistory {
  constructor({ seconds = 60, maxBytes = 64 * 1024 * 1024, maxFrames = 900 } = {}) {
    this.seconds = seconds;
    this.maxBytes = maxBytes;
    this.maxFrames = maxFrames;
    this.frames = [];
    this.bytes = 0;
  }

  add(data, metadata = {}) {
    const frame = { ...metadata, id: shortId(), timestamp: new Date().toISOString(),
      monotonicMs: performance.now(), mimeType: 'image/jpeg', data };
    this.frames.push(frame);
    this.bytes += data.length;
    this.prune();
    return frame;
  }

  prune(now = performance.now()) {
    while (this.frames.length && (now - this.frames[0].monotonicMs > this.seconds * 1000 ||
      this.bytes > this.maxBytes || this.frames.length > this.maxFrames)) {
      this.bytes -= this.frames.shift().data.length;
    }
  }

  clear() { this.frames = []; this.bytes = 0; }
  latest() { this.prune(); return this.frames.at(-1); }
  get(id) { this.prune(); return this.frames.find(frame => frame.id === id); }

  review({ seconds = 15, count = 6, actionId } = {}) {
    this.prune();
    let frames = this.frames.filter(frame => frame.monotonicMs >= performance.now() - seconds * 1000);
    if (actionId) frames = this.frames.filter(frame => frame.actionId === actionId);
    if (frames.length <= count) return frames;
    if (count === 1) return [frames.at(-1)];
    return Array.from({ length: count }, (_, index) => frames[Math.round(index * (frames.length - 1) / (count - 1))]);
  }

  status() {
    this.prune();
    const first = this.frames[0], last = this.frames.at(-1);
    return { frames: this.frames.length, bytes: this.bytes, maximumBytes: this.maxBytes,
      configuredSeconds: this.seconds, oldestFrameId: first?.id, latestFrameId: last?.id,
      coveredSeconds: first && last ? (last.monotonicMs - first.monotonicMs) / 1000 : 0,
      latestFrameAgeMs: last ? Math.round(performance.now() - last.monotonicMs) : null };
  }
}

export function frameInfo({ data, ...metadata }) { return metadata; }

export function imageBlock({ data, mimeType }) {
  return { type: 'image', mimeType, data: data.toString('base64') };
}

export function imageContent({ data, width, height, canvasBounds, displayBounds, captureBounds, monotonicMs, ...metadata }) {
  return [{ type: 'text', text: JSON.stringify({ ...metadata, capture_ms: Math.round(monotonicMs) }) },
    imageBlock({ data, mimeType: metadata.mimeType })];
}
