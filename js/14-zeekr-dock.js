'use strict';

const ZeekrDock = (() => {
  const CLOSE_DELAY_MS = 5000;
  const seatPanels = [];
  const SEAT_ICON = 'icons/seat.svg';
  const SEAT_HEAT_ICON = 'icons/seat-heat.svg?v=20260910-2';
  const SEAT_VENT_ICON = 'icons/seat-vent.svg?v=20260910-2';

  const chevronSvg = direction => {
    const path = direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7';
    return `<svg class="dock-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  };

  function replaceArrowIcons() {
    const arrows = [
      ['btn-driver-temp-down', 'left'],
      ['btn-driver-temp-up', 'right'],
      ['btn-passenger-temp-down', 'left'],
      ['btn-passenger-temp-up', 'right'],
      ['btn-vol-down', 'left'],
      ['btn-vol-up', 'right'],
    ];
    arrows.forEach(([id, direction]) => {
      const button = el(id);
      if (!button) return;
      if (button.matches('.temp-btn')) {
        const icon = button.querySelector('.temp-btn-icon');
        if (icon) icon.innerHTML = chevronSvg(direction);
      } else {
        button.innerHTML = chevronSvg(direction);
      }
    });
  }

  function closeOtherSeatPanels(except) {
    seatPanels.forEach(panel => {
      if (panel !== except) panel.close();
    });
  }

  function setupSeatPanel(options) {
    const wrap = el(options.wrapId);
    const trigger = el(options.triggerId);
    const popover = el(options.popoverId);
    const controls = el(options.controlsId);
    if (!wrap || !trigger || !popover || !controls) return null;

    // Keep the popup outside the dock's stacking context so the map can never cover it.
    if (popover.parentElement !== document.body) document.body.appendChild(popover);

    const rowControls = new Map();
    options.items.forEach(item => {
      const control = el(item.id);
      if (!control) return;

      const rowId = item.row || 'front';
      let row = rowControls.get(rowId);
      if (!row) {
        const section = document.createElement('div');
        section.className = 'seat-popover-row';
        section.dataset.seatRow = rowId;

        const label = document.createElement('div');
        label.className = 'seat-popover-row-label';
        label.textContent = item.rowLabel || '';

        row = document.createElement('div');
        row.className = 'seat-popover-row-controls';
        section.append(label, row);
        controls.appendChild(section);
        rowControls.set(rowId, row);
      }

      control.dataset.label = item.label;
      row.appendChild(control);
    });

    const stateIcon = trigger.querySelector('.dock-seat-state-icon');
    const levelDots = [...trigger.querySelectorAll('.dock-seat-level-dots i')];
    const frontStateItems = options.items.filter(item => item.row === 'front');
    const rearStateItems = options.items.filter(item => item.row === 'rear');
    const baseLabel = trigger.getAttribute('aria-label') || '';

    const readSeatState = items => {
      const heatControl = items.find(item => item.mode === 'heat');
      const ventControl = items.find(item => item.mode === 'vent');
      const heatLevel = heatControl ? window.ClimateUI?.getLevel(heatControl.id) || 0 : 0;
      const ventLevel = ventControl ? window.ClimateUI?.getLevel(ventControl.id) || 0 : 0;
      const mode = heatLevel > 0 ? 'heat' : (ventLevel > 0 ? 'vent' : 'idle');
      const level = mode === 'heat' ? heatLevel : (mode === 'vent' ? ventLevel : 0);
      return { mode, level };
    };

    const syncSeatState = () => {
      const frontState = readSeatState(frontStateItems);
      const rearState = readSeatState(rearStateItems);
      const useFront = frontState.level > 0;
      const activeState = useFront ? frontState : rearState;
      const { mode, level } = activeState;
      const icon = mode === 'heat' ? SEAT_HEAT_ICON : (mode === 'vent' ? SEAT_VENT_ICON : SEAT_ICON);

      if (stateIcon && stateIcon.getAttribute('src') !== icon) stateIcon.setAttribute('src', icon);
      trigger.dataset.mode = mode;
      trigger.classList.toggle('active', level > 0);
      levelDots.forEach((dot, index) => dot.classList.toggle('on', index < level));

      const positionLabel = useFront ? 'Переднее' : 'Заднее';
      const stateLabel = mode === 'heat'
        ? `${positionLabel}: подогрев, уровень ${level}`
        : (mode === 'vent' ? `${positionLabel}: вентиляция, уровень ${level}` : 'выключено');
      trigger.setAttribute('aria-label', `${baseLabel}: ${stateLabel}`);
    };

    const stateObserver = new MutationObserver(syncSeatState);
    stateObserver.observe(controls, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class'],
    });
    syncSeatState();

    let timer = null;
    let open = false;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const close = () => {
      if (!open) return;
      open = false;
      clearTimer();
      popover.classList.remove('open');
      popover.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    };

    const armClose = () => {
      clearTimer();
      if (open) timer = setTimeout(close, CLOSE_DELAY_MS);
    };

    const openPanel = () => {
      closeOtherSeatPanels(api);
      open = true;
      popover.classList.add('open');
      popover.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      armClose();
    };

    const api = {
      close,
      armClose,
      syncSeatState,
      contains: node => wrap.contains(node) || popover.contains(node),
    };
    seatPanels.push(api);

    trigger.addEventListener('click', event => {
      event.stopPropagation();
      if (open) close(); else openPanel();
    });
    popover.addEventListener('click', event => {
      event.stopPropagation();
      armClose();
    });
    popover.addEventListener('pointerdown', armClose, { passive: true });

    return api;
  }

  function bindGlobalClose() {
    document.addEventListener('click', event => {
      seatPanels.forEach(panel => {
        if (!panel.contains(event.target)) panel.close();
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') seatPanels.forEach(panel => panel.close());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) seatPanels.forEach(panel => panel.close());
    });
  }

  function bindLaunchers() {
    el('dock-apps-all')?.addEventListener('click', () => {
      pickerSlot = null;
      openDrawer();
    });
  }

  function init() {
    replaceArrowIcons();
    bindLaunchers();
    setupSeatPanel({
      wrapId: 'driver-seat-dock',
      triggerId: 'dock-driver-seat',
      popoverId: 'driver-seat-popover',
      controlsId: 'driver-seat-popup-controls',
      items: [
        { id: 'cl-seat-l', label: 'Подогрев', mode: 'heat', row: 'front', rowLabel: 'Перед', dockState: true },
        { id: 'cl-vent-l', label: 'Вентиляция', mode: 'vent', row: 'front', rowLabel: 'Перед', dockState: true },
        { id: 'cl-rear-seat-l', label: 'Подогрев', mode: 'heat', row: 'rear', rowLabel: 'Зад' },
        { id: 'cl-rear-vent-l', label: 'Вентиляция', mode: 'vent', row: 'rear', rowLabel: 'Зад' },
      ],
    });
    setupSeatPanel({
      wrapId: 'passenger-seat-dock',
      triggerId: 'dock-passenger-seat',
      popoverId: 'passenger-seat-popover',
      controlsId: 'passenger-seat-popup-controls',
      items: [
        { id: 'cl-seat-r', label: 'Подогрев', mode: 'heat', row: 'front', rowLabel: 'Перед', dockState: true },
        { id: 'cl-vent-r', label: 'Вентиляция', mode: 'vent', row: 'front', rowLabel: 'Перед', dockState: true },
        { id: 'cl-rear-seat-r', label: 'Подогрев', mode: 'heat', row: 'rear', rowLabel: 'Зад' },
        { id: 'cl-rear-vent-r', label: 'Вентиляция', mode: 'vent', row: 'rear', rowLabel: 'Зад' },
      ],
    });
    bindGlobalClose();
  }

  init();
  return {};
})();
