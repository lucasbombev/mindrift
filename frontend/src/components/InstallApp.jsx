import { useState } from 'react';
import { Button, InfoNote, Modal } from './ui.jsx';
import { Icon } from './Icons.jsx';
import { secureContextInfo } from '../lib/pwa.js';
import { promptInstall } from '../lib/pwa.js';
import { useInstallState } from '../hooks/useInstallState.js';
import { useToast } from '../context/ToastContext.jsx';

export function InstallAppButton({ variant = 'ghost', block = false, label = 'Instalar app' }) {
  const [open, setOpen] = useState(false);
  const { canPrompt, standalone } = useInstallState();
  const { toast } = useToast();

  if (standalone) {
    return (
      <div className="install-state">
        <Icon name="check" size={18} />
        <span>App instalado neste dispositivo</span>
      </div>
    );
  }

  const handleClick = async () => {
    if (canPrompt) {
      const result = await promptInstall();
      if (result.outcome === 'accepted') toast('Instalando o Drift Rent…', { type: 'success' });
      else setOpen(true);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button variant={variant} icon="install" onClick={handleClick} block={block}>
        {label}
      </Button>
      <InstallInstructionsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function InstallInstructionsModal({ open, onClose }) {
  const context = secureContextInfo();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instalar na tela inicial"
      subtitle="Acesso rápido, em tela cheia, sem precisar abrir o navegador."
      icon="install"
      footer={<Button onClick={onClose}>Entendi</Button>}
    >
      {!context.secure && (
        <InfoNote tone="warning" icon="alert">
          <strong>Conexão HTTP detectada.</strong> O navegador só permite instalação/PWA completo em HTTPS
          (ou localhost). Use o endereço <strong>https://…:3443</strong> após gerar e confiar no
          certificado local — instruções no README. No HTTP, use “Adicionar à tela inicial”, que cria um
          atalho.
        </InfoNote>
      )}
      <div className="install-steps">
        <div className="install-step">
          <span className="install-step__badge">Android</span>
          <p>
            Abra no <strong>Chrome</strong>, toque no menu <strong>⋮</strong> e escolha{' '}
            <strong>Instalar app</strong> (ou “Adicionar à tela inicial”).
          </p>
        </div>
        <div className="install-step">
          <span className="install-step__badge">iPhone / iPad</span>
          <p>
            Abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e depois em{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        </div>
        <div className="install-step">
          <span className="install-step__badge">Notebook</span>
          <p>
            No Chrome/Edge, use o ícone de instalação na barra de endereço ou o menu{' '}
            <strong>Instalar Drift Rent</strong>.
          </p>
        </div>
      </div>
      <InfoNote icon="wifi">
        O app abre mesmo sem internet externa, mas precisa estar na mesma rede Wi-Fi do notebook
        servidor para carregar os dados.
      </InfoNote>
    </Modal>
  );
}
