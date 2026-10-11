import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateRoomPresentationHTML } from '../src/room-presentation.js';
import { getDocumentInfo } from '../src/print-document.js';

const sampleProject = () => {
  const project = createDefaultProject();
  project.name = 'Luxury Apartment Suite';
  project.room = {
    ...project.room,
    width: 4500,
    depth: 3600,
    height: 2850,
    outline: [
      { x: 0, z: 0 },
      { x: 4500, z: 0 },
      { x: 4500, z: 3600 },
      { x: 0, z: 3600 }
    ],
    windows: [
      { id: 'w1', wallIndex: 0, offset: 1200, width: 1400, height: 1600, sill: 850 },
      { id: 'd1', kind: 'door', wallIndex: 3, offset: 800, width: 900, height: 2100, sill: 0 }
    ]
  };
  return project;
};

test('generateRoomPresentationHTML produces valid, multi-page HTML with all required sections', () => {
  const project = sampleProject();
  const html = generateRoomPresentationHTML(project, { language: 'en' });
  const info = getDocumentInfo(project);

  // Valid HTML document wrapper
  assert.match(html, /^<!doctype html>\s*<html\s+lang="en">/i);
  assert.match(html, /<\/html>$/);
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /<meta name="viewport"/);

  // CSS print styling rule mandated by requirements
  assert.match(html, /@media\s+print\s*\{[\s\S]*\.page\s*\{[^}]*break-after:\s*page;[^}]*page-break-after:\s*always;/);

  // All 4 required pages
  assert.match(html, /class="page page-1 cover-page"/);
  assert.match(html, /class="page page-2 layout-page"/);
  assert.match(html, /class="page page-3 specs-page"/);
  assert.match(html, /class="page page-4 cost-page"/);

  // Page 1: Cover & Project Overview
  assert.ok(html.includes(project.name));
  assert.ok(html.includes(info.id));
  assert.ok(html.includes(info.date));
  assert.match(html, /4[,.]?500\s*×\s*3[,.]?600\s*×\s*2[,.]?850/); // Room dimensions
  assert.match(html, /16[,.]2/); // Floor area (4.5 * 3.6 = 16.2 m²)
  assert.match(html, /Wall Count|Duvar Sayısı|Количество стен/);
  assert.match(html, /Total Cabinets|Toplam Dolap|Всего шкафов/);
  assert.match(html, /Total Parts|Toplam Parça|Всего деталей/);

  // Page 2: 2D Floor Plan & Layout
  assert.match(html, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/); // Embedded floor plan
  assert.match(html, /Walls Schedule|Duvar Listesi|Ведомость стен/);
  assert.match(html, /Openings Schedule|Açıklık Listesi|Ведомость проёмов/);
  assert.match(html, />S1</); // Wall S1
  assert.match(html, />W1<|>D1</); // Openings

  // Page 3: Furniture & Material Specifications
  assert.match(html, /Cabinet Schedule|Dolap Listesi|Ведомость шкафов/);
  assert.match(html, />C1</); // Cabinet C1
  assert.match(html, /Materials &amp; Decors Palette|Materials & Decors Palette|Malzeme ve Dekor Paleti|Палитра материалов/);
  assert.match(html, /class="color-swatch-box"/); // Color swatch
  assert.match(html, />VT_068<|>YT_10E</); // Decor code
  assert.match(html, /Yıldız Entegre/); // Manufacturer

  // Page 4: Commercial Cost & Hardware Summary
  assert.match(html, /Commercial Cost &amp; Hardware Summary|Commercial Cost & Hardware Summary|Maliyet ve Donanım Özeti|Коммерческая смета/);
  assert.match(html, /Total Sheets|Toplam Plaka|Всего плит/);
  assert.match(html, /Edge Banding|Kenar Bandı|Длина кромки/);
  assert.match(html, /Hinges|Menteşeler|Петли/);
  assert.match(html, /Drawer Slides|Çekmece Rayları|Направляющие ящиков/);
  assert.match(html, /Handles|Kulplar|Ручки/);
  assert.match(html, /Fasteners|Bağlantı Elemanları|Крепёж/);
  assert.match(html, /Cost Breakdown|Maliyet Tablosu|Детализация сметы/);
  assert.match(html, /₺/); // Currency
});

test('localization supports ru, tr, and en with ZERO untranslated Russian in tr and en', () => {
  const project = sampleProject();

  // Test Turkish (tr)
  const htmlTr = generateRoomPresentationHTML(project, { language: 'tr' });
  assert.match(htmlTr, /<html lang="tr">/);
  assert.match(htmlTr, /Müşteri Sunum Kitapçığı/);
  assert.match(htmlTr, /2B Kat Planı ve Yerleşim/);
  assert.match(htmlTr, /Dolap Listesi/);
  assert.match(htmlTr, /Maliyet ve Donanım Özeti/);
  assert.match(htmlTr, /Genel Toplam|Hesaplanan Tutar/);
  // Verify NO Cyrillic text appears in Turkish export
  assert.equal(/[а-яА-ЯёЁ]/u.test(htmlTr), false, 'Turkish HTML contains unexpected Cyrillic characters');

  // Test English (en)
  const htmlEn = generateRoomPresentationHTML(project, { language: 'en' });
  assert.match(htmlEn, /<html lang="en">/);
  assert.match(htmlEn, /Client Presentation Booklet/);
  assert.match(htmlEn, /2D Floor Plan &amp; Layout|2D Floor Plan & Layout/);
  assert.match(htmlEn, /Cabinet Schedule/);
  assert.match(htmlEn, /Commercial Cost &amp; Hardware Summary|Commercial Cost & Hardware Summary/);
  assert.match(htmlEn, /Grand Total|Subtotal/);
  // Verify NO Cyrillic text appears in English export
  assert.equal(/[а-яА-ЯёЁ]/u.test(htmlEn), false, 'English HTML contains unexpected Cyrillic characters');

  // Test Russian (ru)
  const htmlRu = generateRoomPresentationHTML(project, { language: 'ru' });
  assert.match(htmlRu, /<html lang="ru">/);
  assert.match(htmlRu, /Презентационный буклет проекта/);
  assert.match(htmlRu, /2D-план помещения и расстановка/);
  assert.match(htmlRu, /Ведомость шкафов/);
  assert.match(htmlRu, /Коммерческая смета и фурнитура/);
  assert.equal(/[а-яА-ЯёЁ]/u.test(htmlRu), true, 'Russian HTML should contain Cyrillic characters');
});

test('snapshot embedding renders image when URL is passed and placeholder when null', () => {
  const project = sampleProject();

  // 1. Data URL snapshot
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const htmlWithData = generateRoomPresentationHTML(project, { snapshot: dataUrl });
  assert.ok(htmlWithData.includes('<img class="snapshot-image"'));
  assert.ok(htmlWithData.includes(dataUrl));
  assert.ok(!htmlWithData.includes('class="snapshot-card snapshot-placeholder"'));

  // 2. Regular HTTP URL snapshot
  const httpUrl = 'https://example.com/renders/room-perspective-view.jpg';
  const htmlWithHttp = generateRoomPresentationHTML(project, { snapshot: httpUrl });
  assert.ok(htmlWithHttp.includes('<img class="snapshot-image"'));
  assert.ok(htmlWithHttp.includes(httpUrl));
  assert.ok(!htmlWithHttp.includes('class="snapshot-card snapshot-placeholder"'));

  // 3. Null / omitted snapshot -> clean placeholder badge
  const htmlNull = generateRoomPresentationHTML(project, { snapshot: null });
  assert.ok(!htmlNull.includes('<img class="snapshot-image"'));
  assert.ok(htmlNull.includes('class="snapshot-card snapshot-placeholder"'));
  assert.match(htmlNull, /svg viewBox="0 0 24 24"/);

  const htmlDefault = generateRoomPresentationHTML(project);
  assert.ok(!htmlDefault.includes('<img class="snapshot-image"'));
  assert.ok(htmlDefault.includes('class="snapshot-card snapshot-placeholder"'));
});

test('escaping of user inputs prevents HTML injection / XSS vulnerabilities', () => {
  const project = createDefaultProject();
  project.name = '<script>alert("hack-project")</script>';
  project.cabinets = [
    {
      ...project.cabinets[0],
      name: '<img src=x onerror=alert("cab")>',
      width: 1000,
      height: 2000,
      depth: 600,
      y: 0
    }
  ];
  project.materials = [
    {
      ...project.materials[0],
      name: 'Custom <marquee>Oak</marquee>',
      manufacturer: 'Acme <Corp> & "Brothers"',
      decorCode: 'D<123>'
    }
  ];

  const html = generateRoomPresentationHTML(project, {
    language: 'en',
    snapshot: '"><script>alert("xss")</script>'
  });

  // Verify dangerous tags are NOT injected as raw HTML
  assert.ok(!html.includes('<script>alert("hack-project")</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert("cab")>'));
  assert.ok(!html.includes('<marquee>Oak</marquee>'));
  assert.ok(!html.includes('"><script>alert("xss")</script>'));

  // Verify proper HTML escaping
  assert.ok(html.includes('&lt;script&gt;alert(&quot;hack-project&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(&quot;cab&quot;)&gt;'));
  assert.ok(html.includes('&lt;marquee&gt;Oak&lt;/marquee&gt;'));
  assert.ok(html.includes('Acme &lt;Corp&gt; &amp; &quot;Brothers&quot;'));
  assert.ok(html.includes('D&lt;123&gt;'));
});

test('handles minimal and empty projects without errors', () => {
  const emptyProject = {
    name: 'Minimal Project',
    room: { width: 3000, depth: 3000, height: 2600, outline: [], windows: [] },
    cabinets: [],
    materials: []
  };

  const html = generateRoomPresentationHTML(emptyProject, { language: 'en' });
  assert.ok(html.includes('Minimal Project'));
  assert.match(html, /No cabinets added/);
  assert.match(html, /No door or window openings in room/);
  assert.match(html, /No materials defined/);
  assert.match(html, /0 ₺/);
});
