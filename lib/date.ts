// Local date YYYY-MM-DD — never use toISOString().split('T')[0] for "today",
// because that's UTC. At 1:30 AM IST on Wednesday, UTC is still Tuesday 8 PM,
// which would record the meal under the wrong calendar day.

export function localDateStr(d: Date = new Date()): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return localDateStr();
}
