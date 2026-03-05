const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

let depth = 0;
let start = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<div class="layout"')) {
        start = i;
        depth = 1;
        continue;
    }
    if (depth > 0) {
        let c1 = (lines[i].match(/<div(>|\s[^>]*>)/g) || []).length;
        let c2 = (lines[i].match(/<\/div>/g) || []).length;
        depth += c1 - c2;
        if (depth <= 0) {
            console.log('Layout closes at line: ' + (i + 1));
            break;
        }
    }
}
