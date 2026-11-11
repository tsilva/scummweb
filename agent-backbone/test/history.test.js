import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameHistory, frameInfo, imageContent } from '../src/history.js';
import { validateSequence, SerialQueue } from '../src/actions.js';

test('history enforces byte/time bounds and retrieves chronological samples', () => {
  const history = new FrameHistory({ seconds: 60, maxBytes: 8, maxFrames: 10 });
  const old = history.add(Buffer.from('1234'), { actionId: 'old' });
  history.add(Buffer.from('5678'), { actionId: 'new' });
  history.add(Buffer.from('abcd'), { actionId: 'new' });
  assert.equal(history.get(old.id), undefined);
  assert.equal(history.bytes, 8);
  assert.equal(history.review({ count: 1 })[0].id, history.latest().id);
  assert.equal(history.review({ actionId: 'new' }).length, 2);
  history.prune(performance.now() + 61000);
  assert.equal(history.frames.length, 0);
  assert.equal(history.bytes, 0);
});

test('MCP image blocks carry frame identity and time without repeating renderer geometry', () => {
  const history = new FrameHistory();
  const frame = history.add(Buffer.from('image bytes'), { width: 651, height: 490,
    canvasBounds: { x: -154, y: 0, width: 960, height: 490 },
    displayBounds: { x: 0, y: 0, width: 651, height: 490 },
    captureBounds: { x: 154, y: 115, width: 651, height: 490 }, step: 2 });
  const [info, image] = imageContent(frame);
  assert.deepEqual(JSON.parse(info.text), { id: frame.id, timestamp: frame.timestamp,
    capture_ms: Math.round(frame.monotonicMs), mimeType: frame.mimeType, step: 2 });
  assert.deepEqual(Buffer.from(image.data, 'base64'), frame.data);
  assert.deepEqual(frameInfo(frame).displayBounds, frame.displayBounds);
});

test('input validates the entire sequence before execution', () => {
  assert.throws(() => validateSequence([{ type: 'click', x: 960, y: 0 }], 960, 720), /outside/);
  assert.throws(() => validateSequence([{ type: 'key', key: 'Meta+L' }], 960, 720), /Unsupported/);
  assert.throws(() => validateSequence(Array.from({ length: 3 }, () => ({ type: 'wait', ms: 10000 })), 960, 720), /budget/);
  assert.equal(validateSequence([{ type: 'click', x: 100, y: 100 }], 960, 720)[0].hold_ms, 80);
});

test('queue preserves ordering and recovers after errors', async () => {
  const queue = new SerialQueue(), events = [];
  const a = queue.run(async () => { events.push(1); throw new Error('expected'); });
  const b = queue.run(async () => events.push(2));
  await assert.rejects(a, /expected/); await b;
  assert.deepEqual(events, [1, 2]);
});
