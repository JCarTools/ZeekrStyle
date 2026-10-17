function buildMyApps() {
  const grid = el('my-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= MY_SLOTS; i++) {
    const saved = loadLS('lite_my_'+i);
    const slot = document.createElement('div');
    slot.className = 'my-slot'; slot.dataset.slot = i;
    if (saved) {
      slot.innerHTML = `<div class="my-slot-icon"><img src="data:image/png;base64,${saved.icon}" alt="${saved.name}"></div><div class="my-slot-name">${saved.name}</div>`;
    } else {
      slot.innerHTML = `<div class="my-slot-icon"><img class="plus-icon" src="icons/plus.svg"></div><div class="my-slot-name">Добавить</div>`;
    }

    let pressTimer = null, didLong = false;
    const startPress = () => { didLong=false; pressTimer=setTimeout(()=>{ didLong=true; if(saved){localStorage.removeItem('lite_my_'+i); buildMyApps();} }, 700); };
    const cancelPress = () => clearTimeout(pressTimer);
    slot.addEventListener('touchstart', startPress, {passive:true});
    slot.addEventListener('touchend', cancelPress);
    slot.addEventListener('touchcancel', cancelPress);
    slot.addEventListener('mousedown', startPress);
    slot.addEventListener('mouseup', cancelPress);
    slot.addEventListener('mouseleave', cancelPress);
    slot.addEventListener('click', () => {
      if (didLong) { didLong=false; return; }
      if (saved) { runApp(saved.pkg); return; }
      pickerSlot = i;
      openDrawer();
    });
    grid.appendChild(slot);
  }
}
buildMyApps();

// ── Шторка приложений ──────────────────────────────────────
function syncDrawerGeometry() {
  const drawer = el('apps-drawer');
  const sidePanel = el('top-left');
  if (!drawer || !sidePanel) return;

  const sideRect = sidePanel.getBoundingClientRect();
  const panelStyle = getComputedStyle(sidePanel);
  const uiScale = Number.parseFloat(panelStyle.getPropertyValue('--ui-scale')) || 1;
  const gap = 12 * uiScale;
  const bottomGap = Math.max(0, window.innerHeight - sideRect.bottom);
  const topGap = Math.max(18 * uiScale, sideRect.left);
  const maxHeight = Math.max(sideRect.height, window.innerHeight - bottomGap - topGap);

  drawer.style.left = `${sideRect.right + gap}px`;
  drawer.style.right = `${sideRect.left}px`;
  drawer.style.bottom = `${bottomGap}px`;
  drawer.style.height = 'auto';
  drawer.style.setProperty('--apps-min-height', `${sideRect.height}px`);
  drawer.style.setProperty('--apps-max-height', `${maxHeight}px`);
}

function syncDrawerButton(opened) {
  const button = el('dock-apps-all');
  if (!button) return;
  button.classList.toggle('active', opened);
  button.setAttribute('aria-pressed', opened ? 'true' : 'false');
  button.setAttribute('aria-label', opened ? 'Закрыть все приложения' : 'Открыть все приложения');
}

function openDrawer() {
  const grid = el('apps-grid');
  const drawer = el('apps-drawer');
  window.MiniMapPanel?.close?.();
  syncDrawerGeometry();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  syncDrawerButton(true);
  grid.innerHTML = `<div class="apps-empty">Загрузка...</div>`;
  setTimeout(() => {
    try {
      const apps = JSON.parse(window.androidApi?.getUserApps?.(TOKEN) || '[]');
      if (!apps.length) { grid.innerHTML = `<div class="apps-empty">Нет приложений</div>`; return; }
      grid.innerHTML = '';
      apps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'app-item';
        item.innerHTML = `<img src="data:image/png;base64,${app.icon}" onerror="this.style.display='none'"><span>${app.name}</span>`;
        item.addEventListener('click', () => {
          if (pickerSlot) {
            saveLS('lite_my_'+pickerSlot, {pkg:app.package, name:app.name, icon:app.icon});
            pickerSlot = null;
            buildMyApps();
          } else {
            runApp(app.package);
          }
          closeDrawer();
        });
        grid.appendChild(item);
      });
    } catch(e) { grid.innerHTML = `<div class="apps-empty">Ошибка</div>`; }
  }, 60);
}

function closeDrawer() {
  const drawer = el('apps-drawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  syncDrawerButton(false);
  pickerSlot = null;
}

function toggleDrawer() {
  if (el('apps-drawer').classList.contains('open')) closeDrawer();
  else openDrawer();
}

window.addEventListener('resize', syncDrawerGeometry);
if (typeof ResizeObserver === 'function' && el('top-left')) {
  new ResizeObserver(syncDrawerGeometry).observe(el('top-left'));
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && el('apps-drawer').classList.contains('open')) closeDrawer();
});
