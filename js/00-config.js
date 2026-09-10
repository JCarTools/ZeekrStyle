'use strict';

const TOKEN = "SECURE_TOKEN_2025";
document.addEventListener("contextmenu", e => e.preventDefault());

// Android WebView can ignore user-scalable=no, so block multi-touch zoom as well.
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });
['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
  document.addEventListener(type, event => event.preventDefault(), { passive: false });
});

// ── Акцент ─────────────────────────────────────────────────
const ACCENTS = [
  '#294EF1', '#0ea5e9', '#06b6d4', '#10b981', '#84cc16', '#facc15',
  '#f59e0b', '#f97316', '#ef4444', '#e11d48', '#ec4899', '#8b5cf6',
  '#111827', '#64748b', '#f8fafc', '#ffffff',
];
let accent;

// ── Часы ───────────────────────────────────────────────────
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WEEKDAYS = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

// ── Водитель / Пассажир ────────────────────────────────────
const DRIVER_CONTROLS = [
  { id:'cl-seat-l',  icon:'icons/seat-heat.svg',  on:'heat_seat_l',  off:'heat_seat_l_0',  max:3 },
  { id:'cl-wheel',   icon:'icons/steering-wheel 1.svg', on:'heat_wheel_on', off:'heat_wheel_off', max:1 },
  { id:'cl-vent-l',  icon:'icons/seat-vent.svg', on:'vent_seat_l',  off:'vent_seat_l_0',  max:3 },
  { id:'cl-rear-seat-l', icon:'icons/seat-heat.svg', on:'heat_zad_seat_l', off:'heat_zad_seat_l_0', max:3 },
  { id:'cl-rear-vent-l', icon:'icons/seat-vent.svg', on:'vent_zad_seat_l', off:'vent_zad_seat_l_0', max:3 },
  { id:'cl-wind',  icon:'icons/Windshield defroster.svg', on:'heat_windshield_on',  off:'heat_windshield_off',  max:1 },
  { id:'cl-rear',  icon:'icons/Rare windshield defroster.svg', on:'heat_rearwindow_on',  off:'heat_rearwindow_off',  max:1 },
  /*{ id:'cl-memory', memory:['voditel_seat_1','voditel_seat_2','voditel_seat_3'] },*/
];

// ── Подогревы ────────────────────────────────────
/*const ALL_CONTROLS = [
  { id:'cl-wind',  icon:'icons/Windshield defroster.svg', on:'heat_windshield_on',  off:'heat_windshield_off',  max:1 },
  { id:'cl-rear',  icon:'icons/Rare windshield defroster.svg', on:'heat_rearwindow_on',  off:'heat_rearwindow_off',  max:1 },
];*/

const PASSENGER_CONTROLS = [
  { id:'cl-seat-r', icon:'icons/seat-heat.svg', iconMirrorX: true, on:'heat_seat_r', off:'heat_seat_r_0', max:3 },
  { id:'cl-vent-r', icon:'icons/seat-vent.svg', iconMirrorX: true, on:'vent_seat_r', off:'vent_seat_r_0', max:3 },
  { id:'cl-rear-seat-r', icon:'icons/seat-heat.svg', iconMirrorX: true, on:'heat_zad_seat_r', off:'heat_zad_seat_r_off', max:3 },
  { id:'cl-rear-vent-r', icon:'icons/seat-vent.svg', iconMirrorX: true, on:'vent_zad_seat_r', off:'vent_zad_seat_r_off', max:3 },
];

const climateState = {};

const DRIVER_EXCLUSIVE = {
  'cl-seat-l': 'cl-vent-l',
  'cl-vent-l': 'cl-seat-l',
  'cl-rear-seat-l': 'cl-rear-vent-l',
  'cl-rear-vent-l': 'cl-rear-seat-l',
};

const PASSENGER_EXCLUSIVE = {
  'cl-seat-r': 'cl-vent-r',
  'cl-vent-r': 'cl-seat-r',
  'cl-rear-seat-r': 'cl-rear-vent-r',
  'cl-rear-vent-r': 'cl-rear-seat-r',
};

const CLIMATE_EXCLUSIVE = { ...DRIVER_EXCLUSIVE, ...PASSENGER_EXCLUSIVE };

const SHUTTER_CONTROLS = [
  { id: 'btn-shutter-open', icon: 'icons/car-open.svg', cmd: 'OPEN_SHTORKA', aria: 'Открыть шторку' },
  { id: 'btn-shutter-close', icon: 'icons/car-close.svg', cmd: 'CLOSE_SHTORKA', aria: 'Закрыть шторку' },
];

const VOLUME_CENTER_CONTROLS = [
  { id: 'btn-vol-down', icon: 'icons/volume-down.svg', aria: 'Тише', action: 'down' },
  { id: 'btn-mute', icon: 'icons/mute-button.svg', aria: 'Без звука', action: 'mute' },
  { id: 'btn-vol-up', icon: 'icons/volume-up.svg', aria: 'Громче', action: 'up' },
];

// ── Мои приложения ─────────────────────────────────────────
const MY_SLOTS = 4;
let pickerSlot = null;

// ── Раскладка приложений ───────────────────────────────────
const LAYOUT = {
  driverCols: 2,
  passengerCols: 2, // сетка климата (1) + блок шторки (1)
  cardGaps: 2,
};
