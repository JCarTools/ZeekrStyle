# Zeekr style by Hudson

![Zeekr style by Hudson — dark](img/screenshot-dark.png)
![Zeekr style by Hudson — light](img/screenshot-light.png)

Лаунчер «чёрного экрана» для **JCarTools WebView**: плеер, климат, громкость, температура и быстрый запуск приложений. Работает в Android WebView через `window.androidApi`; в браузере без API доступны локальные настройки темы и акцента.

---

## Общие сведения об API

| Параметр | Значение |
| --- | --- |
| **TOKEN** | `"SECURE_TOKEN_2025"` — первый аргумент почти всех вызовов `androidApi` |
| **Инициализация** | `onJsReady(TOKEN)` **до** вызовов `runEnum` / `runApp` / `getUserApps` (`ensureJsReady` в `01-utils.js`, `09-init.js`) |
| **runEnum** | `androidApi.runEnum(TOKEN, cmd)` — команды медиа, климата, сидений и т.д. |
| **runApp** | `androidApi.runApp(TOKEN, packageName)` — запуск приложения |
| **getUserApps** | `androidApi.getUserApps(TOKEN)` — список приложений для шторки |

Фактический контракт конкретной машины, снятый 09.09.2026 через `getRunEnum()` и `getCarData("all")`, сохранён в [JCARTOOLS_VEHICLE_CONTRACT.md](JCARTOOLS_VEHICLE_CONTRACT.md). Для обратной связи климата и сидений `getCarData("all")` используется первым.

---

## Верхняя панель

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Настройки** `#btn-settings` | Верх слева | Открывает диалог `#settings-dialog` | — |
| **Тема** `settings-theme` | Диалог настроек | Radio: **Авто / Светлая / Темная**. В режиме auto читает системную тему через Android API или `prefers-color-scheme` | Локально: `lite_theme_mode`; Android события темы → `ThemeManager.handleThemeEvent` |
| **Цвет** `.accent-dot` (×16) | Диалог настроек | Выбирает цвет акцента, обновляет CSS-переменные `--accent*`, сохраняет в `localStorage`; сетка занимает ширину диалога и масштабируется вместе с UI | Локально: `lite_accent` |
| **Размер** `settings-scale` | Диалог настроек | Radio: **L / M / S**. Масштабирует кнопки, часы, шрифты и отступы через `--ui-scale`; сетка и колонки не меняются | Локально: `lite_ui_scale` |
| **Громкость** `#settings-volume` | Диалог настроек | Switch показывает/скрывает блок громкости нижней строки `#volume-block-center` | Локально: `lite_show_volume_controls` |
| **Температура** `#settings-climate` | Диалог настроек | Switch показывает/скрывает только нижние температурные блоки. Карточки сидений водителя и пассажира не скрываются | Локально: `lite_show_climate_controls` |

---

## Плеер

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Mute / процент** `#btn-mute` | Нижний ряд, центр | Показывает текущий процент громкости. Нажатие включает/выключает mute; в mute процент перечёркнут. Восстановление громкости идёт через `VolumeManager` с echo-suppression | `getvol` / `setvol`, polling 1 с, событие `volumeChanged` |
| **Play / Pause** `#btn-play` | Плеер, центр | Переключает иконку play/pause и отправляет команду воспроизведения | `runEnum(TOKEN, "MEDIA_PLAY")` или `"MEDIA_PAUSE"`. Состояние также обновляется событием `musicInfo` |
| **Next** `#btn-next` | Плеер, справа | Следующий трек | `runEnum(TOKEN, "MEDIA_NEXT")` |

---

## Климат — водитель (`#driver-grid`)

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Подогрев сиденья** `#cl-seat-l` | Карточка водителя | Цикл уровней **0 → 1 → 2 → 3 → 0**. При включении сбрасывает вентиляцию `#cl-vent-l`. **Долгое нажатие 600 ms** — выключить (уровень 0) | `heat_seat_l_1` … `heat_seat_l_3`, выкл: `heat_seat_l_0` |
| **Обогрев руля** `#cl-wheel` | Карточка водителя | Цикл **0 ↔ 1** (вкл/выкл) | Вкл: `heat_wheel_on`, выкл: `heat_wheel_off` |
| **Вентиляция сиденья** `#cl-vent-l` | Карточка водителя | Цикл **0 → 1 → 2 → 3 → 0**. При включении сбрасывает подогрев `#cl-seat-l`. Долгое нажатие 600 ms — выкл | `vent_seat_l_1` … `vent_seat_l_3`, выкл: `vent_seat_l_0` |
| **Подогрев заднего левого сиденья** `#cl-rear-seat-l` | Вторая строка окна водительского сиденья | Цикл **0 → 1 → 2 → 3 → 0**, взаимоисключение с задней вентиляцией | `heat_zad_seat_l_1` … `heat_zad_seat_l_3`, выкл: `heat_zad_seat_l_0` |
| **Вентиляция заднего левого сиденья** `#cl-rear-vent-l` | Вторая строка окна водительского сиденья | Цикл **0 → 1 → 2 → 3 → 0**, взаимоисключение с задним подогревом | `vent_zad_seat_l_1` … `vent_zad_seat_l_3`, выкл: `vent_zad_seat_l_0` |
| **Память сиденья** `#cl-memory` (сегменты 1, 2, 3) | Карточка водителя | Выбор слота памяти водительского сиденья | `voditel_seat_1`, `voditel_seat_2`, `voditel_seat_3` |

---

## Климат — пассажир (`#passenger-grid`, `#passenger-vol`)

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Подогрев сиденья** `#cl-seat-r` | Карточка пассажира | Цикл **0 → 1 → 2 → 3 → 0**. Взаимоисключение с `#cl-vent-r`. Долгое нажатие 600 ms — выкл | `heat_seat_r_1` … `heat_seat_r_3`, выкл: `heat_seat_r_0` |
| **Вентиляция сиденья** `#cl-vent-r` | Карточка пассажира | Цикл **0 → 1 → 2 → 3 → 0**. Взаимоисключение с `#cl-seat-r`. Долгое нажатие 600 ms — выкл | `vent_seat_r_1` … `vent_seat_r_3`, выкл: `vent_seat_r_0` |
| **Подогрев заднего правого сиденья** `#cl-rear-seat-r` | Вторая строка окна пассажирского сиденья | Цикл **0 → 1 → 2 → 3 → 0**, взаимоисключение с задней вентиляцией | `heat_zad_seat_r_1` … `heat_zad_seat_r_3`, выкл: `heat_zad_seat_r_off` |
| **Вентиляция заднего правого сиденья** `#cl-rear-vent-r` | Вторая строка окна пассажирского сиденья | Цикл **0 → 1 → 2 → 3 → 0**, взаимоисключение с задним подогревом | `vent_zad_seat_r_1` … `vent_zad_seat_r_3`, выкл: `vent_zad_seat_r_off` |
| **Открыть шторку** `#btn-shutter-open` | Справа от сетки пассажира | Открывает системную шторку | `runEnum(TOKEN, "OPEN_SHTORKA")` |
| **Закрыть шторку** `#btn-shutter-close` | Справа от сетки пассажира | Закрывает системную шторку | `runEnum(TOKEN, "CLOSE_SHTORKA")` |

---

## Температура (`#temp-row`)

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Темп. водителя −** `#btn-driver-temp-down` | Нижний ряд, слева | −1° | `runEnum(TOKEN, "Driver_Temp_Down")` |
| **Темп. водителя +** `#btn-driver-temp-up` | Нижний ряд, слева | +1° | `runEnum(TOKEN, "Driver_Temp_Up")` |
| **Темп. пассажира −** `#btn-passenger-temp-down` | Нижний ряд, справа | −1° | `runEnum(TOKEN, "Passenger_Temp_Down")` |
| **Темп. пассажира +** `#btn-passenger-temp-up` | Нижний ряд, справа | +1° | `runEnum(TOKEN, "Passenger_Temp_Up")` |
| **Дисплеи** `#temp-driver-value`, `#temp-passenger-value` | Между кнопками ± | Текущие значения, опрос каждые 3 с | Сначала `getCarData(TOKEN, "all").heat.driverTemp/passengerTemp`; остальные запросы сохранены как совместимые запасные варианты |
| **Нижняя строка** `#dock-extra` | Под нижними карточками | Видна по умолчанию; отдельного раскрытия по часам нет | — |

---

## Мои приложения (`#my-grid`)

8 слотов (`.my-slot`, `data-slot="1"` … `"8"`). Данные слота: `localStorage` ключ `lite_my_N` → `{ pkg, name, icon }`.

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Слот с приложением** `.my-slot` (заполненный) | Центральная карточка «Мои приложения» | Запуск сохранённого приложения | `runApp(TOKEN, pkg)` |
| **Слот «Добавить»** `.my-slot` (пустой) | Та же карточка | Открывает шторку выбора приложения | `getUserApps(TOKEN)` при открытии шторки |
| **Долгое нажатие на слот** (700 ms) | Любой заполненный слот | Удаляет приложение из слота (`localStorage.removeItem`) | — |

---

## Шторка приложений (`#apps-drawer`)

| Кнопка / UI | Расположение | Действие | API / команда |
| --- | --- | --- | --- |
| **Закрыть** `#drawer-close` | Заголовок шторки | Закрывает шторку, сбрасывает `pickerSlot` | — |
| **Элемент списка** `.app-item` | `#apps-grid` | Если открыто из пустого слота — сохраняет приложение в `lite_my_{slot}`, обновляет сетку, закрывает шторку | `getUserApps(TOKEN)` (загрузка списка); сохранение локально; при запуске из слота — `runApp(TOKEN, package)` |

---

## Сводка runEnum по разделам

| Раздел | Команды |
| --- | --- |
| Плеер | `MEDIA_PLAY`, `MEDIA_PAUSE`, `MEDIA_NEXT`, `Volume_Up`, `Volume_Down` |
| Громкость | `getvol`, `setvol` (чтение и direct-управление; fallback — через `Volume_Up`/`Volume_Down`) |
| Водитель — сиденье | `heat_seat_l_0` … `heat_seat_l_3` |
| Водитель — руль | `heat_wheel_on`, `heat_wheel_off` |
| Водитель — вентиляция | `vent_seat_l_0` … `vent_seat_l_3` |
| Заднее левое сиденье | `heat_zad_seat_l_0` … `heat_zad_seat_l_3`, `vent_zad_seat_l_0` … `vent_zad_seat_l_3` |
| Водитель — память | `voditel_seat_1`, `voditel_seat_2`, `voditel_seat_3` |
| Пассажир — сиденье | `heat_seat_r_0` … `heat_seat_r_3` |
| Пассажир — вентиляция | `vent_seat_r_0` … `vent_seat_r_3` |
| Заднее правое сиденье | `heat_zad_seat_r_off`, `heat_zad_seat_r_1` … `heat_zad_seat_r_3`, `vent_zad_seat_r_off`, `vent_zad_seat_r_1` … `vent_zad_seat_r_3` |
| Температура | `Driver_Temp_Up`, `Driver_Temp_Down`, `Passenger_Temp_Up`, `Passenger_Temp_Down` |

---

## localStorage (настройки UI)

| Ключ | Назначение |
| --- | --- |
| `lite_theme_mode` | `dark` / `light` / `auto` |
| `lite_accent` | HEX цвет акцента |
| `lite_ui_scale` | `l` / `m` / `s` — масштаб интерфейса |
| `lite_show_volume_controls` | `true` / `false` — показывать блок громкости в нижней строке |
| `lite_show_climate_controls` | `true` / `false` — показывать нижние температурные блоки |
| `lite_my_1` … `lite_my_8` | Сохранённые приложения в слотах |
| `lite_temp_mock` | `"1"` — mock температур в браузере без API |
