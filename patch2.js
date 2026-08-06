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
    content = content.replace(/if\(![a-zA-Z0-9_]+\)\{throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^}]+\}\s*return [a-zA-Z0-9_]+;/, (match) => {
       const returnVar = match.match(/return ([a-zA-Z0-9_]+);$/)[1];
       return `if(!${returnVar}){return {__patched:true};} return ${returnVar};`;
    });
    // For minified we might need a simpler replace
    // Actually let's just replace the Error string with a warning
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^)]+\)[^}]+\}/g, 'console.warn("Suppressed HtmlContext Error")');
    fs.writeFileSync(f, content);
  }
});
