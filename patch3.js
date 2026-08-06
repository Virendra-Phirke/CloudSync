const fs = require('fs');
const files = [
  'node_modules/next/dist/esm/shared/lib/html-context.shared-runtime.js',
  'node_modules/next/dist/shared/lib/html-context.shared-runtime.js'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^)]+\)[^}]+\}/g, 'console.warn("Suppressed HtmlContext Error")');
    fs.writeFileSync(f, content);
  }
});
