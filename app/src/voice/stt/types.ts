// Speech-to-text contract (ТЗ 5.3). Engines: browser Web Speech now, an optional on-device model later (6.19).
export type Lang = 'ru' | 'en';
export type Hypothesis = { text: string; confidence: number | null }; // null = unknown (Safari reports 0)
export type SttErrorCode =
  | 'denied' | 'service-blocked' | 'no-speech' | 'audio-capture' | 'network' | 'unsupported' | 'busy' | 'aborted' | 'unknown';
export type SttEvent =
  | { type: 'start' }
  | { type: 'interim'; text: string; alts: Hypothesis[] }
  | { type: 'final'; alts: Hypothesis[] } // sorted: the best first
  | { type: 'end'; reason: 'final' | 'stopped' | 'silence' | 'no-speech' | 'aborted' }
  | { type: 'error'; code: SttErrorCode; raw?: string };
export interface SttEngine {
  readonly id: 'webspeech' | 'local';
  available(): Promise<boolean>;
  start(o: { lang: Lang; phrases: string[]; dictation?: boolean }): void;
  stop(): void; // finish and deliver final
  abort(): void; // throw away
  on(cb: (e: SttEvent) => void): () => void;
}
