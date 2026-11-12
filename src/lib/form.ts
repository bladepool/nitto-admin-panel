/* FormData helpers shared by the admin forms. */

/** Integer from a FormData field; blank -> undefined. */
export function formInt(data: FormData, key: string): number | undefined {
  const raw = String(data.get(key) ?? "").trim();
  if (raw === "") return undefined;
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) ? value : undefined;
}

export function formText(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}
