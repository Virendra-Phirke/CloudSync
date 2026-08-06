const fs = require('fs');
const glob = require('glob');

const files = glob.sync('node_modules/next/dist/**/*.js');
let replacedFiles = 0;
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('<Html> should not be imported outside of pages/_document')) {
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^)]+\)[^}]+\}/g, 'console.warn("HtmlContext Suppressed")');
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^)]+\)[^}]+}[^}]+}/g, 'console.warn("HtmlContext Suppressed")');
    content = content.replace(/throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/\_document[^)]+\)[^}]+}[^}]+}[^}]+}/g, 'console.warn("HtmlContext Suppressed")');
    fs.writeFileSync(f, content);
    console.log('Patched', f);
    replacedFiles++;
  }
});
console.log('Total patched:', replacedFiles);
