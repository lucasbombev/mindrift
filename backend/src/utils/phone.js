import { badRequest } from './errors.js';

/**
 * Normaliza telefone brasileiro para E.164 (+55DD9XXXXXXXX).
 * Aceita "+55 (11) 91234-5678", "11912345678", etc.
 */
export function normalizePhoneBR(value, { required = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    if (required) throw badRequest('Informe o telefone.', 'telefone_obrigatorio');
    return null;
  }
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  if (digits.length !== 11 || !/^[1-9]{2}9\d{8}$/.test(digits)) {
    throw badRequest('Telefone inválido. Use (DD) 9XXXX-XXXX.', 'telefone_invalido');
  }
  return `+55${digits}`;
}

export function formatPhoneBR(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  if (local.length !== 11) return value || '';
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
}
