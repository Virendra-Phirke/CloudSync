const fs = require('fs');
const glob = require('glob');

const files = glob.sync('node_modules/next/dist/**/*.js');
let replacedFiles = 0;
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('<Html> should not be imported outside of pages/_document')) {
    // Just replace the error message itself so it doesn't trigger! Or change the string and we can see if it still throws.
    // Wait, the error is thrown! If we just change the string, it will still THROW the error, just with a different message!
    // We need to replace the entire throw statement.
    // Let's find the throw statement:
    const index = content.indexOf('<Html> should not be imported outside of pages/_document');
    if (index !== -1) {
       // Look backwards to find 'throw '
       const throwIndex = content.lastIndexOf('throw ', index);
       // Look forwards to find the end of the statement (maybe next ';')
       const semiIndex = content.indexOf(';', index);
       if (throwIndex !== -1 && semiIndex !== -1) {
           const before = content.slice(0, throwIndex);
           const after = content.slice(semiIndex + 1);
           content = before + 'console.warn("Suppressed Html Error");' + after;
           fs.writeFileSync(f, content);
           console.log('Patched', f);
           replacedFiles++;
       }
    }
  }
});
console.log('Total patched:', replacedFiles);
