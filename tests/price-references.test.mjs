import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICING_SNAPSHOT, MATERIAL_PRICE_REFERENCES, HARDWARE_PRICE_REFERENCES } from '../src/price-references.js';

test('material references retain exact quoted sheet areas and do not invent a missing thickness', () => {
  assert.equal(PRICING_SNAPSHOT.date, '2026-10-09');
  assert.equal(PRICING_SNAPSHOT.currency, 'TRY');
  const panel = MATERIAL_PRICE_REFERENCES.find(reference => reference.type === 'mdflam' && reference.thickness === 18);
  assert.deepEqual(panel.samples.map(sample => sample.price), [2715, 3255, 3450]);
  assert.ok(panel.samples.every(sample => sample.areaSquareMeters === 5.88 && sample.includesVat === true));
  assert.ok(Math.abs(panel.pricePerSquareMeter * 5.88 - 3140) < 1e-9);
  assert.equal(MATERIAL_PRICE_REFERENCES.some(reference => reference.type === 'mdflam' && reference.thickness === 25), false);
  for (const type of ['front-matt', 'front-gloss']) {
    const reference = MATERIAL_PRICE_REFERENCES.find(item => item.type === type);
    assert.equal(reference.samples[0].areaSquareMeters, 3.416);
    assert.ok(Math.abs(reference.pricePerSquareMeter * 3.416 - 2450) < 1e-9);
  }
  const thin = MATERIAL_PRICE_REFERENCES.find(item => item.type === 'thin-back');
  assert.equal(thin.thickness, 3);
  assert.equal(thin.samples[0].price, 730);
  assert.doesNotMatch(thin.id + thin.label, /yıldız|yildiz|hdf|suntalam/iu);
});

test('guide rates use a pair, hinge quotes disclose pack limitations and edge VAT is normalized explicitly', () => {
  const guides = HARDWARE_PRICE_REFERENCES.guideSetPrice;
  assert.equal(guides.price, 267.41);
  assert.ok(guides.samples.every(sample => /1 çift/u.test(sample.label) && sample.includesVat === true));
  assert.match(HARDWARE_PRICE_REFERENCES.hingePrice.samples[0].label, /taban.+kutu\/koli/u);
  const edges = HARDWARE_PRICE_REFERENCES.edgeBandPricePerMeter;
  assert.ok(Math.abs(edges.price - 6.156) < 1e-12);
  assert.deepEqual(edges.samples.map(sample => [sample.price, sample.includesVat, sample.vatRate]), [[4.2, false, 0.2], [6.06, false, 0.2]]);
  assert.ok(edges.samples.every(sample => /150 m\/top/u.test(sample.label)));
  for (const reference of [...MATERIAL_PRICE_REFERENCES, ...Object.values(HARDWARE_PRICE_REFERENCES)]) {
    for (const sample of reference.samples) {
      assert.ok(Number.isFinite(sample.price) && sample.price > 0);
      assert.equal(sample.date, PRICING_SNAPSHOT.date);
      assert.equal(new URL(sample.url).protocol, 'https:');
    }
  }
});
