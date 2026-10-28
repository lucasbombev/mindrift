import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons.jsx';
import { brl, parseMoneyToCents } from '../lib/format.js';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon = null,
  className = '',
  type = 'button',
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 18 : 21} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ icon, label, size = 'md', variant = 'ghost', className = '', badge = null, ...props }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${variant} icon-btn--${size} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : size === 'lg' ? 26 : 22} />
      {badge ? <span className="icon-btn__badge">{badge}</span> : null}
    </button>
  );
}

export function Field({ label, htmlFor, hint, error, required, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return <textarea className={`input textarea ${className}`} rows={rows} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <div className={`select-wrap ${className}`}>
      <select className="input select" {...props}>
        {children}
      </select>
      <Icon name="chevronDown" size={18} className="select-wrap__icon" />
    </div>
  );
}

export function MoneyInput({ valueCents, onChangeCents, id, disabled, placeholder = '0,00' }) {
  const [text, setText] = useState(
    Number.isFinite(valueCents) && valueCents !== null ? (valueCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const lastExternal = useRef(valueCents);

  useEffect(() => {
    if (valueCents === lastExternal.current) return;
    lastExternal.current = valueCents;
    if (valueCents === null || valueCents === undefined || Number.isNaN(valueCents)) {
      setText('');
    } else {
      setText((Number(valueCents) / 100).toFixed(2).replace('.', ','));
    }
  }, [valueCents]);

  const handleChange = (event) => {
    const raw = event.target.value.replace(/[^\d.,]/g, '');
    setText(raw);
    const cents = parseMoneyToCents(raw);
    lastExternal.current = Number.isNaN(cents) ? null : cents;
    onChangeCents(Number.isNaN(cents) ? null : cents);
  };

  const handleBlur = () => {
    if (text === '') return;
    const cents = parseMoneyToCents(text);
    if (!Number.isNaN(cents)) setText((cents / 100).toFixed(2).replace('.', ','));
  };

  return (
    <div className="money-input">
      <span className="money-input__prefix">R$</span>
      <input
        id={id}
        className="input money-input__field"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled, id }) {
  return (
    <div className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'switch--on' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}

export function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__item ${value === option.value ? 'is-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={18} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '', icon = null }) {
  return (
    <span className={`badge badge--${tone} ${className}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    disponivel: { tone: 'green', label: 'Disponível' },
    em_uso: { tone: 'blue', label: 'Em uso' },
    carregando: { tone: 'amber', label: 'Carregando' },
    manutencao: { tone: 'gray', label: 'Manutenção' },
    em_andamento: { tone: 'blue', label: 'Em andamento' },
    encerrada: { tone: 'green', label: 'Encerrada' },
    cancelada: { tone: 'red', label: 'Cancelada' },
  };
  const item = map[status] || { tone: 'neutral', label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className = '',
  icon = null,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  // Este efeito roda SÓ ao abrir/fechar. Se dependesse de onClose (função recriada
  // a cada render, ex.: tick do timer), ele roubaria o foco do input a cada segundo
  // e fecharia o teclado do celular.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissibleRef.current) onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    const focusTimer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      // Não rouba o foco de um campo que o usuário já está usando (ou autoFocus).
      if (active && active !== panel && panel.contains(active)) return;
      panel.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose?.();
      }}
    >
      <div
        className={`modal modal--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal__handle" aria-hidden="true" />
        <header className="modal__header">
          <div className="modal__heading">
            {icon && (
              <span className="modal__icon">
                <Icon name={icon} size={22} />
              </span>
            )}
            <div>
              {title && <h2 id={titleId}>{title}</h2>}
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {dismissible && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" size={22} />
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  tone = 'danger',
  loading = false,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={tone === 'danger' ? 'alert' : 'info'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
      dismissible={!loading}
    >
      {message && <p className="confirm-text">{message}</p>}
      {children}
    </Modal>
  );
}

export function EmptyState({ icon = 'info', title, text, action = null, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <span className="empty-state__icon">
        <Icon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 22, label = 'Carregando' }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={label} />;
}

export function LoadingScreen({ message = 'Carregando…' }) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__mark">
        <span className="loading-screen__pulse" />
        <Icon name="cart" size={34} />
      </div>
      <p>{message}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions = null, eyebrow = null }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, hint = null, tone = 'neutral', icon = null, compact = false }) {
  return (
    <div className={`stat-card stat-card--${tone} ${compact ? 'stat-card--compact' : ''}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon && (
          <span className="stat-card__icon">
            <Icon name={icon} size={19} />
          </span>
        )}
      </div>
      <strong className="stat-card__value">{value}</strong>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  );
}

export function InlineError({ children }) {
  if (!children) return null;
  return (
    <div className="inline-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </div>
  );
}

export function InfoNote({ children, tone = 'info', icon = 'info' }) {
  return (
    <div className={`info-note info-note--${tone}`}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Avatar({ name, size = 38, tone = 'brand' }) {
  const label = String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span className={`avatar avatar--${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {label}
    </span>
  );
}

export function MoneyText({ cents, className = '' }) {
  return <span className={className}>{brl(cents)}</span>;
}
