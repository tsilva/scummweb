import { z } from 'zod';

const coordinate = z.number().finite().nonnegative();
const saveId = z.number().int().min(1).max(999);
export const ACTION_TIMEOUT_MS = 50_000;
export const nativeActions = new Set(['pause', 'resume', 'wait_ticks', 'save', 'load']);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: coordinate, y: coordinate,
    button: z.enum(['left', 'right', 'middle']).default('left'),
    count: z.number().int().min(1).max(2).default(1), hold_ms: z.number().int().min(20).max(1000).default(80) }).strict(),
  z.object({ type: z.literal('move'), x: coordinate, y: coordinate }).strict(),
  z.object({ type: z.literal('key'), key: z.string().min(1).max(40).describe(
    'One letter/digit, F1-F12, ArrowUp/Down/Left/Right, Enter, Escape, Space, Tab, Backspace, Delete, Home, End, PageUp/Down, Shift, Control or Alt. Named keys are case-sensitive; use Space, not SPACE. No shortcut combinations.'),
    hold_ms: z.number().int().min(0).max(5000).default(80) }).strict(),
  z.object({ type: z.literal('wait'), ms: z.number().int().min(0).max(10000) }).strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('resume') }).strict(),
  z.object({ type: z.literal('wait_ticks'), ticks: z.number().int().min(1).max(120) }).strict(),
  z.object({ type: z.literal('save'), id: saveId }).strict(),
  z.object({ type: z.literal('load'), id: saveId }).strict(),
  z.object({ type: z.literal('screenshot') }).strict(),
  z.object({ type: z.literal('drag'), from_x: coordinate, from_y: coordinate, x: coordinate, y: coordinate,
    button: z.enum(['left', 'right']).default('left'), steps: z.number().int().min(2).max(30).default(10),
    hold_ms: z.number().int().min(0).max(1000).default(150).describe('Hold before and after movement; each hold counts toward the sequence budget.') }).strict(),
]);

export function validateSequence(rawActions, width, height) {
  const actions = z.array(actionSchema).min(1).max(32).parse(rawActions);
  if (actions.filter(action => action.type === 'screenshot').length > 8) {
    throw new Error('Sequence exceeds the 8 explicit screenshot limit');
  }
  let milliseconds = 0;
  for (const action of actions) {
    if ('x' in action && (action.x >= width || action.y >= height)) throw new Error('Coordinates are outside the screenshot');
    if (action.type === 'drag' && (action.from_x >= width || action.from_y >= height)) throw new Error('Drag origin is outside the screenshot');
    if (action.type === 'key' && !/^(?:[a-zA-Z0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Enter|Escape|Space|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Shift|Control|Alt)$/.test(action.key)) {
      throw new Error('Unsupported gameplay key; browser shortcuts and key combinations are not allowed');
    }
    milliseconds += action.type === 'wait' ? action.ms : 'hold_ms' in action
      ? action.hold_ms * (action.type === 'drag' ? 2 : action.count || 1) : 0;
  }
  if (milliseconds > 20000) throw new Error('Sequence exceeds the 20 second input/wait budget');
  return actions;
}

export class SerialQueue {
  tail = Promise.resolve();
  run(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }
}
