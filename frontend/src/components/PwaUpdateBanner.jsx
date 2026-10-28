import { useEffect, useState } from 'react';
import { Button } from './ui.jsx';
import { Icon } from './Icons.jsx';

/**
 * O registro fica em src/main.jsx (virtual:pwa-register). Em modo autoUpdate,
 * o plugin chama onNeedReload quando um novo SW assume; mostramos este banner
 * em vez de recarregar a página no meio de um aluguel.
 */
export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onUpdate = () => {
      setVisible(true);
      setDismissed(false);
    };
    window.addEventListener('drift:pwa-update', onUpdate);
    return () => window.removeEventListener('drift:pwa-update', onUpdate);
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <span className="pwa-update-banner__icon">
        <Icon name="download" size={20} />
      </span>
      <div className="pwa-update-banner__text">
        <strong>Nova versão disponível — atualizar</strong>
        <span>Recarregue para usar a versão mais recente do painel.</span>
      </div>
      <Button size="sm" onClick={() => window.location.reload()}>
        Atualizar
      </Button>
      <button
        type="button"
        className="pwa-update-banner__close"
        aria-label="Dispensar aviso de atualização"
        onClick={() => setDismissed(true)}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
