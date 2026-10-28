const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function nowIso() {
  return new Date().toISOString();
}

export function toIso(date) {
  return date.toISOString();
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function parseDateKey(key) {
  if (!DATE_RE.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayBounds(key = localDateKey()) {
  const start = parseDateKey(key);
  if (!start) throw new Error('Data inválida');
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end, key };
}

export function rangeBounds(fromKey, toKey) {
  const from = fromKey ? parseDateKey(fromKey) : new Date();
  const to = toKey ? parseDateKey(toKey) : from;
  if (!from || !to) throw new Error('Período inválido');
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    fromKey: localDateKey(start),
    toKey: localDateKey(new Date(end.getTime() - 1)),
  };
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addDaysKey(key, days) {
  const date = parseDateKey(key);
  if (!date) throw new Error('Data inválida');
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function lastNDays(n, endKey = localDateKey()) {
  return { fromKey: addDaysKey(endKey, -(n - 1)), toKey: endKey };
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
