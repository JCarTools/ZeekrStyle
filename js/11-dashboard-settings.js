// Нижняя панель всегда показывает громкость и климат.
const DashboardSettings = (() => {
  function apply() {
    const root = el('root');
    if (!root) return;
    root.classList.remove('hide-volume-controls', 'hide-climate-controls');
  }

  function keepVisible() {
    apply();
    return true;
  }

  apply();

  return {
    apply,
    setVolumeVisible: keepVisible,
    setClimateVisible: keepVisible,
    isVolumeVisible: () => true,
    isClimateVisible: () => true,
  };
})();

const SettingsDialog = (() => {
  const backdrop = el('settings-backdrop');
  const openBtn = el('btn-settings');
  const closeBtn = el('settings-close');

  function open() {
    if (!backdrop) return;
    backdrop.classList.remove('settings-hidden');
    openBtn?.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (!backdrop) return;
    backdrop.classList.add('settings-hidden');
    openBtn?.setAttribute('aria-expanded', 'false');
  }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop && !backdrop.classList.contains('settings-hidden')) close();
  });

  return { open, close };
})();
