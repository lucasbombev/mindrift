import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, InfoNote, Spinner, Toggle } from './ui.jsx';
import { Icon } from './Icons.jsx';

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushSettings({ compact = false }) {
  const { toast } = useToast();
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const check = useCallback(async () => {
    const canUse =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext;
    setSupported(canUse);
    if (!canUse) {
      setLoading(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, null);
      const sub = reg ? await withTimeout(reg.pushManager.getSubscription(), 3000, null) : null;
      setSubscribed(Boolean(sub));
      if (sub) {
        await api.post('/push/subscribe', { subscription: sub.toJSON() }).catch(() => {});
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
      const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, null);
      if (!reg) {
        throw new Error('O service worker ainda não está registrado. Abra o app instalado e tente novamente.');
      }
      const key = await api.get('/push/public-key');
      const subscription =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key.publicKey),
        }));
      await api.post('/push/subscribe', { subscription: subscription.toJSON() });
      setSubscribed(true);
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
      const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, null);
      const sub = reg ? await withTimeout(reg.pushManager.getSubscription(), 3000, null) : null;
      if (sub) {
        await api.delete('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast('Notificações push desativadas.', { type: 'success' });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage('');
    try {
      await api.post('/push/test');
      toast('Notificação de teste enviada. Ela deve aparecer mesmo com o app em segundo plano.', { type: 'success' });
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
            <Button size="sm" variant="secondary" icon="bell" onClick={sendTest} loading={busy} block>
              Enviar notificação de teste
            </Button>
          )}
          {permission === 'denied' && (
            <InfoNote tone="warning" icon="alert">
              A permissão está bloqueada. Libere notificações nas configurações do navegador/PWA.
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
