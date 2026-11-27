import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

// Embute modelos 3D rigged (.glb), capturas de movimento e mão fotorrealista do celular diretamente no HTML standalone offline!
const modelsDir = path.join(root, 'public/models');
const inlineGlbs = {};
if (fs.existsSync(modelsDir)) {
  for (const file of fs.readdirSync(modelsDir)) {
    if (file.endsWith('.glb')) {
      const buf = fs.readFileSync(path.join(modelsDir, file));
      inlineGlbs[file] = buf.toString('base64');
    }
  }
}

let inlinePhoneRig = '';
const phoneRigPath = path.join(root, 'public/images/phone-hand-rig.webp');
if (fs.existsSync(phoneRigPath)) {
  inlinePhoneRig = `data:image/webp;base64,${fs.readFileSync(phoneRigPath).toString('base64')}`;
}

const jsResult = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  loader: {
    '.css': 'empty',
  },
});

const cssResult = await esbuild.build({
  entryPoints: [path.join(root, 'src/ui/styles.css')],
  bundle: true,
  minify: true,
  write: false,
});

const jsCode = jsResult.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
const cssCode = cssResult.outputFiles[0].text;
const inlineAssetsScript = `window.__INLINE_GLBS__=${JSON.stringify(inlineGlbs)};window.__INLINE_PHONE_RIG__=${JSON.stringify(inlinePhoneRig)};`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
    />
    <title>Plantão Noturno — 5 Noites na ETEC Sebrae</title>
    <style>${cssCode}</style>
  </head>
  <body>
    <div id="app">
      <div id="fx-vignette"></div>
      <div id="fx-grain"></div>
      <div id="fx-flash"></div>
      <div id="hud-root"></div>
      <div id="phone-device"></div>
      <div id="overlay-root" class="screen-overlay"></div>
    </div>
    <script>${inlineAssetsScript}</script>
    <script>${jsCode}</script>
  </body>
</html>
`;

const outPath = path.join(root, 'plantao-noturno.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Standalone HTML generated: ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
