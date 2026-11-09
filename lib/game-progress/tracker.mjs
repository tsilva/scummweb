// Shared by ScummWEB and the published browser module. Keep this free of Node dependencies.
export function leaves(rule) {
  const children = rule.all ?? rule.any;
  return children ? children.flatMap(leaves) : [rule];
}

export class GameProgress {
  constructor(map) {
    this.map = map;
    this.variableRules = map.milestones.flatMap(({ when }) => leaves(when)).filter(rule => 'bank' in rule);
    this.reached = new Set();
    this.variablesAvailable = this.variableRules.length === 0;
  }

  get usesSnapshots() {
    return this.map.telemetry === 'snapshot';
  }

  acceptSnapshot(identity, snapshot) {
    const { banks, room_id, room_ready, sample_time_ms: native_time_ms } = snapshot;
    const rooms = room_id === null ? [] : [{ room_id, room_ready, native_time_ms }];
    // Rebuild from the sampled save state, including after an in-game load.
    this.accept(identity.engine_id, rooms, [{ event: 'game_variables_baseline', native_time_ms, banks }], identity);
  }

  matches(rule, room) {
    if (rule.all) return rule.all.every(child => this.matches(child, room));
    if (rule.any) return rule.any.some(child => this.matches(child, room));
    if (rule.milestone) return this.reached.has(rule.milestone);
    if ('room_id' in rule) return room?.room_id === rule.room_id &&
      (rule.room_ready === undefined || room.room_ready === rule.room_ready);
    const value = this.banks?.[rule.bank]?.[rule.key ?? rule.index];
    if (rule.one_of) return rule.one_of.includes(value);
    if (rule.mask) return typeof value === 'number' && (value & rule.mask) === rule.equals;
    return value === rule.equals;
  }

  accept(engineId, rooms, gameEvents, identity) {
    this.engineMatches = engineId === this.map.engine_id;
    this.editionMatches = !this.map.edition || (identity?.engine_id === engineId &&
      identity.game_id === this.map.edition.game_id && identity.index_md5 === this.map.edition.index_md5);
    if (!this.engineMatches || !this.editionMatches) return;
    // The provider queues rooms and writes separately on the same native clock.
    const records = [...gameEvents, ...rooms].sort((a, b) => a.native_time_ms - b.native_time_ms);
    for (const record of records) {
      if (record.event === 'game_variables_baseline') {
        this.reached.clear();
        this.room = undefined;
        this.banks = structuredClone(record.banks);
        this.variablesAvailable = this.variableRules.every(rule =>
          typeof this.banks[rule.bank]?.[rule.key ?? rule.index] === typeof (rule.equals ?? rule.one_of[0]));
      } else if (record.event === 'game_variables_change') {
        if (this.banks) this.banks[record.bank][record.index] = record.value;
      } else {
        this.room = record;
      }
      for (const milestone of this.map.milestones) {
        // A bank write can match independently without reusing a stale room sample.
        if (this.variablesAvailable && this.matches(milestone.when, record.event ? undefined : record)) {
          this.reached.add(milestone.id);
        }
      }
    }
  }

  report() {
    const { game, milestones } = this.map;
    const info = { game, total: milestones.length };
    if (this.engineMatches === false) return { ...info, state: 'unavailable', reason: 'engine_mismatch' };
    if (this.editionMatches === false) return { ...info, state: 'unavailable', reason: 'edition_mismatch' };
    if (!this.variablesAvailable) return { ...info, state: 'unavailable', reason: 'missing_game_variables' };
    if (!this.variableRules.length && !this.room) {
      return { ...info, state: 'unavailable', reason: 'missing_room_telemetry' };
    }
    const reached = this.earnedMilestones;
    return { ...info, state: 'tracked', completed: reached.length,
      percent: Math.round(reached.length * 100 / milestones.length),
      latest_milestone: reached.at(-1)?.label ?? null,
      reached: reached.map(({ id }) => id) };
  }

  get nextMilestone() {
    const reached = this.earnedMilestones;
    return this.map.milestones.find(milestone => !reached.includes(milestone))?.label ?? null;
  }

  get earnedMilestones() {
    const { milestones, scoring } = this.map;
    return scoring === 'highest_stage'
      ? milestones.slice(0, milestones.findLastIndex(({ id }) => this.reached.has(id)) + 1)
      : milestones.filter(({ id }) => this.reached.has(id));
  }
}
