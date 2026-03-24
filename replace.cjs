const fs = require('fs');
const path = 'components/ProjectDisplay.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace `language={language} />` with `language={language} references={refs} />`
// Only if it's inside a <TextArea ... /> tag.
content = content.replace(/<TextArea([^>]*?)language=\{language\}\s*\/>/g, '<TextArea$1language={language} references={refs} />');

fs.writeFileSync(path, content, 'utf8');
console.log('Done');
