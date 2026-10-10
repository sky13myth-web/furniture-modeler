/** Stage public browser assets only. Never upload the repository checkout. */
import {copyFile,lstat,mkdir,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createStoredZip} from '../src/zip-store.js';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export const PAGES_LICENSE_FILES=['LICENSE','LICENSE.ru.md','LICENSE.tr.md','docs/licenses/MIT-through-v2.2.0.txt'];

async function regularFile(filename){
  const info=await lstat(filename);
  if(!info.isFile()||info.isSymbolicLink())throw new Error(`Public asset must be a regular file: ${filename}`);
}
export async function preparePages({root=projectRoot}={}){
  const resolvedRoot=await realpath(root),source=path.join(resolvedRoot,'src'),tools=path.join(resolvedRoot,'.tools');
  const sourceInfo=await lstat(source);if(!sourceInfo.isDirectory()||sourceInfo.isSymbolicLink())throw new Error('Public src must be a real directory.');
  const publicSource=(await readdir(source,{withFileTypes:true})).filter(entry=>/^[a-z0-9][a-z0-9-]*\.(?:js|css)$/i.test(entry.name)).map(entry=>`src/${entry.name}`).sort();
  if(!publicSource.includes('src/app.js')||!publicSource.includes('src/studio.css'))throw new Error('Browser entry assets are missing.');
  const files=['index.html',...PAGES_LICENSE_FILES,...publicSource];
  // Validate every source before replacing a previous successful artifact.
  for(const file of files)await regularFile(path.join(resolvedRoot,file));
  await mkdir(tools,{recursive:true});const toolsInfo=await lstat(tools);if(!toolsInfo.isDirectory()||toolsInfo.isSymbolicLink())throw new Error('Pages staging parent must be a real directory.');
  const directory=path.resolve(tools,'pages-site');
  if(path.relative(resolvedRoot,directory)!==path.join('.tools','pages-site'))throw new Error('Invalid Pages output directory.');
  const existing=await lstat(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(existing?.isSymbolicLink())throw new Error('Pages staging output cannot be a symbolic link.');
  await rm(directory,{recursive:true,force:true});await mkdir(directory,{recursive:true});
  for(const file of files){const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(resolvedRoot,file),target);}
  await writeFile(path.join(directory,'.nojekyll'),'');
  return {directory,files:[...files,'.nojekyll']};
}
export async function writeWebArchive(site,{version}={}){
  if(!/^\d+\.\d+\.\d+$/.test(version??''))throw new Error('A release version is required for the web archive.');
  const entries=[];for(const file of site.files){const filename=path.resolve(site.directory,file);if(!filename.startsWith(path.resolve(site.directory)+path.sep))throw new Error('Web archive entry escapes the public site.');await regularFile(filename);entries.push({path:file,content:await readFile(filename)});}
  const archive=path.join(path.dirname(site.directory),`ATOLYE-Web-${version}.zip`),existing=await lstat(archive).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(existing?.isSymbolicLink())throw new Error('Web archive output cannot be a symbolic link.');
  const bytes=createStoredZip(entries);await writeFile(archive,bytes);return {archive,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:entries.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const result=await preparePages(),metadata=JSON.parse(await readFile(path.join(projectRoot,'package.json'),'utf8')),archive=await writeWebArchive(result,{version:metadata.version});console.log(`Static web site: ${result.directory} (${result.files.length} public files)`);console.log(JSON.stringify(archive));}
