// Mylo build — bundles the src/ ES modules into a single minified app.js
// and minifies style.css. Run with: npm run build
import * as esbuild from 'esbuild';

const JS_VERSION = '2.0.1';  // must match the ?v= in index.html and sw.js precache
const CSS_VERSION = '1.4.1'; // must match the ?v= in index.html and sw.js precache

const js = await esbuild.build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'app.js',
  target: ['es2018'],
  loader: { '.js': 'jsx' },
  jsx: 'transform', // classic runtime — JSX compiles to React.createElement (React 17 UMD global)
  logLevel: 'info',
});

const css = await esbuild.build({
  entryPoints: ['src/style.css'],
  minify: true,
  outfile: 'style.css',
  logLevel: 'info',
});

console.log(`app.js  ?v=${JS_VERSION} built`);
console.log(`style.css ?v=${CSS_VERSION} built`);
if (js.errors.length || css.errors.length) process.exit(1);
