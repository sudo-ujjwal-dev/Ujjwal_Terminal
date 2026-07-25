const input = document.getElementById("inputField");
const output = document.getElementById("output");
 


const INITIAL_VFS = {
  "type": "dir",
  "name": "",
  "children": [
    {
      "type": "dir",
      "name": "home",
      "children": [
        {
          "type": "dir",
          "name": "user",
          "children": [
            { "type": "file", "name": "README.txt", "content": "Welcome to your fake terminal!\nUse 'help' to list supported commands.\n" },
            { "type": "file", "name": "notes.txt", "content": "These are practice notes.\nTry: ls, pwd, cd, cat, touch, mkdir\n" }
          ]
        }
      ]
    },
    { "type": "dir", "name": "etc", "children": [] },
    { "type": "dir", "name": "bin", "children": [] }
  ]
};

function loadVFS() {
  try {
    const raw = localStorage.getItem('fake_vfs');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return INITIAL_VFS;
}
function saveVFS(vfs) {
  try { localStorage.setItem('fake_vfs', JSON.stringify(vfs)); } catch (e) { /* ignore */ }
}

class VFS {
  constructor(tree) { this.root = tree; }
  _splitPath(p, cwd) {
    if (!p) return [];
    const isAbsolute = p.startsWith('/');
    const parts = (isAbsolute ? p.slice(1) : p).split('/').filter(Boolean);
    const cwdParts = (cwd === '/') ? [] : cwd.split('/').filter(Boolean);
    const segs = isAbsolute ? parts : [...cwdParts, ...parts];
    const out = [];
    for (const s of segs) {
      if (s === '.' || s === '') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return out;
  }
  _traverse(pathSegments) {
    let node = this.root; let parent = null;
    for (const seg of pathSegments) {
      if (!node.children) return { node: null, parent: null };
      parent = node;
      node = node.children.find(c => c.name === seg);
      if (!node) return { node: null, parent };
    }
    return { node, parent };
  }
  resolve(p, cwd = '/') {
    if (p === '/') return this.root;
    const segs = this._splitPath(p, cwd);
    if (segs.length === 0) return this.root;
    const { node } = this._traverse(segs);
    return node;
  }
  ensureDir(p, cwd = '/') {
    const segs = this._splitPath(p, cwd);
    let node = this.root;
    for (const s of segs) {
      let next = node.children && node.children.find(c => c.name === s && c.type === 'dir');
      if (!next) { next = { type: 'dir', name: s, children: [] }; node.children = node.children || []; node.children.push(next); }
      node = next;
    }
    return node;
  }
  list(p, cwd = '/') {
    const node = this.resolve(p, cwd);
    if (!node) throw new Error('No such file or directory');
    if (node.type !== 'dir') throw new Error('Not a directory');
    return node.children.map(c => c.name + (c.type === 'dir' ? '/' : ''));
  }
  readFile(p, cwd = '/') {
    const node = this.resolve(p, cwd);
    if (!node) throw new Error('No such file');
    if (node.type !== 'file') throw new Error('Not a file');
    return node.content || '';
  }
  writeFile(p, content, cwd = '/', append = false) {
    const segs = this._splitPath(p, cwd);
    const name = segs.pop();
    const dir = segs.length ? this._traverse(segs).node : this.root;
    if (!dir) throw new Error('No such directory');
    if (!dir.children) dir.children = [];
    let file = dir.children.find(c => c.name === name);
    if (!file) { file = { type: 'file', name, content: '' }; dir.children.push(file); }
    if (file.type !== 'file') throw new Error('Is a directory');
    file.content = append ? (file.content || '') + content : content;
    return file;
  }
  remove(p, cwd = '/', recursive = false) {
    const segs = this._splitPath(p, cwd);
    const name = segs.pop();
    const dir = segs.length ? this._traverse(segs).node : this.root;
    if (!dir || !dir.children) throw new Error('No such file or directory');
    const idx = dir.children.findIndex(c => c.name === name);
    if (idx === -1) throw new Error('No such file or directory');
    const node = dir.children[idx];
    if (node.type === 'dir' && node.children && node.children.length > 0 && !recursive) throw new Error('Directory not empty');
    dir.children.splice(idx, 1);
    return true;
  }
  copy(src, dest, cwd = '/') {
    const srcNode = this.resolve(src, cwd);
    if (!srcNode) throw new Error('No such source');
    const segs = this._splitPath(dest, cwd);
    const name = segs.pop();
    const dir = segs.length ? this._traverse(segs).node : this.root;
    if (!dir) throw new Error('No such destination directory');
    const clone = JSON.parse(JSON.stringify(srcNode));
    clone.name = name;
    dir.children = dir.children || [];
    dir.children.push(clone);
  }
  move(src, dest, cwd = '/') { this.copy(src, dest, cwd); this.remove(src, cwd, true); }
}

// State
const vfsTree = loadVFS();
const vfs = new VFS(vfsTree);
let cwd = localStorage.getItem('fake_cwd') || '/home/user';
let history = JSON.parse(localStorage.getItem('fake_history') || '[]');
let histIndex = history.length;

const COMMANDS = ['ls','pwd','cd','cat','echo','touch','mkdir','rm','rmdir','cp','mv','grep','head','tail','history','clear','help'];

function saveState() {
  saveVFS(vfs.root);
  localStorage.setItem('fake_cwd', cwd);
  localStorage.setItem('fake_history', JSON.stringify(history));
}

function printLine(text, className) {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) p.className = className;
  output.appendChild(p);
  window.scrollTo(0, document.body.scrollHeight);
}

function printHelp() {
  printLine('Supported commands:');
  printLine(' ls [path] - list directory');
  printLine(' pwd - print working directory');
  printLine(' cd [path] - change directory');
  printLine(' cat file - show file contents');
  printLine(' echo TEXT [> file | >> file] - write/append');
  printLine(' touch file - create empty file');
  printLine(' mkdir [-p] dir - make directory');
  printLine(' rm [-r] target - remove file or directory');
  printLine(' rmdir dir - remove empty directory');
  printLine(' cp src dest - copy file/dir');
  printLine(' mv src dest - move/rename');
  printLine(' grep PATTERN file - search for PATTERN');
  printLine(' head [-n N] file - first N lines');
  printLine(' tail [-n N] file - last N lines');
  printLine(' history - show command history');
  printLine(' clear - clear the screen');
  printLine(' help - show this help');
}

function resolveDisplayPath(path) {
  if (!path) return cwd;
  if (path === '/') return '/';
  const segs = vfs._splitPath(path, cwd);
  return '/' + segs.join('/');
}

function handleCommand(raw) {
  const line = raw.trim();
  if (!line) return;
  printLine('> ' + line, 'input-line');
  history.push(line); histIndex = history.length;
  saveState();

  // redirection handling for echo
  if (line.startsWith('echo ')) {
    const appendMatch = line.match(/^echo\s+(.+)\s+>>\s+(.+)$/);
    const writeMatch = line.match(/^echo\s+(.+)\s+>\s+(.+)$/);
    if (appendMatch) {
      const text = appendMatch[1]; const file = appendMatch[2];
      try { vfs.writeFile(file, text + '\n', cwd, true); printLine(''); saveState(); } catch (e) { printLine('Error: '+e.message); }
      return;
    }
    if (writeMatch) {
      const text = writeMatch[1]; const file = writeMatch[2];
      try { vfs.writeFile(file, text + '\n', cwd, false); printLine(''); saveState(); } catch (e) { printLine('Error: '+e.message); }
      return;
    }
  }

  const parts = line.split(/\s+/);
  const cmd = parts[0]; const args = parts.slice(1);
  try {
    switch (cmd) {
      case 'help': printHelp(); break;
      case 'pwd': printLine(resolveDisplayPath(cwd)); break;
      case 'ls': {
        const target = args[0] || '.';
        const list = vfs.list(target === '.' ? cwd : target, cwd);
        printLine(list.join('\t'));
        break;
      }
      case 'cd': {
        const target = args[0] || '/home/user';
        const node = vfs.resolve(target, cwd);
        if (!node) { printLine('No such directory'); break; }
        if (node.type !== 'dir') { printLine('Not a directory'); break; }
        const segs = vfs._splitPath(target, cwd);
        cwd = '/' + segs.join('/'); if (cwd === '') cwd = '/'; saveState(); break;
      }
      case 'cat': {
        const file = args[0]; if (!file) { printLine('Usage: cat file'); break; }
        try { printLine(vfs.readFile(file, cwd)); } catch (e) { printLine('Error: '+e.message); }
        break;
      }
      case 'touch': {
        const file = args[0]; if (!file) { printLine('usage: touch file'); break; }
        vfs.writeFile(file, '', cwd, false); saveState(); break;
      }
      case 'mkdir': {
        if (args[0] === '-p') { if (!args[1]) { printLine('usage: mkdir [-p] dir'); break; } vfs.ensureDir(args[1], cwd); }
        else { if (!args[0]) { printLine('usage: mkdir dir'); break; } vfs.ensureDir(args[0], cwd); }
        saveState(); break;
      }
      case 'rm': {
        const recursive = args[0] === '-r' || args.includes('-r');
        const target = recursive ? args[1] : args[0];
        if (!target) { printLine('usage: rm [-r] target'); break; }
        vfs.remove(target, cwd, recursive); saveState(); break;
      }
      case 'rmdir': { const target = args[0]; if (!target) { printLine('usage: rmdir dir'); break; } vfs.remove(target, cwd, false); saveState(); break; }
      case 'cp': { if (args.length < 2) { printLine('usage: cp src dest'); break; } vfs.copy(args[0], args[1], cwd); saveState(); break; }
      case 'mv': { if (args.length < 2) { printLine('usage: mv src dest'); break; } vfs.move(args[0], args[1], cwd); saveState(); break; }
      case 'grep': { if (args.length < 2) { printLine('usage: grep PATTERN file'); break; } const pattern = args[0]; const file = args[1]; const txt = vfs.readFile(file, cwd); const lines = txt.split(/\r?\n/); for (let i=0;i<lines.length;i++) if (lines[i].includes(pattern)) printLine((i+1)+':'+lines[i]); break; }
      case 'head': { let n = 10; let file; if (args[0] === '-n') { n = parseInt(args[1]) || 10; file = args[2]; } else file = args[0]; if (!file) { printLine('usage: head [-n N] file'); break; } const txt = vfs.readFile(file, cwd); printLine(txt.split(/\r?\n/).slice(0,n).join('\n')); break; }
      case 'tail': { let n = 10; let file; if (args[0] === '-n') { n = parseInt(args[1]) || 10; file = args[2]; } else file = args[0]; if (!file) { printLine('usage: tail [-n N] file'); break; } const txt = vfs.readFile(file, cwd); const lines = txt.split(/\r?\n/); printLine(lines.slice(Math.max(0, lines.length-n)).join('\n')); break; }
      case 'history': printLine(history.map((h,i)=>`${i+1}  ${h}`).join('\n')); break;
      case 'clear': output.innerHTML = ''; break;
      default: printLine(`${cmd}: command not found`);
    }
  } catch (e) { printLine('Error: '+e.message); }
}

// Completion helpers
function listDirNames(path, cwdLocal) {
  try { return vfs.list(path === '.' ? cwdLocal : path, cwdLocal).map(s=> s.replace(/\/$/,'') ); } catch(e){ return []; }
}

function completeToken(token, isCommand) {
  if (isCommand) {
    return COMMANDS.filter(c => c.startsWith(token));
  }
  // file/path completion
  // Handle dirname/partial
  const slashIndex = token.lastIndexOf('/');
  let dirPart = '.'; let prefix = token;
  if (slashIndex !== -1) {
    dirPart = token.slice(0, slashIndex) || '/';
    prefix = token.slice(slashIndex+1);
  }
  const entries = listDirNames(dirPart, cwd);
  return entries.filter(e => e.startsWith(prefix)).map(e => (slashIndex===-1? e : dirPart.replace(/\/$/,'') + '/' + e));
}

// Input handling: Enter, Tab, Up/Down
input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const text = input.value;
    handleCommand(text);
    input.value = '';
    e.preventDefault();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const val = input.value;
    const caret = input.selectionStart;
    // complete the token at caret (simple: last token)
    const before = val.slice(0, caret);
    const after = val.slice(caret);
    const m = before.match(/(\S+)$/);
    const token = m ? m[1] : '';
    const isFirstToken = before.trim().split(/\s+/).length === 1 && !before.endsWith(' ');
    const candidates = completeToken(token, isFirstToken);
    if (candidates.length === 0) { return; }
    if (candidates.length === 1) {
      // replace token with candidate
      const replace = candidates[0];
      const newBefore = before.slice(0, before.length - token.length) + replace + (replace.endsWith('/') ? '' : ' ');
      input.value = newBefore + after;
      input.selectionStart = input.selectionEnd = newBefore.length;
    } else {
      // multiple candidates: show list
      printLine(candidates.join('\t'));
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    if (history.length === 0) return;
    if (histIndex > 0) histIndex--;
    input.value = history[histIndex] || '';
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowDown') {
    if (history.length === 0) return;
    if (histIndex < history.length-1) histIndex++;
    else { histIndex = history.length; input.value = ''; return; }
    input.value = history[histIndex] || '';
    e.preventDefault();
    return;
  }
});

// Initial prompt
printLine('Fake Terminal (web) — type "help" for commands');
printLine('Current directory: ' + resolveDisplayPath(cwd));

// Save before unload
window.addEventListener('beforeunload', saveState);
