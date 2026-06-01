export function calcProgressPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(Math.round((current / target) * 100), 100);
}

export function formatMacro(value: number, unit: string): string {
  return `${value}${unit}`;
}
