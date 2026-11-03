import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getCurrentSubscription,
  pushSupported,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
  syncSubscription,
} from '../lib/push.js';
import { Button, InfoNote, Spinner, Toggle } from './ui.jsx';
import { Icon } from './Icons.jsx';

export function PushSettings({ compact = false }) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const check = useCallback(async () => {
    const canUse = pushSupported();
    setSupported(canUse);
    if (!canUse) {
      setLoading(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      const sub = await getCurrentSubscription();
      if (!sub) {
        setSubscribed(false);
      } else {
        await syncSubscription(sub).catch(() => {});
        const status = await api.get(`/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`);
        setSubscribed(Boolean(status.ativo));
      }
    } catch {
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!supported) throw new Error('Este navegador não suporta Web Push.');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') {
        throw new Error('Permissão de notificação negada. Ative nas configurações do navegador.');
      }
      await subscribeCurrentDevice();
      setSubscribed(true);
      await refreshUser();
      toast('Notificações push ativadas neste dispositivo.', { type: 'success' });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    try {
      await unsubscribeCurrentDevice();
      setSubscribed(false);
      await refreshUser();
      toast('Notificações push desativadas.', { type: 'success' });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (delaySeconds = 0) => {
    setBusy(true);
    setMessage('');
    try {
      const data = await api.post('/push/test', delaySeconds ? { delay_seconds: delaySeconds } : undefined);
      toast(
        delaySeconds
          ? `Notificação agendada para daqui a ${delaySeconds}s. Bloqueie a tela agora.`
          : 'Notificação de teste enviada. Ela deve aparecer mesmo com o app em segundo plano.',
        { type: 'success' },
      );
      if (data?.agendado) setMessage(`Teste agendado no backend para ${delaySeconds}s.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="push-settings push-settings--loading"><Spinner size={18} /> Verificando push…</div>;

  return (
    <div className={`push-settings ${compact ? 'is-compact' : ''}`}>
      <div className="push-settings__head">
        <span className="push-settings__icon"><Icon name="bell" size={21} /></span>
        <div>
          <strong>Notificações push no dispositivo</strong>
          <span>Receba o aviso de tempo esgotado mesmo com o app em segundo plano.</span>
        </div>
      </div>
      {!supported ? (
        <InfoNote tone="warning" icon="alert">
          Este navegador/contexto não suporta Web Push. Use o PWA instalado em HTTPS (Tailscale).
        </InfoNote>
      ) : (
        <>
          <div className="push-settings__row">
            <div>
              <strong>{subscribed ? 'Push ativado' : 'Push desativado'}</strong>
              <span>Permissão: {permission === 'granted' ? 'concedida' : permission === 'denied' ? 'negada' : 'não solicitada'}</span>
            </div>
            <Toggle
              checked={subscribed}
              onChange={(value) => (value ? enable() : disable())}
              disabled={busy || permission === 'denied'}
              label=""
            />
          </div>
          {subscribed && (
            <div className="push-settings__tests">
              <Button size="sm" variant="secondary" icon="bell" onClick={() => sendTest(0)} loading={busy} block>
                Enviar notificação de teste
              </Button>
              <Button size="sm" variant="ghost" icon="clock" onClick={() => sendTest(10)} loading={busy} block>
                Testar com tela bloqueada (10s)
              </Button>
            </div>
          )}
          {permission === 'denied' && (
            <InfoNote tone="warning" icon="alert">
              A permissão está bloqueada. No Chrome, toque no cadeado ao lado da URL → Notificações → Permitir. No Safari/iPhone, use Ajustes do iPhone → Notificações → Leao Brinquedos (com o PWA instalado na Tela de Início).
            </InfoNote>
          )}
          <p className="muted small">
            No iPhone/iPad, instale o PWA na Tela de Início para receber Web Push. Em Android, o
            Chrome pode pedir a permissão na primeira ativação.
          </p>
        </>
      )}
      {message && <InfoNote tone="warning" icon="alert">{message}</InfoNote>}
    </div>
  );
}
