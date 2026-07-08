// English abbreviations — used to build the per-row date label ("17 Apr"),
// matching the source `date` string field.
export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Italian full names — used for month-group headers and filter chips,
// matching the source MONTHS object ({4:"Aprile", ...}).
export const MONTHS_IT = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio",
  "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

// Card status chip labels, verbatim from the source STATUS_LABEL.
export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Conf.",
  interest: "Interesse",
  tbd: "Da def.",
};

export function monthLabelIt(m: number): string {
  return MONTHS_IT[m] ?? "";
}

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
