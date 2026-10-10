import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PAGES_LICENSE_FILES,preparePages,writeWebArchive} from '../scripts/prepare-pages.mjs';

async function files(directory,prefix=''){
  const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())result.push(...await files(path.join(directory,entry.name),name+'/'));else result.push(name);}return result.sort();
}
test('Pages staging copies only public application and license bytes and replaces a stale artifact',async()=>{
  await mkdir('.tools',{recursive:true});const root=await mkdtemp(path.resolve('.tools/pages-staging-test-'));
  try{
    const publicFiles={'index.html':'<link href="./src/studio.css"><script type="module" src="./src/app.js"></script>','src/app.js':"import './helper.js';",'src/helper.js':'export const value=42;','src/studio.css':'body{color:green}',...Object.fromEntries(PAGES_LICENSE_FILES.map(file=>[file,'PUBLIC LICENSE: '+file]))};
    const privateFiles=['.tools/private-project.json','.aws/credentials','credentials.json','desktop/main.cjs','dist/app.exe','.git/config','tests/example.js','src/credentials.json','src/.private/token.js','src/app.test.mjs','docs/private-notes.md','.tools/pages-site/credentials.json'];
    for(const [file,content] of [...Object.entries(publicFiles),...privateFiles.map(file=>[file,'PRIVATE DECOY'])]){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),content);}
    const result=await preparePages({root});assert.equal(result.directory,path.join(root,'.tools','pages-site'));assert.deepEqual(await files(result.directory),[...Object.keys(publicFiles),'.nojekyll'].sort());
    for(const [file,content] of Object.entries(publicFiles))assert.equal(await readFile(path.join(result.directory,file),'utf8'),content);
    for(const file of privateFiles)assert.equal(await readFile(path.join(root,file),'utf8').catch(()=>null),file==='.tools/pages-site/credentials.json'?null:'PRIVATE DECOY');
    assert.equal(await readFile(path.join(result.directory,'.nojekyll'),'utf8'),'');
    const artifact=await writeWebArchive(result,{version:'2.2.1'}),zip=await readFile(artifact.archive),end=zip.length-22;
    assert.equal(zip.readUInt32LE(end),0x06054b50);assert.equal(zip.readUInt16LE(end+10),result.files.length);
    const archiveFiles=[];let offset=0;
    while(offset<zip.readUInt32LE(end+16)){assert.equal(zip.readUInt32LE(offset),0x04034b50);assert.equal(zip.readUInt16LE(offset+8),0);const length=zip.readUInt32LE(offset+18),nameSize=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),name=zip.subarray(offset+30,offset+30+nameSize).toString('utf8'),content=zip.subarray(offset+30+nameSize+extra,offset+30+nameSize+extra+length);assert.ok(content.equals(await readFile(path.join(result.directory,name))));archiveFiles.push(name);offset+=30+nameSize+extra+length;}
    assert.deepEqual(archiveFiles.sort(),[...Object.keys(publicFiles),'.nojekyll'].sort());assert.equal(artifact.bytes,zip.length);assert.match(artifact.sha256,/^[a-f0-9]{64}$/);
    const second=await preparePages({root});assert.deepEqual(second.files,result.files);assert.deepEqual(await files(second.directory),[...Object.keys(publicFiles),'.nojekyll'].sort());
  }finally{await rm(root,{recursive:true,force:true});}
});
test('real browser entry resolves its local assets under a project Pages prefix and the desktop origin',async()=>{
  const html=await readFile('index.html','utf8'),assets=[...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map(match=>match[1]).filter(value=>!value.startsWith('data:'));
  assert.deepEqual(assets,['./src/studio.css','./src/app.js']);
  for(const [base,prefix] of [['https://example.github.io/furniture-modeler/','/furniture-modeler/'],['atolye://app/','/']])for(const asset of assets)assert.equal(new URL(asset,base).pathname,prefix+asset.slice(2));
  assert.doesNotMatch(html,/<base\b|(?:src|href)="\//);
});
test('web workflow uploads only the public ZIP and has no deployment permissions or actions',async()=>{
  const workflow=await readFile('.github/workflows/web-build.yml','utf8');assert.match(workflow,/run: node scripts\/prepare-pages\.mjs/);assert.match(workflow,/uses: actions\/upload-artifact@v7\.0\.2/);assert.match(workflow,/path: \.tools\/ATOLYE-Web-\*\.zip/);
  assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/pages: write|id-token: write|deploy-pages|upload-pages-artifact|configure-pages|gh api/);assert.doesNotMatch(workflow,/path:\s*(?:\.(?:\/)?\s|dist\b|src\b)/);
  assert.match(workflow,/include-hidden-files: true/,'the explicitly allowlisted public ZIP is inside the ignored .tools directory');
});
test('Workers publishes the same isolated public directory without a runtime script or bindings',async()=>{
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  assert.equal(config.name,'furniture-modeler');
  assert.equal(config.assets.directory,'./.tools/pages-site');
  assert.deepEqual(Object.keys(config).sort(),['assets','compatibility_date','name']);
  assert.deepEqual(Object.keys(config.assets),['directory']);
  assert.match(config.compatibility_date,/^\d{4}-\d{2}-\d{2}$/);
});
