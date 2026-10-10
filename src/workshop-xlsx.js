import { createStoredZip } from './zip-store.js';

const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function columnName(index) { let name = ''; for (index++; index > 0; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name; return name; }
function cell(value, reference, style) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid workshop dimension.');
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
const translations = {
  tr: { title: 'Kesim listesi', dimensions: 'Ölçüler mm. İlk iki sütun: bantsız ham EN × BOY. Bant kalınlığı zaten düşülmüştür.', edges: 'E1 sol · E2 sağ · E3 üst · E4 alt (parça çizimine göre). 0 = bant yok. Damar B boyunca.', stock: 'Levha', cutNote: 'Sıra, kesim payı ve koordinatlar ayrı kesim planıyla aynıdır.' },
  ru: { title: 'Заказ на раскрой', dimensions: 'Размеры в мм. Первые два столбца: ШИРИНА × ДЛИНА заготовки без кромки. Кромка уже вычтена.', edges: 'E1 слева · E2 справа · E3 сверху · E4 снизу по чертежу детали. 0 = без кромки. Текстура вдоль B.', stock: 'Лист', cutNote: 'Последовательность, пропил и координаты совпадают с отдельной схемой резов.' },
  en: { title: 'Cutting order', dimensions: 'Dimensions in mm. First two columns: unbanded raw WIDTH × LENGTH. Bands are already deducted.', edges: 'E1 left · E2 right · E3 top · E4 bottom, as on the part drawing. 0 = no band. Grain along B.', stock: 'Sheet', cutNote: 'Sequence, kerf and coordinates match the separate cutting plan.' }
};
function uniqueSheetName(value, used) {
  let base = String(value || 'Sheet').replace(/[\[\]:*?/\\\u0000-\u001f]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet';
  base = base.slice(0, 31);
  let name = base, suffix = 1;
  while (used.has(name.toLocaleLowerCase('en'))) { const tail = ` (${++suffix})`; name = base.slice(0, 31 - tail.length) + tail; }
  used.add(name.toLocaleLowerCase('en'));
  return name;
}
function worksheet(table, words, documentInfo) {
  const { columns, rows } = table;
  if (!Array.isArray(columns) || !columns.length || columns.length > 16384 || !Array.isArray(rows) || rows.length > 1048570 || rows.some(row => !Array.isArray(row) || row.length !== columns.length)) throw new Error('Invalid workshop table.');
  const lastColumn = columnName(columns.length - 1), lastRow = rows.length + 5;
  const dimensionsFirst = table.kind === 'parts';
  const defaultWidths = dimensionsFirst ? [15, 15, 8, 11, 31, 21, 9, 9, 9, 9, 18, 18] : columns.map((header, index) => index < 2 ? 16 : Math.min(28, Math.max(12, String(header).length + 2)));
  const columnWidths = columns.map((_, index) => table.columnWidths?.[index] ?? defaultWidths[index] ?? 18);
  const stock = table.sheetWidth && table.sheetHeight ? `${words.stock} ${table.sheetWidth} × ${table.sheetHeight} mm` : '';
  const title = dimensionsFirst && table.materialName ? [table.materialName, table.decorCode, `${table.thickness} mm`].filter(Boolean).join(' · ') : table.title || table.name || words.title;
  const introductory = [title, [documentInfo.id, documentInfo.date, stock].filter(Boolean).join('   ·   '), table.description || (dimensionsFirst ? words.dimensions : words.cutNote), table.note || (dimensionsFirst ? words.edges : '')];
  const data = introductory.map((value, index) => `<row r="${index + 1}" ht="${index === 0 ? 34 : 30}" customHeight="1">${cell(value, `A${index + 1}`, index === 0 ? 3 : 4)}</row>`);
  data.push(`<row r="5" ht="52" customHeight="1">${columns.map((value, index) => cell(value, `${columnName(index)}5`, 2)).join('')}</row>`);
  rows.forEach((row, index) => {
    const lines = Math.max(1, ...row.map((value, column) => typeof value === 'string' ? value.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(5, columnWidths[column] - 3))), 0) : 1));
    data.push(`<row r="${index + 6}" ht="${Math.max(29, lines * 15 + 9)}" customHeight="1">${row.map((value, column) => cell(value, `${columnName(column)}${index + 6}`, typeof value === 'number' ? dimensionsFirst && column < 2 ? 5 : 1 : 0)).join('')}</row>`);
  });
  const widths = columns.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidths[index]}" customWidth="1"/>`).join('');
  const xSplit = dimensionsFirst ? 2 : 1, scrollCell = dimensionsFirst ? 'C6' : 'B6';
  const sheetXml = `${declaration}<worksheet xmlns="${namespace}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="${xSplit}" ySplit="5" topLeftCell="${scrollCell}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${scrollCell}" sqref="${scrollCell}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths}</cols><sheetData>${data.join('')}</sheetData>${rows.length ? `<autoFilter ref="A5:${lastColumn}${lastRow}"/>` : ''}<mergeCells count="4">${introductory.map((_, index) => `<mergeCell ref="A${index + 1}:${lastColumn}${index + 1}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${xml(documentInfo.id)}&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
  return { xml: sheetXml, lastColumn, lastRow };
}

/** Browser-native OOXML. Each stock/decor/gauge has its own workshop tab. */
export function createWorkshopXlsx({ language = 'tr', columns, rows, documentInfo = {}, groups = [], sheets = [] }) {
  const words = translations[language] ?? translations.en, usedNames = new Set();
  const materialTables = groups.length ? groups.map(group => ({ ...group, kind: 'parts', name: group.name || `${group.materialName} ${group.decorCode || ''} ${group.thickness}mm` })) : [{ name: words.title, kind: 'parts', columns, rows }];
  const tables = [...materialTables, ...sheets].map(table => ({ ...table, name: uniqueSheetName(table.name, usedNames) }));
  if (!tables.length || tables.length > 1024) throw new Error('Invalid workshop sheet count.');
  const worksheets = tables.map(table => worksheet(table, words, documentInfo));
  const styles = `${declaration}<styleSheet xmlns="${namespace}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.###"/></numFmts><fonts count="5"><font><sz val="11"/><color rgb="FF253D35"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="17"/><color rgb="FF355B47"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF52665A"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FF253D35"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF355B47"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1E6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="hair"><color rgb="FFD9E4DB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return createStoredZip([
    { path: '[Content_Types].xml', content: `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { path: '_rels/.rels', content: `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { path: 'xl/workbook.xml', content: `${declaration}<workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${tables.map((table, index) => `<sheet name="${xml(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><definedNames>${tables.map((table, index) => `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${xml(table.name.replace(/'/g, "''"))}'!$1:$5</definedName><definedName name="_xlnm.Print_Area" localSheetId="${index}">'${xml(table.name.replace(/'/g, "''"))}'!$A$1:$${worksheets[index].lastColumn}$${worksheets[index].lastRow}</definedName>`).join('')}</definedNames></workbook>` },
    { path: 'xl/_rels/workbook.xml.rels', content: `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { path: 'xl/styles.xml', content: styles }, ...worksheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, content: sheet.xml }))
  ]);
}
