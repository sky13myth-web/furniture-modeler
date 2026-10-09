import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import policy from '../desktop/policy.cjs';

test('desktop asset protocol exposes application assets without exposing repository or user files', () => {
  const root = path.resolve('app');
  assert.equal(policy.bundledFile(root, 'atolye://app/'), path.join(root, 'index.html'));
  assert.equal(policy.bundledFile(root, 'atolye://app/src/studio.js'), path.join(root, 'src', 'studio.js'));
  for (const url of ['atolye://evil/src/app.js', 'atolye://app/package.json', 'atolye://app/.tools/token.js', 'atolye://app/src/%2f../package.json', 'atolye://app/src/%5c..%5csecret.js', 'atolye://app/src/%00.js', 'atolye://user:pass@app/src/app.js', 'atolye://app:77/src/app.js', 'file:///C:/secret.js', 'atolye://app/src/a.js%ZZ']) assert.equal(policy.bundledFile(root, url), null, url);
});

test('desktop popup policy permits inherited local print windows and safe HTTPS browser links', () => {
  assert.ok(policy.isPrintUrl('about:blank'));
  assert.ok(policy.isPrintUrl('blob:atolye://app/document-id'));
  for (const url of ['blob:https://evil.test/id', 'javascript:alert(1)', 'file:///C:/secret', 'about:config']) assert.equal(policy.isPrintUrl(url), false);
  assert.equal(policy.externalLink('https://example.org/manual.pdf'), 'https://example.org/manual.pdf');
  for (const url of ['http://example.org', 'https://user:pass@example.org', 'file:///C:/secret', 'javascript:alert(1)']) assert.equal(policy.externalLink(url), null);
});
