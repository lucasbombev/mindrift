import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  getCurrentSubscription,
  isIos,
  isStandalonePwa,
  pushSupported,
  subscribeCurrentDevice,
  syncSubscription,
} from '../lib/push.js';
import { Button, InfoNote, Modal } from './ui.jsx';
import { Icon } from './Icons.jsx';

export function PushPrompt() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [iosWarning, setIosWarning] = useState(false);

  const dismissLocally = useCallback(() => {
    if (!user?.id) return;
    try { localStorage.setItem(`mindrift.push.prompt.dismissed.${user.id}`, '1'); } catch { /* noop */ }
    setOpen(false);
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user || user.role === 'superadmin' || user.mustChangePassword) return;
      const iosNeedsInstall = isIos() && !isStandalonePwa();
      if (!pushSupported() && !iosNeedsInstall) return;

      // Mesmo que push_enabled esteja 0, uma inscrição que já existe no
      // navegador deve ser re-sincronizada. Isso recupera o backend após uma
      // restauração de banco/atualização do PWA sem exigir novo toggle.
      const existing = await getCurrentSubscription();
      if (!alive) return;
      if (existing) {
        await syncSubscription(existing).catch(() => {});
        if (user.pushEnabled === false) await refreshUser();
        return;
      }

      if (user.pushEnabled === false) return;
      const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
      if (permission === 'denied') return;
      try {
        if (localStorage.getItem(`mindrift.push.prompt.dismissed.${user.id}`) === '1') return;
      } catch { /* noop */ }

      if (permission === 'granted') {
        try {
          await subscribeCurrentDevice();
          await refreshUser();
          toast('Notificações push ativadas neste dispositivo.', { type: 'success' });
        } catch {
          /* Se falhar, o usuário ainda pode ativar em Ajustes. */
        }
        return;
      }
      if (permission !== 'default' && !(iosNeedsInstall && permission === 'unsupported')) return;
      setIosWarning(iosNeedsInstall);
      setOpen(true);
    };
    run();
    return () => { alive = false; };
  }, [user?.id, user?.role, user?.mustChangePassword, user?.pushEnabled, refreshUser, toast]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      if (iosWarning) {
        setError('Para receber notificações no iPhone, adicione o app à tela de início primeiro.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Você pode ativar depois nas configurações do seu navegador.', { type: 'info' });
        dismissLocally();
        return;
      }
      await subscribeCurrentDevice();
      await refreshUser();
      toast('Notificações push ativadas neste dispositivo.', { type: 'success' });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    try {
      await api.patch('/push/preferences', { enabled: false }).catch(() => {});
    } finally {
      dismissLocally();
    }
  };

  return (
    <Modal
      open={open}
      onClose={dismissLocally}
      title="Ative as notificações"
      subtitle="Você não perde nenhum fim de tempo."
      icon="bell"
      size="sm"
      dismissible={!busy}
      footer={
        <div className="push-prompt__actions">
          <Button variant="ghost" onClick={decline} disabled={busy}>Agora não</Button>
          <Button icon="bell" onClick={accept} loading={busy}>Ativar Notificações</Button>
        </div>
      }
    >
      <div className="push-prompt">
        <span className="push-prompt__icon"><Icon name="bell" size={30} /></span>
        <p>
          <strong>Fique atento aos tempos!</strong> Ative as notificações para receber alertas no
          celular, mesmo com o app fechado.
        </p>
        {iosWarning && (
          <InfoNote tone="warning" icon="alert">
            Para receber notificações no iPhone, adicione o app à tela de início primeiro.
          </InfoNote>
        )}
        {error && <InfoNote tone="warning" icon="alert">{error}</InfoNote>}
      </div>
    </Modal>
  );
}
