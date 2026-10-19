import type { Outcome, Policy } from './sim';

export const PLAYTEST_PROTOCOL = {
  id: 'human-fixed-v1', version: 1, purpose: 'Formative usability and counterplay study; not a population effectiveness trial',
  warmupRounds: 2, repeatRounds: 6, changeRounds: 6,
  conditions: ['adaptive', 'selected-fixed'],
  fixedActions: { vanguard: 'rush', flanker: 'flank_right', ranger: 'lead' },
  fixedSelection: 'adaptation-v1; selected on scripted orbit/reverse/cover; strongest fixed comparator in that benchmark',
  reward: 'original-individual-v1', memory: 'Fresh independent policy per condition; identical seed, stats, map and controls',
  order: 'Cryptographically randomized 50/50 by default; facilitator may assign balanced order using the URL and assignment is recorded',
  concealment: 'Condition identity and learning inspector hidden until both questionnaires are submitted. Client-side concealment is not tamper-proof.',
  prompts: 'Find a repeatable movement route for six rounds, then deliberately change it for six rounds. Keys never change.',
  questions: ['Unaided description of changes and supporting evidence', 'Did your changed approach work, and what happened?', 'Enjoyment (1–7)', 'Fairness (1–7)', 'Frustration (1–7)', 'Did enemies change? yes/no/unsure'],
  analysis: 'Retain all incomplete sessions and exclusions. Report paired participant ratings, preference counts, unaided descriptions, and combat traces descriptively. No inferential population claim from 6–10 formative participants.',
  success: 'Before expanding scope, seek concrete unaided descriptions linked to observed tactics, deliberate successful counterplay, and acceptable fairness. A difficulty increase or a correct condition guess alone is insufficient.',
  limitations: 'Twelve rounds may not expose adaptation. Human movement is not matched between conditions. Order, practice, expectations and fixed-baseline selection can influence results. Automated QA is excluded from human findings.',
} as const;

export type Condition = 'adaptive' | 'selected-fixed';
export type Stage = 'intro' | 'warmup' | 'condition-intro' | 'repeat' | 'change-prompt' | 'change' | 'survey' | 'complete' | 'ended';
export type Answers = { noticed: string; counterplay: string; enjoyment: number; fairness: number; frustration: number; change: 'yes' | 'no' | 'unsure' };
type Telemetry = { frames: number; moving: number; firing: number; dash: number; directions: number[] };

export function fixedStudyPolicy(policy: Policy): Policy {
  return { request<T>(request: object): T {
    const q = request as {op:string;role:keyof typeof PLAYTEST_PROTOCOL.fixedActions;allowed:string[]};
    if (q.op === 'choose') {
      const action = PLAYTEST_PROTOCOL.fixedActions[q.role];
      if (!q.allowed.includes(action)) throw new Error('Study fixed action is not legal');
      return policy.request<T>({...request,allowed:[action],baseline:true});
    }
    return policy.request<T>(request);
  }};
}

export class Playtest {
  stage: Stage = 'intro'; running = false; block = 0; round = 0; warmups = 0;
  readonly order: Condition[];
  readonly startedAt = new Date().toISOString();
  readonly events: {at:string;type:string;detail:string;stage:Stage;block:number;round:number}[] = [];
  readonly records: {kind:'warmup'|'condition';block:number;condition:Condition|'warmup';round:number;phase:string;outcome:Outcome;telemetry:Telemetry}[] = [];
  readonly surveys: {block:number;condition:Condition;answers:Answers}[] = [];
  source: 'human' | 'automated-qa';
  preference: 'set-a'|'set-b'|'neither'|'unsure' = 'unsure';
  constructor(readonly options: {id:string;seed:number;adaptiveFirst:boolean;assignment:'randomized'|'facilitator';build:string;qa?:boolean}) {
    this.order = options.adaptiveFirst ? ['adaptive','selected-fixed'] : ['selected-fixed','adaptive'];
    this.source=options.qa?'automated-qa':'human'; this.event('created',options.assignment);
  }
  get condition() { return this.order[this.block]; }
  get complete() { return this.stage === 'complete'; }
  event(type:string,detail='') { this.events.push({at:new Date().toISOString(),type,detail,stage:this.stage,block:this.block,round:this.round}); }
  markQA(reason:string) { if(this.source!=='automated-qa') this.event('qa-exclusion',reason); this.source='automated-qa'; }
  startRound() {
    if(this.running || ['survey','complete','ended'].includes(this.stage)) return false;
    if(this.stage==='intro') this.stage='warmup';
    if(this.stage==='condition-intro') this.stage='repeat';
    if(this.stage==='change-prompt') this.stage='change';
    this.running=true;this.event('round-start');return true;
  }
  record(outcome:Outcome,telemetry:Telemetry) {
    if(!this.running) throw new Error('No active study round');
    const warmup=this.stage==='warmup';
    if(outcome.control!=='manual') this.markQA('Nonmanual outcome');
    this.records.push({kind:warmup?'warmup':'condition',block:this.block,condition:warmup?'warmup':this.condition,round:warmup?this.warmups+1:this.round+1,phase:this.stage,outcome:structuredClone(outcome),telemetry:structuredClone(telemetry)});
    this.running=false;
    if(warmup) { if(++this.warmups===PLAYTEST_PROTOCOL.warmupRounds) this.stage='condition-intro'; }
    else {
      this.round++;
      if(this.round===PLAYTEST_PROTOCOL.repeatRounds) this.stage='change-prompt';
      else if(this.round===PLAYTEST_PROTOCOL.repeatRounds+PLAYTEST_PROTOCOL.changeRounds) this.stage='survey';
    }
    this.event('round-end',outcome.result);
  }
  submit(answers:Answers) {
    if(this.stage!=='survey') throw new Error('Questionnaire is not due');
    if(!answers.noticed.trim() || !answers.counterplay.trim() || !['yes','no','unsure'].includes(answers.change)) throw new Error('Answer both free-text questions; “nothing” is a valid answer.');
    if(![answers.enjoyment,answers.fairness,answers.frustration].every(n=>Number.isInteger(n)&&n>=1&&n<=7)) throw new Error('Choose a rating from 1 to 7 for each question.');
    this.surveys.push({block:this.block,condition:this.condition,answers:structuredClone(answers)});
    this.event('survey-submitted');
    if(this.block===0) {this.block=1;this.round=0;this.stage='condition-intro';}
    else this.stage='complete';
  }
  end(reason='Participant ended session') { if(!this.complete){this.event('ended',reason);this.stage='ended';this.running=false;} }
  export() {
    return {schema:2,protocol:PLAYTEST_PROTOCOL,session:{...this.options,source:this.source,startedAt:this.startedAt,exportedAt:new Date().toISOString(),complete:this.complete,stage:this.stage,roundInProgress:this.running,order:this.order,preference:this.preference},events:structuredClone(this.events),records:structuredClone(this.records),surveys:structuredClone(this.surveys),exclusions:this.source==='automated-qa'?['Automated QA; not human evidence']:[]};
  }
}
