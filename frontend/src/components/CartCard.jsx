import { Link } from 'react-router-dom';
import { Button, Avatar } from './ui.jsx';
import { Icon } from './Icons.jsx';
import { brl, clientName, formatCountdown, formatTime, paymentLabel, statusLabel } from '../lib/format.js';

export function CartArt({ code }) {
  return (
    <div className="cart-art" aria-hidden="true">
      <svg viewBox="0 0 320 210" className="cart-art__svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`bg-${code}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#111c2e" />
            <stop offset="100%" stopColor="#1e2f47" />
          </linearGradient>
          <linearGradient id={`glow-${code}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <rect width="320" height="210" fill={`url(#bg-${code})`} />
        <g opacity="0.35" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
          <path d="M18 74h58" />
          <path d="M10 90h44" />
          <path d="M28 106h34" />
        </g>
        <circle cx="252" cy="52" r="52" fill="#f97316" opacity="0.08" />
        <circle cx="252" cy="52" r="30" fill="#f97316" opacity="0.08" />
        <g transform="translate(84 72)">
          <path d="M4 71h178" stroke={`url(#glow-${code})`} strokeWidth="5" strokeLinecap="round" />
          <path
            d="M18 66c4-20 19-32 42-32h22l17 18h43c9 0 16 7 16 16v8c0 5-4 9-9 9H27c-7 0-11-6-9-13Z"
            fill="#f97316"
          />
          <path d="M62 46c2-14 12-22 28-22h12l12 12" fill="none" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
          <circle cx="94" cy="18" r="16" fill="#fbbf24" />
          <path d="M84 18h17" stroke="#111c2e" strokeWidth="5" strokeLinecap="round" />
          <circle cx="38" cy="84" r="20" fill="#0b1220" stroke="#e5e7eb" strokeWidth="9" />
          <circle cx="141" cy="84" r="20" fill="#0b1220" stroke="#e5e7eb" strokeWidth="9" />
          <circle cx="38" cy="84" r="4" fill="#94a3b8" />
          <circle cx="141" cy="84" r="4" fill="#94a3b8" />
          <path d="M78 55h26" stroke="#111c2e" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
        </g>
        <g opacity="0.5" stroke="#f97316" strokeWidth="2" strokeLinecap="round">
          <path d="M244 128h48" />
          <path d="M258 140h34" />
          <path d="M250 152h22" />
        </g>
      </svg>
      <span className="cart-art__code">{code}</span>
    </div>
  );
}

function statusClass(status) {
  return (
    {
      disponivel: 'available',
      em_uso: 'in-use',
      carregando: 'charging',
      manutencao: 'maintenance',
    }[status] || 'available'
  );
}

export function CartCard({ cart, now, alertLeadSeconds, onStart, onRenew, onEnd, isAdmin }) {
  const session = cart.sessaoAtiva;
  const endsAt = session ? new Date(session.fimPrevistoEm).getTime() : 0;
  const remaining = session ? endsAt - now : null;
  const { text, expired } = session ? formatCountdown(remaining) : { text: '', expired: false };
  const urgent = session && remaining <= Math.max(0, alertLeadSeconds) * 1000;
  const totalDuration = session
    ? Math.max(1, endsAt - new Date(session.iniciadoEm).getTime())
    : 1;
  const progress = session ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;

  const className = [
    'cart-card',
    `cart-card--${statusClass(cart.status)}`,
    urgent ? 'is-urgent' : '',
    expired ? 'is-expired' : '',
    session ? 'has-session' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} style={{ '--category-color': cart.category?.cor || '#f97316' }}>
      <div className="cart-card__media">
        {cart.fotoUrl ? (
          <img
            src={cart.fotoUrl}
            alt={`Carrinho ${cart.codigo}`}
            className="cart-card__photo"
            loading="lazy"
          />
        ) : (
          <CartArt code={cart.codigo} />
        )}
        <span className={`cart-status cart-status--${statusClass(cart.status)}`}>
          <span className="cart-status__dot" />
          {statusLabel(cart.status)}
        </span>
        {cart.category && (
          <span className="cart-category" style={{ '--category-color': cart.category.cor }}>
            <span aria-hidden="true">{cart.category.icone}</span>
            {cart.category.nome}
          </span>
        )}
        {cart.fotoUrl && <span className="cart-card__code">{cart.codigo}</span>}
      </div>

      <div className="cart-card__body">
        {session ? (
          <>
            <div className="cart-card__session-head">
              <Avatar name={clientName(session.clienteNome)} size={34} />
              <div className="cart-card__session-name">
                <strong>{clientName(session.clienteNome)}</strong>
                <span>
                  {session.minutosContratados} min · {brl(session.valorCentavos)}
                </span>
              </div>
              {urgent && (
                <span className={`timer-flag ${expired ? 'timer-flag--expired' : ''}`}>
                  <Icon name="alert" size={14} />
                  {expired ? 'Esgotado' : 'Acabando'}
                </span>
              )}
            </div>

            <div className={`timer-display ${expired ? 'is-expired' : urgent ? 'is-urgent' : ''}`}>
              <span className="timer-display__value">{text}</span>
              <span className="timer-display__label">
                {expired ? 'tempo excedido' : 'restantes'}
              </span>
            </div>

            <div className="timer-progress" aria-hidden="true">
              <span
                className={`timer-progress__bar ${urgent ? 'is-urgent' : ''}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="cart-card__meta">
              <span>
                <Icon name="clock" size={14} /> início {formatTime(session.iniciadoEm)}
              </span>
              <span>
                <Icon name="timer" size={14} /> fim {formatTime(session.fimPrevistoEm)}
              </span>
            </div>

            <div
              className={`cart-card__payment ${
                session.pago
                  ? 'is-paid'
                  : session.valorAdiantadoCentavos > 0
                    ? 'is-partial'
                    : 'is-later'
              }`}
            >
              <Icon name="cash" size={14} />
              <span>
                {session.pago
                  ? `Pago adiantado${
                      session.formaAdiantado ? ` · ${paymentLabel(session.formaAdiantado)}` : ''
                    }`
                  : session.valorAdiantadoCentavos > 0
                    ? `Adiantado ${brl(session.valorAdiantadoCentavos)} · falta ${brl(
                        session.valorPendenteCentavos,
                      )}`
                    : 'Pagamento no final'}
              </span>
            </div>

            <div className="cart-card__actions">
              <Button variant="secondary" size="sm" icon="plus" onClick={() => onRenew(session, cart)}>
                Renovar
              </Button>
              <Button variant="success" size="sm" icon="stop" onClick={() => onEnd(session, cart)}>
                Encerrar
              </Button>
            </div>
          </>
        ) : cart.status === 'disponivel' ? (
          <>
            <div className="cart-card__ready">
              <span className="cart-card__ready-icon">
                <Icon name="check" size={18} />
              </span>
              <div>
                <strong>Pronto para alugar</strong>
                <span>Sem sessão ativa</span>
              </div>
            </div>
            <Button size="lg" block icon="play" onClick={() => onStart(cart)}>
              Iniciar aluguel
            </Button>
          </>
        ) : (
          <>
            <div className={`cart-card__unavailable cart-card__unavailable--${statusClass(cart.status)}`}>
              <span>
                <Icon name={cart.status === 'carregando' ? 'refresh' : 'settings'} size={22} />
              </span>
              <div>
                <strong>{statusLabel(cart.status)}</strong>
                <p>
                  {cart.status === 'carregando'
                    ? 'Carrinho na carga. Libere quando estiver pronto.'
                    : 'Em manutenção. Altere o status no cadastro quando liberar.'}
                </p>
              </div>
            </div>
            {isAdmin && (
              <Link className="cart-card__manage" to="/carrinhos">
                Gerenciar carrinho
                <Icon name="chevronRight" size={16} />
              </Link>
            )}
          </>
        )}
        {cart.status === 'em_uso' && !session && (
          <p className="cart-card__warning">
            <Icon name="alert" size={15} /> Status “em uso” sem sessão ativa. Ajuste no cadastro.
          </p>
        )}
      </div>
    </article>
  );
}
