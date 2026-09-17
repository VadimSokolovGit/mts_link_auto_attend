// Сборщик userscript без внешних зависимостей.
// Склеивает заголовок UserScript + общий движок (src/core.js) + GM-адаптер.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const USERSCRIPT_DESCRIPTION =
  'Автоматическое подтверждение присутствия на вебинарах, лекциях и встречах (МТС Линк, Телемост, Zoom, SberJazz, VK Звонки, Pruffme и любые другие сайты)';

const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src', 'userscript', 'adapter.js'), 'utf8');

const header = `// ==UserScript==
// @name         ${manifest.name}
// @namespace    http://tampermonkey.net/
// @version      ${manifest.version}
// @description  ${USERSCRIPT_DESCRIPTION}
// @author       Antigravity
// @match        http://*/*
// @match        https://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==UserScript==

// AUTO-GENERATED FILE. Не редактируйте вручную: правьте src/core.js и
// src/userscript/adapter.js, затем запустите \`npm run build\`.
`;

const output = header + '\n' + core + '\n' + adapter + '\n';

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const outFile = path.join(distDir, 'mts_link_autoconfirm.user.js');
fs.writeFileSync(outFile, output, 'utf8');

console.log(`Собрано: ${path.relative(root, outFile)} (v${manifest.version})`);