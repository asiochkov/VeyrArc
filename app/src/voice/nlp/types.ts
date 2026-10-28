import type { Hypothesis, Lang } from '../stt/types';
import type { Reply } from '../exec/types';

export type Source = 'voice' | 'text' | 'chip' | 'link' | 'flow' | 'palette';
export type Utterance = { raw: string; alts: Hypothesis[]; lang: Lang; source: Source; asrConfidence: number | null; now: Date };
export type Risk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4'; // 6.7.1

export type Parsed = {
  kind: string; // 'domain.verb' from the taxonomy (6.6), or 'oos' | 'chat.hello'
  slots: Record<string, unknown>;
  confidence: number; // 0..1, final (6.7.2)
  risk: Risk;
  missing: string[]; // required slots that are absent
  why: string[]; // debugging reasons (never sent to telemetry)
};

export type Decision =
  | { action: 'execute'; parsed: Parsed }
  | { action: 'confirm'; parsed: Parsed; preview: string }
  | { action: 'clarify'; options: Parsed[]; question: string }
  | { action: 'ask-slot'; parsed: Parsed; slot: string; question: string }
  | { action: 'reject'; reason: 'oos' | 'low' | 'forbidden' | 'empty'; reply: Reply };

/** Everything the parser may know about the person (a pure input: no store access inside nlp/). */
export type HabitInfo = { id: string; name: string; core: boolean; type: 'binary' | 'counter' | 'duration'; target?: number | null; unit?: string | null; minutes?: number | null; days?: number; category?: string };
export type TaskInfo = { id: string; title: string; day: string; time?: string | null; end?: string | null; done?: boolean };
export type GoalInfo = { id: string; title: string; deadline?: string | null; steps?: string[] };
export type QuitInfo = { id: string; name: string };
export type ParseEnv = {
  now: Date;
  lang: Lang;
  habits: HabitInfo[];
  tasks: TaskInfo[];
  goals: GoalInfo[];
  quits: QuitInfo[];
  aliases?: { alias: string; target: string }[];
  assistantName?: string | null;
  lastKind?: string | null; // for «а на завтра?»
};
