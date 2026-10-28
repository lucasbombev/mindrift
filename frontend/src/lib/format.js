export function brl(centavos) {
  const value = (Number(centavos) || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseMoneyToCents(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return Math.round(value * 100);
  const normalized = String(value)
    .trim()
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
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

export function formatDate(iso) {
  if (!iso) return '—';
  const date = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateShort(iso) {
  if (!iso) return '—';
  const date = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatWeekday(iso) {
  if (!iso) return '';
  const date = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

export function todayLong() {
  const text = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatDurationMinutes(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

export function formatCountdown(ms) {
  const expired = ms <= 0;
  const total = Math.ceil(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { text, expired };
}

export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function monthStartKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function humanRelativeDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const today = new Date();
  const key = toDateKey(date);
  const todayKey = toDateKey(today);
  if (key === todayKey) return `Hoje, ${formatTime(iso)}`;
  if (key === addDaysKey(todayKey, -1)) return `Ontem, ${formatTime(iso)}`;
  return formatDateTime(iso);
}

export function paymentLabel(method) {
  return (
    {
      dinheiro: 'Dinheiro',
      pix: 'Pix',
      cartao: 'Cartão',
      outro: 'Outro',
    }[method] || '—'
  );
}

export function statusLabel(status) {
  return (
    {
      disponivel: 'Disponível',
      em_uso: 'Em uso',
      carregando: 'Carregando',
      manutencao: 'Manutenção',
      em_andamento: 'Em andamento',
      encerrada: 'Encerrada',
      cancelada: 'Cancelada',
    }[status] || status
  );
}

export function roleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Operador';
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
