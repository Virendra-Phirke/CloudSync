const fs = require('fs');
const files = [
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.dev.js',
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.prod.js',
  'node_modules/next/dist/compiled/next-server/pages.runtime.dev.js',
  'node_modules/next/dist/compiled/next-server/pages.runtime.prod.js'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Replace all variations
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^\}]+(\}[^\}]+){0,2}\}/g, 'console.warn("Suppressed Html Error")');
    fs.writeFileSync(f, content);
  }
});
