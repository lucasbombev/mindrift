import { Button, IconButton } from './ui.jsx';
import { Icon } from './Icons.jsx';
import { formatCountdown, formatDuration } from '../lib/format.js';

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
                <strong>{alert.session.cartCodigo}</strong> {alert.session.clienteNome}
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

export function ExpiredAlertsOverlay({ alerts, now, onAcknowledge, onAcknowledgeAll, onEnd, onEnableSound }) {
  if (!alerts.length) return null;
  return (
    <div className="alarm-overlay" role="alertdialog" aria-modal="true" aria-label="Tempo esgotado">
      <div className="alarm-card">
        <div className="alarm-card__beacon">
          <Icon name="alert" size={38} />
        </div>
        <span className="alarm-card__eyebrow">Tempo esgotado</span>
        <h1>{alerts.length > 1 ? `${alerts.length} sessões estouraram` : 'Hora de encerrar!'}</h1>
        <p className="alarm-card__intro">
          O cliente já passou do tempo contratado. Encerre ou adicione mais tempo para liberar o
          carrinho.
        </p>

        <div className="alarm-list">
          {alerts.map((alert) => {
            const over = now - new Date(alert.session.fimPrevistoEm).getTime();
            return (
              <div key={alert.key} className="alarm-item">
                <div className="alarm-item__info">
                  <span className="alarm-item__cart">{alert.session.cartCodigo}</span>
                  <div>
                    <strong>{alert.session.clienteNome}</strong>
                    <span className="alarm-item__time">
                      +{formatDuration(over / 1000)} de excedente
                    </span>
                  </div>
                </div>
                <div className="alarm-item__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onAcknowledge(alert);
                      onEnd(alert.session);
                    }}
                  >
                    Encerrar
                  </Button>
                  <IconButton
                    icon="close"
                    label="Silenciar este alerta"
                    onClick={() => onAcknowledge(alert)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="alarm-card__footer">
          <Button variant="danger" size="lg" onClick={onAcknowledgeAll} block>
            Estou ciente · silenciar
          </Button>
          {onEnableSound && (
            <button type="button" className="alarm-card__sound" onClick={onEnableSound}>
              <Icon name="sound" size={17} /> Ativar som e notificações
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
