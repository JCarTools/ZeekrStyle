function notifyAndroidReady() {
  ensureJsReady();
}

function bootAndroidBridge() {
  if (!window.androidApi) return;
  notifyAndroidReady();
  // Каждый модуль запускается независимо: сбой одного не должен отключать остальные.
  try { window.ClimateFeedback?.start(); } catch (e) {}
  try { VolumeManager.init(); } catch (e) {}
  // Выполняется после первого запроса климата и полностью отключается удалением
  // подключения js/03-volume-initial-sync.js из index.html.
  try { window.VolumeInitialSync?.run(); } catch (e) {}
  try { ThemeManager.scheduleThemeRefresh(); } catch (e) {}
}

let bridgeWatcherTimer = null;
let bridgeWatcherDone = false;

function stopBridgeWatcher() {
  if (bridgeWatcherTimer) {
    clearInterval(bridgeWatcherTimer);
    bridgeWatcherTimer = null;
  }
}

function startBridgeWatcher() {
  if (bridgeWatcherDone) return;
  const started = Date.now();
  const MAX_MS = 30000;
  const tick = () => {
    bootAndroidBridge();
    if (isAndroidBridgeOperational()) {
      bridgeWatcherDone = true;
      stopBridgeWatcher();
      return;
    }
    if (Date.now() - started >= MAX_MS) {
      bridgeWatcherDone = true;
      stopBridgeWatcher();
    }
  };
  tick();
  bridgeWatcherTimer = setInterval(tick, 500);
}

bootAndroidBridge();
startBridgeWatcher();

[100, 500, 1500].forEach(ms => {
  setTimeout(bootAndroidBridge, ms);
});

waitForAndroidApi(() => bootAndroidBridge());

const DockExtraReveal = (() => {
  function isVisible() {
    const node = el('dock-extra');
    return !!node && !node.classList.contains('dock-extra-hidden');
  }

  function setVisible(show) {
    const node = el('dock-extra');
    if (!node) return;
    node.classList.toggle('dock-extra-hidden', !show);
    if (typeof DashboardSettings !== 'undefined') DashboardSettings.apply();
    if (show) {
      const climateVisible = typeof DashboardSettings === 'undefined' || DashboardSettings.isClimateVisible();
      if (climateVisible) TempManager.scheduleRefresh();
    } else {
      TempManager.stopPoll();
    }
  }

  return { isVisible, setVisible };
})();

if (DockExtraReveal.isVisible()) {
  const climateVisible = typeof DashboardSettings === 'undefined' || DashboardSettings.isClimateVisible();
  if (climateVisible) TempManager.scheduleRefresh();
}
