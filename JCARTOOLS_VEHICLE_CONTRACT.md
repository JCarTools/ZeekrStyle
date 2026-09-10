# Контракт JCarTools этой машины

Источник: фотографии фактических ответов автомобиля от 09.09.2026:
`20260909_234518.jpg`, `20260909_234527.jpg`, `20260909_234537.jpg`, `20260909_234544.jpg`.

Этот файл является приоритетным справочником для Zeekr style by Hudson. Данные сняты непосредственно с машины вызовами `getRunEnum()` и `getCarData("all")`.

## getRunEnum()

Всего машина вернула 74 команды:

1. `GO_TO_PP`
2. `RUN_BLACK`
3. `OPEN_SHTORKA`
4. `CLOSE_SHTORKA`
5. `VIBOR_VODITEL`
6. `GO_TO_GU`
7. `RUN_START_APP_MENU`
8. `GLOBAL_BACK`
9. `GLOBAL_HOME`
10. `TOGGLE_GU_PP`
11. `RUN_FUN_CAR`
12. `TOGGLE_GU_PP_CPP`
13. `GO_CPP_TO_PP`
14. `TOGGLE_CPP_PP`
15. `MEDIA_PLAY`
16. `MEDIA_PAUSE`
17. `MEDIA_NEXT`
18. `MEDIA_BLACK`
19. `VIEW_ALL_MESSAGE`
20. `b_fiksik_on`
21. `b_fiksik_off`
22. `heat_seat_l_0`
23. `heat_seat_l_1`
24. `heat_seat_l_2`
25. `heat_seat_l_3`
26. `vent_seat_l_0`
27. `vent_seat_l_1`
28. `vent_seat_l_2`
29. `vent_seat_l_3`
30. `heat_seat_r_0`
31. `heat_seat_r_1`
32. `heat_seat_r_2`
33. `heat_seat_r_3`
34. `vent_seat_r_0`
35. `vent_seat_r_1`
36. `vent_seat_r_2`
37. `vent_seat_r_3`
38. `heat_wheel_on`
39. `heat_wheel_off`
40. `heat_windshield_on`
41. `heat_windshield_off`
42. `heat_rearwindow_on`
43. `heat_rearwindow_off`
44. `heat_zad_seat_l_0`
45. `heat_zad_seat_l_1`
46. `heat_zad_seat_l_2`
47. `heat_zad_seat_l_3`
48. `heat_zad_seat_r_off`
49. `heat_zad_seat_r_1`
50. `heat_zad_seat_r_2`
51. `heat_zad_seat_r_3`
52. `voditel_seat_1`
53. `voditel_seat_2`
54. `voditel_seat_3`
55. `SPLIT_RUN`
56. `RUN_APP_MORE`
57. `RUN_SPICH_FOCUS`
58. `Recirculation_On`
59. `Recirculation_Off`
60. `Volume_Down`
61. `Volume_Up`
62. `Driver_Temp_Down`
63. `Driver_Temp_Up`
64. `Passenger_Temp_Down`
65. `Passenger_Temp_Up`
66. `vent_zad_seat_l_0`
67. `vent_zad_seat_l_1`
68. `vent_zad_seat_l_2`
69. `vent_zad_seat_l_3`
70. `vent_zad_seat_r_off`
71. `vent_zad_seat_r_1`
72. `vent_zad_seat_r_2`
73. `vent_zad_seat_r_3`
74. `RECENT_TASK_MANAGER`

Важно: у заднего левого сиденья выключение оканчивается на `_0`, а у заднего правого — на `_off`. Это относится и к подогреву, и к вентиляции.

## getCarData("all")

Зафиксированная структура ответа:

```json
{
  "name": "all",
  "vehicle": {
    "name": "vehicle",
    "speed": 0,
    "rpm": 0,
    "engine": true,
    "outTemp": 17,
    "batteryVoltage": 14.80000190734863,
    "fuelPercent": 51,
    "fuelPercentRaw": 51,
    "vod": 1,
    "sun": true,
    "park": false
  },
  "heat": {
    "name": "heat",
    "rulHeat": false,
    "lobHeat": false,
    "zadHeat": false,
    "driverTemp": 20,
    "passengerTemp": 20
  },
  "seats": {
    "name": "seats",
    "front": {
      "name": "frontSeats",
      "frontLeft": {
        "seat": 1,
        "heat": 2,
        "vent": 1
      },
      "frontRight": {
        "seat": 2,
        "heat": 1,
        "vent": 1
      }
    },
    "rear": {
      "name": "rearSeats",
      "rearLeft": {
        "seat": 0,
        "heat": 1,
        "vent": 1
      },
      "rearRight": {
        "seat": 1,
        "heat": 1,
        "vent": 1
      }
    }
  }
}
```

## Правила обработки

- `seats.*.heat` и `seats.*.vent`: значение `1` означает выключено; `2`, `3`, `4` означают уровни интерфейса `1`, `2`, `3`.
- Поле `seat` не является уровнем подогрева или вентиляции. Зафиксированы значения `0`, `1`, `2`; его назначение нужно рассматривать отдельно (состояние/занятость сиденья).
- `heat.rulHeat` — обогрев руля.
- `heat.lobHeat` — обогрев лобового стекла.
- `heat.zadHeat` — обогрев заднего стекла.
- `heat.driverTemp` и `heat.passengerTemp` — температуры водителя и пассажира.
- `vehicle.outTemp` — наружная температура.
- Для первичного состояния климата и сидений нужно сначала читать один полный ответ `getCarData(TOKEN, "all")`; частичные и асинхронные запросы используются только как запасные варианты совместимости.

По зафиксированному примеру включён только передний левый подогрев на уровне 1 (`heat: 2`). Остальные показанные подогревы и вентиляции выключены (`1`).
