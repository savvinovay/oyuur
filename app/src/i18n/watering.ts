// Texts of the watering time (OYUUR-34, design/oyuur-33/спец.md, 1.3, 2, 4, 5.3, 5.4): the
// choice sheet, the planting row, the forest card and a friend's trees. Merged into the main
// dictionaries in index.ts. Keys must not repeat keys of other dictionary files (a test checks).
// `{time}` is always a ready hour ("18:00" / "6:00 PM", ui/watering/format.ts). A number keeps to its
// unit and "с" to its hour (no-break spaces,  ): "3 / ч" never splits over two lines.

export const wateringEn = {
  /** "from 6:00 PM": the hour of a choice, a chip, "tomorrow — …". */
  wtFrom: 'from {time}',
  wtAnyTime: 'any time',
  /** The planting row and other places that name the choice with its part of the day. */
  wtLabelMorning: 'in the morning, from {time}',
  wtLabelDay: 'in the afternoon, from {time}',
  wtLabelEvening: 'in the evening, from {time}',
  wtLabelLate: 'late, from {time}',
  /** "in 42 min", "in 3 h 20 min". */
  wtMin: '{m} min',
  wtHours: '{h} h',
  wtHoursMin: '{h} h {m} min',

  // ---- The sheet ----
  wtTitle: 'When to water',
  wtLead: 'From what hour the tree can be watered',
  wtOptAny: 'Any time',
  wtOptMorning: 'Morning',
  wtOptDay: 'Afternoon',
  wtOptEvening: 'Evening',
  wtOptLate: 'Late',
  wtOther: 'Other time…',
  wtOtherTitle: 'Other time',
  wtWheelNote: 'Whole hours only: from {from} to {to}',
  /** The mark by the hour that holds today (changing a growing tree's time). */
  wtTodayTag: 'today',
  wtChangeNote: 'The new time starts tomorrow.',
  /** {when}: "from 6:00 PM" or "any time". */
  wtChangeToday: 'Today — {when}',
  wtQuitHint: 'For “I quit it” people usually pick the evening: in the morning the day is still ahead',
  wtDone: 'Done',
  wtHourA11y: 'From {time}',
  wtPickA11y: 'Choose: from {time}',

  // ---- Planting ----
  wtRowLead: 'Water:',
  wtPlantNote: 'Planting day: you can water it right away',

  // ---- The forest's card ----
  wtChipFrom: 'Watering from {time}',
  wtChipAny: 'Watering any time',
  /** {when}: "from 12:00 PM" or "any time". */
  wtTomorrow: 'tomorrow — {when}',
  /** The card's status until the watering hour: "{wait} · 24 days". */
  wtWaitLine: '{wait} · {days}',
  wtWaitMorning: 'Waits for the morning',
  wtWaitDay: 'Waits for lunchtime',
  wtWaitEvening: 'Waits for the evening',
  wtWaitNight: 'Waits for the night',
  /** An hour from the wheel: "Waits for 3 PM". */
  wtWaitHour: 'Waits for {time}',
  wtWaterFrom: 'Water from {time}',
  wtEarly: 'Too early: in {time}',
  wtChangeTime: 'Change time',
  /** {when}: "from 12:00 PM" or "any time". */
  wtSaved: 'Done. From tomorrow — {when}',
  wtKept: 'Watering time stays: {when}',
  wtMenu: 'Watering time',
  /** Under the chip on the planting day: the chosen hour starts tomorrow. */
  wtPlantDayNote: 'today — any time: planting day',
};

export const wateringRu: typeof wateringEn = {
  wtFrom: 'с {time}',
  wtAnyTime: 'в любое время',
  wtLabelMorning: 'утром, с {time}',
  wtLabelDay: 'днём, с {time}',
  wtLabelEvening: 'вечером, с {time}',
  wtLabelLate: 'поздно, с {time}',
  wtMin: '{m} мин',
  wtHours: '{h} ч',
  wtHoursMin: '{h} ч {m} мин',

  wtTitle: 'Когда поливать',
  wtLead: 'С какого часа дерево можно полить',
  wtOptAny: 'В любое время',
  wtOptMorning: 'Утром',
  wtOptDay: 'Днём',
  wtOptEvening: 'Вечером',
  wtOptLate: 'Поздно',
  wtOther: 'Другое время…',
  wtOtherTitle: 'Другое время',
  wtWheelNote: 'Только целые часы: с {from} до {to}',
  wtTodayTag: 'сегодня',
  wtChangeNote: 'Новое время — с завтра.',
  wtChangeToday: 'Сегодня — {when}',
  wtQuitHint: 'Для «Бросаю» чаще выбирают вечер: утром день ещё впереди',
  wtDone: 'Готово',
  wtHourA11y: 'С {time}',
  wtPickA11y: 'Выбрать: с {time}',

  wtRowLead: 'Поливать:',
  wtPlantNote: 'Сегодня — день посадки, можно полить сразу',

  wtChipFrom: 'Полив с {time}',
  wtChipAny: 'Полив в любое время',
  wtTomorrow: 'завтра — {when}',
  wtWaitLine: '{wait} · {days}',
  wtWaitMorning: 'Ждёт утра',
  wtWaitDay: 'Ждёт обеда',
  wtWaitEvening: 'Ждёт вечера',
  wtWaitNight: 'Ждёт ночи',
  wtWaitHour: 'Ждёт {time}',
  wtWaterFrom: 'Полить с {time}',
  wtEarly: 'Рано: можно через {time}',
  wtChangeTime: 'Сменить время',
  wtSaved: 'Готово. С завтра — {when}',
  wtKept: 'Время полива прежнее: {when}',
  wtMenu: 'Время полива',
  wtPlantDayNote: 'сегодня — в любое время: день посадки',
};
