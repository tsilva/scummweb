import { parse } from 'yaml';
import { z } from 'zod';
import { leaves } from './tracker.mjs';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const roomId = z.number().int().nonnegative();
const bankIndex = z.number().int().min(0).max(4095);
const integer = z.number().int();
const mask = integer.min(1).max(0x7fffffff);
const equals = z.union([integer, z.boolean()]);
const oneOf = z.array(integer).min(1).max(16);
const bankName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const bankSlot = z.object({
  bank: bankName,
  index: bankIndex,
}).strict();
const keyedSlot = z.object({ bank: bankName, key: z.string().min(1).max(80) }).strict();
const flagSlot = bankSlot.extend({
  mask: mask.refine(value => (value & (value - 1)) === 0, 'Expected a single-bit mask'),
});
const bankPredicate = z.union([
  bankSlot.extend({ equals }),
  bankSlot.extend({ mask, equals: integer }),
  bankSlot.extend({ one_of: oneOf }),
]);
const roomPredicate = z.object({
  room_ready: z.boolean().optional(),
});
const predicate = z.union([
  bankPredicate,
  roomPredicate.extend({ room: slug }).strict(),
  roomPredicate.extend({ room_id: roomId }).strict(),
  z.object({ variable: slug, equals }).strict(),
  z.object({ variable: slug, one_of: oneOf }).strict(),
  z.object({ flag: slug, equals: z.boolean().default(true) }).strict(),
  z.object({ object: slug, equals: integer }).strict(),
  z.object({ object: slug, one_of: oneOf }).strict(),
  z.object({ milestone: slug }).strict(),
  z.object({ all: z.array(z.lazy(() => predicate)).min(1).max(16) }).strict(),
  z.object({ any: z.array(z.lazy(() => predicate)).min(1).max(16) }).strict(),
]);
const mapSchema = z.object({
  schema_version: z.literal(1),
  game: slug,
  engine_id: z.string().min(1).max(80),
  edition: z.object({ game_id: slug, index_md5: z.string().regex(/^[a-f0-9]{32}$/) }).strict().optional(),
  scoring: z.literal('highest_stage').optional(),
  telemetry: z.literal('snapshot').optional(),
  rooms: z.record(slug, roomId).optional(),
  variables: z.record(slug, z.union([bankSlot, keyedSlot])).optional(),
  flags: z.record(slug, flagSlot).optional(),
  objects: z.record(slug, bankIndex).optional(),
  milestones: z.array(z.object({
    id: slug,
    label: z.string().min(1).max(200),
    when: predicate,
  }).strict()).min(1).max(100),
}).strict();

export function compileGameProgress(game, source) {
  slug.parse(game);
  const map = mapSchema.parse(parse(source, { maxAliasCount: 0, stringKeys: true }));
  const ids = new Set();
  for (const milestone of map.milestones) {
    const { id, when } = milestone;
    if (map.game !== game || ids.has(id) || leaves(when).some(rule => rule.milestone && !ids.has(rule.milestone))) {
      throw new Error(`Invalid game, milestone ID or milestone reference in game internals map: ${game}`);
    }
    milestone.when = resolveReferences(when, map, id);
    ids.add(id);
  }
  return map;
}

function resolveReferences(rule, map, milestone) {
  const lookup = (section, label) => {
    const entries = map[section];
    if (!entries || !Object.hasOwn(entries, label)) {
      throw new Error(`Unknown ${section.slice(0, -1)} "${label}" in milestone "${milestone}" for game internals map: ${map.game}`);
    }
    return entries[label];
  };
  if (rule.all) return { all: rule.all.map(child => resolveReferences(child, map, milestone)) };
  if (rule.any) return { any: rule.any.map(child => resolveReferences(child, map, milestone)) };
  if ('room' in rule) {
    const { room, ...condition } = rule;
    return { ...condition, room_id: lookup('rooms', room) };
  }
  if ('variable' in rule) {
    const { variable, ...condition } = rule;
    const slot = lookup('variables', variable);
    if ('key' in slot && map.telemetry !== 'snapshot') {
      throw new Error(`Variable "${variable}" in game internals map ${map.game} requires snapshot telemetry`);
    }
    return { ...slot, ...condition };
  }
  if ('flag' in rule) {
    const flag = lookup('flags', rule.flag);
    return { ...flag, equals: rule.equals ? flag.mask : 0 };
  }
  if ('object' in rule) {
    const { object, ...condition } = rule;
    return { bank: 'object_state', index: lookup('objects', object), ...condition };
  }
  return rule;
}
