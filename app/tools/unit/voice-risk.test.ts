import { understand } from '../../src/voice/nlu';
import { decide } from '../../src/voice/nlp/decide';
import { needsConfirm, riskOf } from '../../src/voice/nlp/risk';

// run: npx tsx tools/unit/voice-risk.test.ts
const now = new Date(2026, 9, 14, 10, 0);
let fail = 0;
const check = (name: string, ok: boolean) => { if (!ok) { fail++; console.log('✗', name); } };

// R0/R1 (info, single reversible change) never ask first
check('mood → execute', decide(understand('настроение 4', now)).action === 'execute');
check('done → execute', decide(understand('выпил 2 стакана воды', now)).action === 'execute');
check('nav → execute', decide(understand('открой планер', now)).action === 'execute');

// R2+ (structural / destructive) always ask first
check('taskDelete → confirm', decide(understand('удали задачу купить хлеб', now)).action === 'confirm');
check('relapse → confirm', decide(understand('сорвался с курения', now)).action === 'confirm');
check('taskAdd → confirm', decide(understand('задача позвонить маме завтра в 15:30', now)).action === 'confirm');
check('quitAdd → confirm', decide(understand('добавь отказ от курения', now)).action === 'confirm');
check('quitArchive → confirm', decide(understand('убери отказ курение', now)).action === 'confirm');
check('habitArchive → confirm', decide(understand('заархивируй привычку чтение', now)).action === 'confirm');
check('habitDelete → confirm', decide(understand('удали привычку чтение', now)).action === 'confirm');
check('goalComplete → confirm', decide(understand('заверши цель марафон', now)).action === 'confirm');
check('goalDeadline → confirm', decide(understand('поставь дедлайн цели марафон на 20 ноября', now)).action === 'confirm');
check('exportData → confirm', decide(understand('экспортируй мои данные', now)).action === 'confirm');
check('goalDiary → confirm', decide(understand('запиши в дневник цели марафон: сегодня пробежал 5 км', now)).action === 'confirm');
check('arcOath → confirm', decide(understand('поставь клятву: не сдаваться', now)).action === 'confirm');
check('settingsTheme → execute', decide(understand('включи тёмную тему', now)).action === 'execute');
check('settingsReminder → confirm', decide(understand('поставь напоминание на 21:00', now)).action === 'confirm');
check('habitStreakQuery → execute', decide(understand('какая серия по бегу', now)).action === 'execute');
check('quitDaysQuery → execute', decide(understand('сколько дней я не курю', now)).action === 'execute');

// A-03/B-06: low ASR confidence forces a confirm even for an otherwise-R0/R1 intent; typed text
// (no asrConfidence argument) and high-confidence speech skip this check entirely.
check('low ASR confidence on R0 nav → confirm', decide(understand('открой планер', now), 0.3).action === 'confirm');
check('high ASR confidence on R0 nav → execute', decide(understand('открой планер', now), 0.9).action === 'execute');
check('no ASR confidence (typed) on R0 nav → execute', decide(understand('открой планер', now)).action === 'execute');
check('zero ASR confidence (unsupported browser) on R0 nav → execute', decide(understand('открой планер', now), 0).action === 'execute');

// risk table itself
check('riskOf taskDelete = R3', riskOf('taskDelete') === 'R3');
check('riskOf quitAdd = R2', riskOf('quitAdd') === 'R2');
check('riskOf quitArchive = R3', riskOf('quitArchive') === 'R3');
check('riskOf habitArchive = R2', riskOf('habitArchive') === 'R2');
check('riskOf habitRestore = R2', riskOf('habitRestore') === 'R2');
check('riskOf habitDelete = R3', riskOf('habitDelete') === 'R3');
check('riskOf nav = R0', riskOf('nav') === 'R0');
check('needsConfirm(R0) = false', !needsConfirm('R0'));
check('needsConfirm(R1) = false', !needsConfirm('R1'));
check('needsConfirm(R2) = true', needsConfirm('R2'));
check('needsConfirm(R4) = true', needsConfirm('R4'));

console.log(fail ? `${fail} failed` : 'all risk/decide checks passed');
if (fail) process.exit(1);
