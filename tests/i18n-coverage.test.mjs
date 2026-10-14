import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARY, t, LANGUAGES, translateText } from '../src/i18n.js';
import { translatePrintText } from '../src/print-i18n.js';

test('i18n DICTIONARY exports all supported languages with strict key parity', () => {
  assert.ok(DICTIONARY, 'DICTIONARY must be exported');
  assert.deepEqual(Object.keys(DICTIONARY).sort(), ['en', 'ru', 'tr'].sort());

  const ruKeys = Object.keys(DICTIONARY.ru).sort();
  const trKeys = Object.keys(DICTIONARY.tr).sort();
  const enKeys = Object.keys(DICTIONARY.en).sort();

  assert.ok(ruKeys.length >= 8, 'DICTIONARY.ru should have comprehensive keys');
  assert.deepEqual(trKeys, ruKeys, 'Turkish dictionary must have exact key parity with Russian dictionary');
  assert.deepEqual(enKeys, ruKeys, 'English dictionary must have exact key parity with Russian dictionary');
});

test('i18n DICTIONARY contains zero Cyrillic characters in Turkish and English dictionaries', () => {
  const cyrillicRegex = /[А-Яа-яЁё]/u;

  for (const [key, value] of Object.entries(DICTIONARY.tr)) {
    assert.equal(typeof value, 'string', `DICTIONARY.tr[${key}] must be a string`);
    assert.doesNotMatch(
      value,
      cyrillicRegex,
      `DICTIONARY.tr[${key}] contains Cyrillic characters: "${value}"`
    );
  }

  for (const [key, value] of Object.entries(DICTIONARY.en)) {
    assert.equal(typeof value, 'string', `DICTIONARY.en[${key}] must be a string`);
    assert.doesNotMatch(
      value,
      cyrillicRegex,
      `DICTIONARY.en[${key}] contains Cyrillic characters: "${value}"`
    );
  }
});

test('i18n DICTIONARY includes all required Milestone 4 DRC and tool keys with expected translations', () => {
  const required = [
    {
      key: 'work_triangle_bounds',
      ru: 'Нарушены пропорции рабочего треугольника',
      tr: 'Çalışma üçgeni oranları standarda uygun değil',
      en: 'Kitchen work triangle proportions violate guidelines'
    },
    {
      key: 'aisle_clearance_too_narrow',
      ru: 'Слишком узкий проход между шкафами',
      tr: 'Dolaplar arasındaki geçiş koridoru çok dar',
      en: 'Walkway aisle corridor between cabinets is too narrow'
    },
    {
      key: 'cooktop_hood_clearance',
      ru: 'Недостаточный зазор между плитой и вытяжкой',
      tr: 'Ocak ve davlumbaz arasında yetersiz dikey mesafe',
      en: 'Insufficient vertical clearance between cooktop and hood'
    },
    {
      key: 'corner_filler_clearance',
      ru: 'Угловой зазор фасадов меньше нормы',
      tr: 'Köşe cephe boşluğu normun altında',
      en: 'Corner facade clearance below recommended minimum'
    },
    {
      key: 'tool_measure',
      ru: 'Рулетка',
      tr: 'Mezura',
      en: 'Tape Measure'
    },
    {
      key: 'measure_dist',
      ru: 'Расстояние',
      tr: 'Mesafe',
      en: 'Distance'
    },
    {
      key: 'obstacle_pillar',
      ru: 'Колонна / пилон',
      tr: 'Kolon / Sütun',
      en: 'Column / Pillar'
    },
    {
      key: 'obstacle_column',
      ru: 'Колонна',
      tr: 'Sütun',
      en: 'Column'
    }
  ];

  for (const item of required) {
    assert.equal(DICTIONARY.ru[item.key], item.ru, `Key ${item.key} ru mismatch`);
    assert.equal(DICTIONARY.tr[item.key], item.tr, `Key ${item.key} tr mismatch`);
    assert.equal(DICTIONARY.en[item.key], item.en, `Key ${item.key} en mismatch`);

    assert.equal(t(item.key, 'ru'), item.ru, `t(${item.key}, 'ru') mismatch`);
    assert.equal(t(item.key, 'tr'), item.tr, `t(${item.key}, 'tr') mismatch`);
    assert.equal(t(item.key, 'en'), item.en, `t(${item.key}, 'en') mismatch`);
  }
});

test('t() helper handles fallbacks and unknown keys cleanly', () => {
  assert.equal(t('tool_measure'), 'Рулетка');
  assert.equal(t('tool_measure', 'tr'), 'Mezura');
  assert.equal(t('tool_measure', 'en'), 'Tape Measure');
  assert.equal(t('unknown_key_xyz', 'tr'), 'unknown_key_xyz');
  assert.equal(t('tool_measure', 'invalid_lang'), 'Рулетка');
});

test('translateText localizes runtime DRC and tool phrases without Cyrillic in tr and en', () => {
  const phrases = [
    'Рулетка',
    'Расстояние',
    'Колонна / пилон',
    'Колонна',
    'Уменьшить ширину шкафа',
    'Подогнать нишу под технику',
    'Убрать полки под мойкой',
    'Разделить перегородкой',
    'Режим рулетки включён',
    'ЛКМ — вращение · ПКМ — сдвиг · Двойной клик / F — фокус на шкаф · W,A,S,D — полёт'
  ];

  for (const phrase of phrases) {
    for (const lang of ['tr', 'en']) {
      const translated = translateText(phrase, lang);
      assert.doesNotMatch(
        translated,
        /[А-Яа-яЁё]/u,
        `translateText("${phrase}", "${lang}") leaked Cyrillic: "${translated}"`
      );
    }
  }
});

test('translatePrintText localizes stretchers, obstacles, and countertops in print documents', () => {
  const terms = [
    { ru: 'Царга передняя', tr: 'Ön üst kuşak', en: 'Front stretcher' },
    { ru: 'Царга задняя', tr: 'Arka üst kuşak', en: 'Rear stretcher' },
    { ru: 'Колонна / пилон', tr: 'Kolon / Sütun', en: 'Column / Pillar' },
    { ru: 'Колонна', tr: 'Sütun', en: 'Column' },
    { ru: 'Столешница (погонные метры)', tr: 'Tezgah (tül metre)', en: 'Countertop (linear meters)' },
    { ru: 'Палитра материалов', tr: 'Malzeme paleti', en: 'Materials palette' },
    { ru: 'Спецификация шкафов', tr: 'Dolap listesi', en: 'Cabinet specification' }
  ];

  for (const { ru, tr, en } of terms) {
    assert.equal(translatePrintText(ru, 'tr'), tr, `translatePrintText("${ru}", "tr") mismatch`);
    assert.equal(translatePrintText(ru, 'en'), en, `translatePrintText("${ru}", "en") mismatch`);
  }
});
