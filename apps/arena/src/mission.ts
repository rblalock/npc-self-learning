import type { Outcome } from './sim';

export type MissionPhase = 'briefing' | 'active' | 'between' | 'won' | 'lost';

/** Mission progression owns no policy, rewards, combat stats or difficulty multiplier. */
export class Mission {
  number = 1;
  wave: 1 | 2 = 1;
  phase: MissionPhase = 'briefing';
  outcomes: Outcome[] = [];
  lastOutcome: Outcome | null = null;
  private recorded = new Set<number>();

  get waiting() { return this.phase !== 'active'; }

  record(outcome: Outcome) {
    if (this.phase !== 'active' || this.recorded.has(outcome.encounter)) return false;
    this.recorded.add(outcome.encounter);
    this.outcomes.push(outcome);
    this.lastOutcome = outcome;
    this.phase = outcome.result === 'down' ? 'lost' : this.wave === 1 ? 'between' : 'won';
    return true;
  }

  /** The host reuses its policy instance: advancing and retrying never erase memory. */
  advance() {
    if (!this.waiting) return false;
    if (this.phase === 'between') this.wave = 2;
    else {
      if (this.phase === 'won') this.number++;
      this.wave = 1;
    }
    this.phase = 'active';
    return true;
  }

  get reportSummary() {
    const last = this.lastOutcome;
    if (!last) return 'Two waves. One enemy memory.';
    if (last.recap.some(row => row.accepted)) return 'Report delivered. The next squad can adapt.';
    if (last.reportStatus === 'intercepted') return 'Scout intercepted. No new knowledge reached the squad.';
    return 'No usable report. Earlier enemy memory remains.';
  }
}
