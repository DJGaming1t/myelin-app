/** Exact, read-only arithmetic on explicitly supplied times; never a schedule approval. */
const clock = '(\d{2}:\d{2})';
const clockValue = (value: string): number | null => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3));
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
};

const countValue = (raw: string, maximum: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= maximum ? n : null;
};

const minutesLabel = (minutes: number) => `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
const disclaimer = 'This checks only the times you supplied, not your recorded MYELIN availability. Nothing was changed.';

// Anchored patterns are intentional: compound commands, guessed dates, ambiguous
// 12-hour clocks and quoted instructions are never partially processed here.
export function tryAssistantPlanMathReply(request: string): string | null {
  if (request.length > 400) return null;
  const text = request.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const budget = /^i have (\d{1,4}) minutes? (?:free|available)[,.]? (?:i (?:want|need|plan) )?(?:to do )?(\d{1,2}) (\d{1,3})[ -]minute (?:study )?blocks? and (\d{1,2}) (\d{1,3})[ -]minute breaks?(?:[,.]? (?:does (?:it|this) fit|will (?:it|this) fit|can (?:it|this) fit))?$/i.exec(text);
  if (budget) {
    const available = countValue(budget[1]!, 1440);
    const blocks = countValue(budget[2]!, 20);
    const blockMinutes = countValue(budget[3]!, 600);
    const breaks = countValue(budget[4]!, 20);
    const breakMinutes = countValue(budget[5]!, 120);
    if (available === null || blocks === null || blockMinutes === null || breaks === null || breakMinutes === null) return null;
    if (blocks * blockMinutes + breaks * breakMinutes > 1440) return null;
    const needed = blocks * blockMinutes + breaks * breakMinutes;
    const difference = available - needed;
    return `MYELIN time check: ${blocks} × ${blockMinutes} study minutes + ${breaks} × ${breakMinutes} break minutes = ${needed} minutes. With ${available} minutes available, ${difference >= 0 ? `it fits with ${minutesLabel(difference)} left` : `it does not fit; you are short by ${minutesLabel(-difference)}`}.\n\n${disclaimer}`;
  }

  const overlap = new RegExp(`^([a-z][a-z ]{1,30}) (?:is |from )?${clock}\\s*(?:-|to)\\s*${clock} and ([a-z][a-z ]{1,30}) (?:is |from )?${clock}\\s*(?:-|to)\\s*${clock} on the same day[,.]? (?:what(?:'s| is) the (?:overlap|overlapping interval)(?: and (?:its )?duration)?|how (?:long|many minutes) (?:do they )?overlap)$`, 'i').exec(text);
  if (overlap) {
    const a = clockValue(overlap[2]!); const b = clockValue(overlap[3]!);
    const c = clockValue(overlap[5]!); const d = clockValue(overlap[6]!);
    if (a === null || b === null || c === null || d === null || b <= a || d <= c) return null;
    const start = Math.max(a, c); const end = Math.min(b, d);
    if (end <= start) return `MYELIN time check: These two intervals do not overlap.\n\n${disclaimer}`;
    const fmt = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    return `MYELIN time check: They overlap from ${fmt(start)} to ${fmt(end)} for ${minutesLabel(end - start)}.\n\n${disclaimer}`;
  }

  const due = new RegExp(`^my (?:task|assignment|project|homework) is due at ${clock} and i (?:plan|expect) to finish (?:it )?at ${clock} on the same day[,.]? (?:am i late|will (?:it|i) be late|is (?:that|this) on time)$`, 'i').exec(text);
  if (due) {
    const deadline = clockValue(due[1]!); const finish = clockValue(due[2]!);
    if (deadline === null || finish === null) return null;
    const diff = finish - deadline;
    return `MYELIN time check: ${diff > 0 ? `Finishing at ${due[2]} is ${minutesLabel(diff)} after the ${due[1]} deadline` : diff < 0 ? `Finishing at ${due[2]} is ${minutesLabel(-diff)} before the ${due[1]} deadline` : `Finishing at ${due[2]} is exactly at the ${due[1]} deadline`}.\n\n${disclaimer}`;
  }
  return null;
}
