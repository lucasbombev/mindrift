import { Icon } from './Icons.jsx';
import { clientName, formatCountdown, formatDuration } from '../lib/format.js';

export function LeadAlertBanner({ alerts, now, onAcknowledge }) {
  if (!alerts.length) return null;
  return (
    <div className="lead-alert" role="alert">
      <span className="lead-alert__icon">
        <Icon name="alert" size={22} />
      </span>
      <div className="lead-alert__content">
        <strong>Tempo acabando</strong>
        <div className="lead-alert__list">
          {alerts.map((alert) => {
            const remaining = new Date(alert.session.fimPrevistoEm).getTime() - now;
            return (
              <span key={alert.key} className="lead-alert__item">
                <strong>{alert.session.cartCodigo}</strong> {clientName(alert.session.clienteNome)}
                <em>{formatCountdown(Math.max(0, remaining)).text}</em>
              </span>
            );
          })}
        </div>
      </div>
      <button type="button" className="lead-alert__dismiss" onClick={onAcknowledge}>
        Dispensar
      </button>
    </div>
  );
}

export function ExpiredAlertBanner({ alerts, now, onAcknowledge, onAcknowledgeAll, onEnd }) {
  if (!alerts.length) return null;
  return (
    <div className="expired-banner" role="alert">
      <div className="expired-banner__head">
        <span className="expired-banner__icon"><Icon name="alert" size={20} /></span>
        <strong>Tempo esgotado</strong>
        <button type="button" className="expired-banner__silence" onClick={onAcknowledgeAll}>
          Silenciar todos
        </button>
      </div>
      <div className="expired-banner__items">
        {alerts.map((alert) => {
          const over = Math.max(0, now - new Date(alert.session.fimPrevistoEm).getTime());
          return (
            <div key={alert.key} className="expired-banner__item">
              <span><strong>{alert.session.cartCodigo}</strong> · +{formatDuration(over / 1000)}</span>
              <button type="button" onClick={() => { onAcknowledge(alert); onEnd(alert.session); }}>
                Encerrar
              </button>
              <button type="button" aria-label="Silenciar este alerta" onClick={() => onAcknowledge(alert)}>
                <Icon name="close" size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
