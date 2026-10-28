/*
 * One phrase, several commands (ТЗ 6.6.3): «сделал зарядку, выпил воды и почитал». Splits the raw text at sentence marks,
 * commas and the connectors «потом», «а потом», «и ещё», and at «и» before a verb. The pipeline parses the whole phrase
 * and the split; the split wins only if every part is a command on its own.
 */
const VERBISH = '(?:отметь|отметил|добавь|поставь|запиши|сделал|выпил|прочитал|почитал|пробежал|помедитировал|позанимался|напомни|удали|перенеси|включи|останови|создай|открой|покажи|заверши|закрой|вычеркни|сходил|погулял|настроение|задача|фокус|таймер|\\p{L}+(?:ал|ил|ел|ол|ул|ыл)(?:а|и)?)';
const CONNECT = new RegExp(`\\s+(?:а\\s+)?(?:потом|затем|после этого|и ещё|и еще|а ещё|а еще)\\s+|\\s+и\\s+(?=${VERBISH}(?![\\p{L}]))`, 'giu');

export function segments(raw: string): string[] {
  const parts: string[] = [];
  for (const piece of raw.split(/[.;!?\n]+|,\s+|,(?=\p{L})/u)) {
    for (const p of piece.split(CONNECT)) {
      const t = p?.trim();
      if (t) parts.push(t);
    }
  }
  return parts;
}
