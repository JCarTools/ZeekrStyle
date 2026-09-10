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
function openDrawer() {
  const grid = el('apps-grid');
  const drawer = el('apps-drawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
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
  pickerSlot = null;
}
el('drawer-close').addEventListener('click', closeDrawer);
el('apps-drawer').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeDrawer();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && el('apps-drawer').classList.contains('open')) closeDrawer();
});
