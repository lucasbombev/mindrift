import { useEffect, useState } from 'react';
import { useSoundPrefs } from '../context/SoundContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { SOUND_OPTIONS } from '../lib/audio.js';
import { Button, Field, InlineError, Modal, Toggle } from './ui.jsx';
import { Icon } from './Icons.jsx';

export function SoundSettingsModal({ open, onClose }) {
  const { prefs, save, test } = useSoundPrefs();
  const { toast } = useToast();
  const [sound, setSound] = useState(prefs.somNome || '');
  const [volume, setVolume] = useState(prefs.volume ?? 70);
  const [vibrar, setVibrar] = useState(prefs.vibrar !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSound(prefs.somNome || '');
    setVolume(prefs.volume ?? 70);
    setVibrar(prefs.vibrar !== false);
    setError('');
  }, [open, prefs.somNome, prefs.volume, prefs.vibrar]);

  const playTest = async (name) => {
    const ok = await test(name, volume);
    if (!ok) toast('Toque na tela para liberar o áudio e tente novamente.', { type: 'warning' });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await save({ som_nome: sound || null, volume: Number(volume), vibrar });
      toast('Preferências de som salvas.', { type: 'success' });
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const effective = sound || prefs.tenant?.somFim || 'alarme';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Som e vibração"
      subtitle="Preferências deste usuário; valem no próximo alerta."
      icon="sound"
      dismissible={!saving}
      footer={
        <Button type="submit" form="sound-settings" size="lg" icon="check" loading={saving} block>
          Salvar preferências
        </Button>
      }
    >
      <form id="sound-settings" className="stack" onSubmit={submit}>
        <InlineError>{error}</InlineError>
        <Field label="Som do fim do tempo">
          <div className="sound-grid">
            <button
              type="button"
              className={`sound-option ${!sound ? 'is-selected' : ''}`}
              onClick={() => setSound('')}
            >
              <Icon name="sound" size={20} />
              <strong>Padrão do negócio</strong>
              <small>{SOUND_OPTIONS.find((s) => s.value === prefs.tenant?.somFim)?.label || 'Alarme'}</small>
            </button>
            {SOUND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sound-option ${sound === option.value ? 'is-selected' : ''}`}
                onClick={() => setSound(option.value)}
              >
                <span className="sound-option__top">
                  <strong>{option.label}</strong>
                  <span
                    role="button"
                    tabIndex={0}
                    className="sound-option__test"
                    onClick={(event) => { event.stopPropagation(); playTest(option.value); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); playTest(option.value); } }}
                  >
                    Testar
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Field>
        <Button type="button" variant="secondary" icon="sound" onClick={() => playTest(effective)} block>
          Testar som selecionado
        </Button>
        <Field label={`Volume: ${volume}%`} htmlFor="sound-volume">
          <input
            id="sound-volume"
            className="range"
            type="range"
            min="0"
            max="100"
            step="5"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </Field>
        <Toggle
          checked={vibrar}
          onChange={setVibrar}
          label="Vibrar no alerta"
          description="Quando o dispositivo/navegador suportar vibração."
        />
        <p className="muted small">
          Preferências são salvas na sua conta e continuam após fechar e reabrir o PWA. A
          repetição até dispensar é definida pelo negócio.
        </p>
      </form>
    </Modal>
  );
}
