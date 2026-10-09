import test from 'node:test';
import assert from 'node:assert/strict';
import { getPricingPreferences, applyPricingPreferences } from '../src/pricing-preferences.js';
import { createDefaultProject } from '../src/engine.js';
import { ensureDefaultBackMaterial } from '../src/material-defaults.js';

const stock = overrides => ({ id: 'hdf-back', name: 'My rear sheet', thickness: 3, sheetWidth: 2100, sheetHeight: 2800, type: 'Custom fibreboard', ...overrides });
const project = overrides => ({ name: 'Project', materials: [stock()], settings: {}, ...overrides });

test('rod metre and holder unit prices are reusable, accept zero and retain project-specific overrides', () => {
  const source=project({settings:{pricing:{rodPricePerMeter:100.25,rodHolderPrice:0}}});
  const preferences=getPricingPreferences(source);
  assert.deepEqual(preferences.rates,{rodPricePerMeter:100.25,rodHolderPrice:0});
  const target=project({settings:{pricing:{rodPricePerMeter:200}}});
  assert.deepEqual(applyPricingPreferences(target,preferences).settings.pricing,{rodPricePerMeter:200,rodHolderPrice:0});
});

test('a saved quote identifies its complete stock and cannot reprice a historical ID at another gauge', () => {
  const source = project({ materials: [stock({ pricePerSheet: 730 })] });
  const preferences = getPricingPreferences(source);
  assert.deepEqual(preferences, { materials: [{ id: 'hdf-back', thickness: 3, sheetWidth: 2100, sheetHeight: 2800, type: 'Custom fibreboard', pricePerSheet: 730 }], rates: {} });
  const target = project({ materials: [stock({ thickness: 8 })] });
  assert.equal(applyPricingPreferences(target, preferences).materials[0].pricePerSheet, undefined);
  assert.equal(applyPricingPreferences(project(), preferences).materials[0].pricePerSheet, 730);
});

test('changed sheet dimensions, material type, decor or ID prevent reuse while display names do not', () => {
  const preferences = getPricingPreferences(project({ materials: [stock({ decorCode: 'VT_068', pricePerSheet: 1234.56 })] }));
  for (const change of [{ id: 'another' }, { sheetWidth: 1220 }, { sheetHeight: 3000 }, { type: 'MDFLAM' }, { decorCode: 'VT_037' }, { decorCode: null }]) {
    const target = project({ materials: [stock({ decorCode: 'VT_068', ...change })] });
    assert.equal(applyPricingPreferences(target, preferences).materials[0].pricePerSheet, undefined);
  }
  const renamed = project({ materials: [stock({ decorCode: 'VT_068', name: 'Translation / custom name' })] });
  assert.equal(applyPricingPreferences(renamed, preferences).materials[0].pricePerSheet, 1234.56);
});

test('manual zero is reusable and existing project-specific material/rate quotes take precedence', () => {
  const preferences = getPricingPreferences(project({ materials: [stock({ pricePerSheet: 0 })], settings: { pricing: { handlePrice: 0, guideSetPrice: 50, hingePrice: 10, edgeBandPricePerMeter: 0 } } }));
  const target = project({ settings: { pricing: { handlePrice: 17, hingePrice: 0 } } });
  const result = applyPricingPreferences(target, preferences);
  assert.equal(result.materials[0].pricePerSheet, 0);
  assert.deepEqual(result.settings.pricing, { handlePrice: 17, hingePrice: 0, guideSetPrice: 50, edgeBandPricePerMeter: 0 });
  const own = project({ materials: [stock({ pricePerSheet: 200 })] });
  assert.equal(applyPricingPreferences(own, preferences).materials[0].pricePerSheet, 200);
  const ownZero = project({ materials: [stock({ pricePerSheet: 0 })] });
  const positivePreference = { ...preferences, materials: [{ ...preferences.materials[0], pricePerSheet: 999 }] };
  assert.equal(applyPricingPreferences(ownZero, positivePreference).materials[0].pricePerSheet, 0);
});

test('missing, invalid and historical unqualified preferences are ignored, including prototype-inherited rates', () => {
  const target = project(), before = structuredClone(target);
  for (const preferences of [null, {}, { materials: { 'hdf-back': 730 } }, { materials: [ { id: 'hdf-back', pricePerSheet: 730 } ] }, { materials: [stock({ pricePerSheet: -1 })] }, { materials: [stock({ pricePerSheet: NaN })] }, { materials: [stock({ pricePerSheet: Infinity })] }, { materials: [stock({ pricePerSheet: 1e9 + 1 })] }, { materials: [stock({ pricePerSheet: '730' })] }, { materials: [stock({ sheetWidth: '2100', pricePerSheet: 730 })] }]) {
    assert.deepEqual(applyPricingPreferences(target, preferences), target);
  }
  const rates = JSON.parse('{"handlePrice":0,"guideSetPrice":-1,"hingePrice":"5","edgeBandPricePerMeter":1000000001,"unknown":50,"__proto__":{"polluted":true}}');
  assert.deepEqual(applyPricingPreferences(target, { rates }).settings.pricing, { handlePrice: 0 });
  assert.equal({}.polluted, undefined);
  const inherited = Object.create({ hingePrice: 100 });
  assert.deepEqual(applyPricingPreferences(target, { rates: inherited }), target);
  const inheritedPreferences = Object.create({ materials: [stock({ pricePerSheet: 730 })], rates: { handlePrice: 50 } });
  assert.deepEqual(applyPricingPreferences(target, inheritedPreferences), target);
  assert.deepEqual(target, before);
});

test('export filters invalid manual values, normalizes an absent decor and both operations remain immutable', () => {
  const source = project({ materials: [stock({ decorCode: null, pricePerSheet: 0 }), stock({ id: 'bad', pricePerSheet: -1 })], settings: { pricing: { handlePrice: 0, guideSetPrice: 1e9, hingePrice: Infinity, edgeBandPricePerMeter: '5', arbitrary: 4 } } });
  const original = structuredClone(source), preferences = getPricingPreferences(source);
  assert.equal(preferences.materials.length, 1); assert.equal(Object.hasOwn(preferences.materials[0], 'decorCode'), false);
  assert.deepEqual(preferences.rates, { handlePrice: 0, guideSetPrice: 1e9 });
  const saved = structuredClone(preferences), target = project(), before = structuredClone(target);
  const result = applyPricingPreferences(target, preferences);
  assert.equal(result.materials[0].pricePerSheet, 0);
  assert.deepEqual(source, original); assert.deepEqual(target, before); assert.deepEqual(preferences, saved);
  result.materials[0].name = 'Detached'; result.settings.pricing.handlePrice = 1;
  preferences.materials[0].type = 'Detached preference';
  assert.deepEqual(source, original); assert.deepEqual(target, before);
});

test('localized built-in thin, matt and gloss stock reuses quotes across creation languages', () => {
  const source = createDefaultProject('ru');
  const prices = new Map([['thin-back-3', 0], ['yildiz-matt-white-18', 1200], ['yildiz-gloss-white-18', 1500]]);
  for (const material of source.materials) if (prices.has(material.id)) material.pricePerSheet = prices.get(material.id);
  const original = structuredClone(source), preferences = getPricingPreferences(source);
  for (const language of ['tr', 'en']) {
    const target = createDefaultProject(language), before = structuredClone(target);
    const result = applyPricingPreferences(target, preferences);
    for (const [id, price] of prices) {
      const material = result.materials.find(item => item.id === id);
      assert.equal(material.pricePerSheet, price);
      assert.equal(material.type, target.materials.find(item => item.id === id).type, 'stored prices never change the display language');
    }
    assert.deepEqual(target, before);
    assert.deepEqual(getPricingPreferences(result), preferences, 'export stores a stable qualified type');
  }
  // Preferences already saved with localized human labels also remain usable.
  const localized = createDefaultProject('tr');
  const oldPreferences = { materials: localized.materials.filter(material => prices.has(material.id)).map(material => ({ ...material, pricePerSheet: prices.get(material.id) })), rates: {} };
  const result = applyPricingPreferences(createDefaultProject('en'), oldPreferences);
  for (const [id, price] of prices) assert.equal(result.materials.find(material => material.id === id).pricePerSheet, price);
  assert.deepEqual(source, original);
});

test('built-in type aliases never match particleboard or an unrecognized custom type', () => {
  const source = createDefaultProject('ru');
  const quoted = source.materials.filter(material => material.id === 'thin-back-3' || ['MAT_068', 'HG_068'].includes(material.decorCode));
  for (const material of quoted) material.pricePerSheet = 900;
  const preferences = getPricingPreferences(source);
  for (const type of ['Particleboard', 'My custom MDF finish']) {
    const target = createDefaultProject('tr');
    for (const material of target.materials) if (quoted.some(item => item.id === material.id)) material.type = type;
    const result = applyPricingPreferences(target, preferences);
    for (const material of result.materials.filter(material => quoted.some(item => item.id === material.id))) assert.equal(material.pricePerSheet, undefined);
  }
  const wrongDecor = createDefaultProject('en');
  const matt = wrongDecor.materials.find(material => material.decorCode === 'MAT_068');
  matt.decorCode = 'CUSTOM_MATT';
  assert.equal(applyPricingPreferences(wrongDecor, preferences).materials.find(material => material.id === matt.id).pricePerSheet, undefined);
});

test('default hardboard variants reuse exact quotes across languages, including manual zero and historical localized preferences', () => {
  const conflicted = (language, numbered) => {
    const value = createDefaultProject(language), custom = value.materials.find(material => material.id === 'thin-back-3');
    custom.type = 'MDF';
    if (numbered) value.materials.push({ ...custom, id: 'thin-back-3-default' });
    const back = ensureDefaultBackMaterial(value);
    return { value, back };
  };
  for (const [numbered, price] of [[false, 0], [true, 850.5]]) {
    const { value: source, back } = conflicted('ru', numbered);
    back.pricePerSheet = price;
    const snapshot = structuredClone(source), preferences = getPricingPreferences(source);
    assert.equal(back.id, numbered ? 'thin-back-3-default-2' : 'thin-back-3-default');
    for (const language of ['tr', 'en']) {
      const { value: target, back: targetBack } = conflicted(language, numbered), before = structuredClone(target);
      const result = applyPricingPreferences(target, preferences);
      assert.equal(result.materials.find(material => material.id === back.id).pricePerSheet, price);
      assert.equal(result.materials.find(material => material.id === back.id).type, targetBack.type);
      assert.equal(result.materials.find(material => material.id === 'thin-back-3').pricePerSheet, undefined);
      assert.deepEqual(getPricingPreferences(result), preferences);
      const localizedPreferences = { materials: [{ ...targetBack, pricePerSheet: price }], rates: {} };
      const { value: localizedTarget } = conflicted('ru', numbered);
      assert.equal(applyPricingPreferences(localizedTarget, localizedPreferences).materials.find(material => material.id === back.id).pricePerSheet, price);
      assert.deepEqual(target, before);
    }
    assert.deepEqual(source, snapshot);
    for (const overrides of [{ type: 'Particleboard' }, { type: 'My fibreboard' }, { thickness: 8 }, { sheetWidth: 1220 }]) {
      const { value: target, back: targetBack } = conflicted('tr', numbered);
      Object.assign(targetBack, overrides);
      assert.equal(applyPricingPreferences(target, preferences).materials.find(material => material.id === back.id).pricePerSheet, undefined);
    }
  }
});
