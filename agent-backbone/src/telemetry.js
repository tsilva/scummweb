import { z } from 'zod';
import { shortIdPattern } from './ids.js';

const bankName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const sampleTime = z.number().nonnegative();
const roomId = z.number().int().nonnegative();
const identitySchema = z.object({ engine_id: z.string(), game_id: z.string(), index_md5: z.string().optional() });
const valueSchema = z.union([z.number().finite(), z.boolean(), z.null()]);
const bankSchema = z.union([
  z.array(valueSchema).min(1).max(4096),
  z.record(z.string(), valueSchema).refine(bank => Object.keys(bank).length <= 4096),
]);
const snapshotSchema = z.object({
  schema_version: z.literal(1), room_id: roomId.nullable(), room_name: z.string().optional(),
  room_ready: z.boolean().optional(), sample_time_ms: sampleTime, banks: z.record(bankName, bankSchema),
});

export const telemetryQuery = {
  session_id: z.string().regex(shortIdPattern), bank: bankName.optional(),
  offset: z.number().int().min(0).max(4095).optional(),
  limit: z.number().int().min(1).max(256).optional(),
};

export function readGameTelemetry() {
  return globalThis.scummwebTelemetry?.read();
}

export function parseGameTelemetry({ identity, snapshot } = {}) {
  const game_identity = identity == null ? null : identitySchema.parse(identity);
  const sample = snapshot == null ? null : snapshotSchema.parse(snapshot);
  if (sample && !game_identity) throw new Error('Missing telemetry engine identity');
  return { identity: game_identity, snapshot: sample };
}

export function telemetryReport(payload, { bank, offset = 0, limit = 64 } = {}) {
  const { identity: game_identity, snapshot: sample } = parseGameTelemetry(payload);
  const room = sample?.room_id != null || sample?.room_name ? {
    id: sample.room_id, sample_time_ms: sample.sample_time_ms,
    ...(sample.room_name !== undefined && { name: sample.room_name }),
    ...(sample.room_ready !== undefined && { ready: sample.room_ready }),
  } : null;

  const values = sample?.banks ?? {};
  const banks = Object.entries(values).map(([name, entries]) => Array.isArray(entries)
    ? { name, length: entries.length }
    : { name, length: Object.keys(entries).length, keyed: true });
  const selected = bank && Object.hasOwn(values, bank) ? values[bank] : null;
  const keys = selected && !Array.isArray(selected) ? Object.keys(selected).sort().slice(offset, offset + limit) : null;
  const page = keys ? keys.map(key => selected[key]) : selected?.slice(offset, offset + limit);
  return { game_identity, state: room || banks.length ? 'available' : 'unavailable', room, banks,
    ...(bank && { selection: selected ? { bank, available: true, offset, values: page, ...(keys && { keys }),
      sample_time_ms: sample.sample_time_ms } : { bank, available: false } }) };
}
