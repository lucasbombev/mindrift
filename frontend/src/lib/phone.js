export function phoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  return digits.slice(0, 11);
}

export function formatPhoneInput(value) {
  const digits = phoneDigits(value);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatPhoneDisplay(value) {
  const digits = phoneDigits(value);
  return digits.length === 11 ? formatPhoneInput(digits) : value || '—';
}

export function phoneIsValid(value) {
  return /^\d{2}9\d{8}$/.test(phoneDigits(value));
}
