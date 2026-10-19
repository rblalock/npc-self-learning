import type { Outcome } from './sim';

export type StudyMode = 'free' | 'lesson' | 'blind';
export type LessonPhase = 'teach' | 'reflect' | 'counter' | 'complete';
/** Session progression is independent of rendering and contains no policy/reward logic. */
export class Study {
  phase: LessonPhase = 'teach';
  outcomes: Outcome[] = [];
  block = 0;
  waiting = false;
  readonly events: {atSeconds:number; kind:string; detail:string}[] = [];
  readonly startedAt = new Date().toISOString();
  readonly startedMs = Date.now();
  constructor(public mode: StudyMode = 'free', public seed = 42, public adaptiveFirst = true) {}
  get complete() { return this.phase === 'complete'; }
  get baseline() { return this.mode === 'blind' && (this.block === 0 ? !this.adaptiveFirst : this.adaptiveFirst); }
  get roundInBlock() { return this.outcomes.length % 3; }
  record(outcome: Outcome) {
    if (this.complete || this.waiting) return;
    this.outcomes.push(outcome);
    if (this.mode === 'lesson') {
      if (this.phase === 'teach' && this.outcomes.length >= 4) { this.phase = 'reflect'; this.waiting = true; }
      else if (this.phase === 'counter' && this.outcomes.length >= 7) { this.phase = 'complete'; this.waiting = true; }
    } else if (this.mode === 'blind' && this.outcomes.length % 3 === 0) {
      this.waiting = true;
      if (this.outcomes.length === 6) this.phase = 'complete';
    }
  }
  continue(): boolean {
    if (!this.waiting || this.complete) return false;
    if (this.mode === 'lesson') this.phase = 'counter';
    if (this.mode === 'blind') this.block = 1;
    this.waiting = false;
    return true;
  }
  event(kind: string, detail: string) { this.events.push({atSeconds:+((Date.now()-this.startedMs)/1000).toFixed(2),kind,detail}); }
  export(notes: string) {
    return { schema:1, prototype:'0.2.0', mode:this.mode, seed:this.seed, startedAt:this.startedAt, complete:this.complete,
      conditions:this.mode==='blind' ? (this.adaptiveFirst ? ['adaptive','uniform'] : ['uniform','adaptive']) : ['adaptive'],
      events:this.events, outcomes:this.outcomes, notes };
  }
}
