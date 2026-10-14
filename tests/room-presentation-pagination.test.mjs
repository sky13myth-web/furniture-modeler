import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateRoomPresentationHTML } from '../src/room-presentation.js';

function createMultiCabinetProject(count) {
  const project = createDefaultProject();
  project.name = `Project with ${count} cabinets`;
  project.cabinets = [];

  for (let i = 0; i < count; i++) {
    project.cabinets.push({
      id: `cab-${i + 1}`,
      name: `Cabinet ${i + 1}`,
      width: 600,
      height: 720,
      depth: 560,
      x: i * 650,
      y: 0,
      z: 0,
      materialId: project.materials[0]?.id || 'mat-1',
      frontMaterialId: project.materials[0]?.id || 'mat-1',
      layout: {
        id: `layout-${i + 1}`,
        type: 'section',
        direction: 'vertical',
        thickness: 16,
        sections: []
      }
    });
  }

  return project;
}

test('Room presentation pagination for 0 cabinets yields 4 pages with empty table', () => {
  const project = createMultiCabinetProject(0);
  const html = generateRoomPresentationHTML(project, { language: 'en' });

  // Page count 4: Cover, Plan, 1 Spec page, Cost page
  assert.match(html, /class="page page-1 cover-page"/);
  assert.match(html, /class="page page-2 layout-page"/);
  assert.match(html, /class="page page-3 specs-page"/);
  assert.match(html, /class="page page-4 cost-page"/);
  assert.ok(!html.includes('class="page page-5'));

  // Footers
  assert.match(html, /Page 1 \/ 4/);
  assert.match(html, /Page 2 \/ 4/);
  assert.match(html, /Page 3 \/ 4/);
  assert.match(html, /Page 4 \/ 4/);

  // Materials palette appears on page 3
  assert.match(html, /Materials &amp; Decors Palette|Materials & Decors Palette/);
});

test('Room presentation pagination for <= 8 cabinets produces exactly 4 pages', () => {
  const project4 = createMultiCabinetProject(4);
  const html4 = generateRoomPresentationHTML(project4, { language: 'en' });
  assert.match(html4, /Page 1 \/ 4/);
  assert.match(html4, /Page 3 \/ 4/);
  assert.match(html4, /Page 4 \/ 4/);
  assert.ok(!html4.includes('/ 5'));

  const project8 = createMultiCabinetProject(8);
  const html8 = generateRoomPresentationHTML(project8, { language: 'en' });
  assert.match(html8, /Page 1 \/ 4/);
  assert.match(html8, /Page 4 \/ 4/);
  assert.ok(!html8.includes('page-5'));
});

test('Room presentation pagination for 9 cabinets produces 5 pages with split spec table', () => {
  const project9 = createMultiCabinetProject(9);
  const html = generateRoomPresentationHTML(project9, { language: 'en' });

  // 5 total pages: Cover, Plan, Spec 1, Spec 2, Cost
  assert.match(html, /class="page page-1 cover-page"/);
  assert.match(html, /class="page page-2 layout-page"/);
  assert.match(html, /class="page page-3 specs-page"/);
  assert.match(html, /class="page page-4 specs-page"/);
  assert.match(html, /class="page page-5 cost-page"/);
  assert.ok(!html.includes('class="page page-6'));

  // Footers
  assert.match(html, /Page 1 \/ 5/);
  assert.match(html, /Page 2 \/ 5/);
  assert.match(html, /Page 3 \/ 5/);
  assert.match(html, /Page 4 \/ 5/);
  assert.match(html, /Page 5 \/ 5/);

  // First spec page (page 3) should have C1..C8, but NOT C9
  const page3Start = html.indexOf('class="page page-3 specs-page"');
  const page4Start = html.indexOf('class="page page-4 specs-page"');
  const page5Start = html.indexOf('class="page page-5 cost-page"');

  const page3Html = html.slice(page3Start, page4Start);
  const page4Html = html.slice(page4Start, page5Start);

  assert.ok(page3Html.includes('>C1<'));
  assert.ok(page3Html.includes('>C8<'));
  assert.ok(!page3Html.includes('>C9<'));

  // Second spec page (page 4) should have C9 and the Materials palette
  assert.ok(page4Html.includes('>C9<'));
  assert.ok(!page4Html.includes('>C1<'));
  assert.match(page4Html, /Materials &amp; Decors Palette|Materials & Decors Palette/);
  // First spec page should NOT have the Materials palette
  assert.ok(!page3Html.includes('materials-table'));
});

test('Room presentation pagination for 16 cabinets produces 5 pages (8 + 8)', () => {
  const project16 = createMultiCabinetProject(16);
  const html = generateRoomPresentationHTML(project16, { language: 'en' });

  assert.match(html, /class="page page-3 specs-page"/);
  assert.match(html, /class="page page-4 specs-page"/);
  assert.match(html, /class="page page-5 cost-page"/);
  assert.ok(!html.includes('page-6'));

  assert.match(html, /Page 1 \/ 5/);
  assert.match(html, /Page 5 \/ 5/);
});

test('Room presentation pagination for 17 cabinets produces 6 pages (8 + 8 + 1)', () => {
  const project17 = createMultiCabinetProject(17);
  const html = generateRoomPresentationHTML(project17, { language: 'en' });

  assert.match(html, /class="page page-3 specs-page"/);
  assert.match(html, /class="page page-4 specs-page"/);
  assert.match(html, /class="page page-5 specs-page"/);
  assert.match(html, /class="page page-6 cost-page"/);
  assert.ok(!html.includes('page-7'));

  assert.match(html, /Page 1 \/ 6/);
  assert.match(html, /Page 3 \/ 6/);
  assert.match(html, /Page 4 \/ 6/);
  assert.match(html, /Page 5 \/ 6/);
  assert.match(html, /Page 6 \/ 6/);

  // Materials palette on page 5 (last spec page)
  const page4Start = html.indexOf('class="page page-4 specs-page"');
  const page5Start = html.indexOf('class="page page-5 specs-page"');
  const page6Start = html.indexOf('class="page page-6 cost-page"');

  const page4Html = html.slice(page4Start, page5Start);
  const page5Html = html.slice(page5Start, page6Start);

  assert.ok(!page4Html.includes('materials-table'));
  assert.ok(page5Html.includes('materials-table'));
  assert.ok(page5Html.includes('>C17<'));
});
