export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

export function dsFromDate(date: string): number {
  const { m, d } = parts(date);
  return m * 100 + d;
}

export function labelFromDate(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m]}`;
}

export function monthFromDate(date: string): number {
  return parts(date).m;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function shortDs(ds: number): string {
  return `${pad(ds % 100)}.${pad(Math.floor(ds / 100))}`;
}
