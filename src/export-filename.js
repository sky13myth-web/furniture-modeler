/** A project title must also work as a basename in the Windows save dialog. */
export function exportBaseName(value) {
  let name = String(value ?? '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().slice(0, 80).replace(/[. ]+$/, '');
  if (!name || /^\.+$/.test(name)) name = 'project';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = `project-${name}`;
  return name;
}
