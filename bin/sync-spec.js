const https = require('https');
const fs = require('fs');
const path = require('path');
const { soustackSpecTag, soustackSpecVersion } = require('../package.json');

if (!soustackSpecTag) {
  console.error('Error: soustackSpecTag is not defined in package.json');
  process.exit(1);
}

const SCHEMA_URL = `https://raw.githubusercontent.com/RichardHerold/soustack-spec/${soustackSpecTag}/soustack.schema.json`;
const OUTPUT_PATHS = [
  path.join(__dirname, '..', 'src', 'schema.json'),
  path.join(__dirname, '..', 'src', 'soustack.schema.json'),
];

console.log(`Downloading schema v${soustackSpecVersion || 'unknown'} from ${SCHEMA_URL}...`);

https.get(SCHEMA_URL, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Error: Failed to download schema. Status code: ${response.statusCode}`);
    process.exit(1);
  }

  let data = '';
  response.on('data', (chunk) => {
    data += chunk;
  });

  response.on('end', () => {
    try {
      // Validate it's valid JSON
      JSON.parse(data);

      OUTPUT_PATHS.forEach((outputPath) => {
        fs.writeFileSync(outputPath, data, 'utf8');
        console.log(`✓ Schema downloaded successfully to ${outputPath}`);
      });
    } catch (error) {
      console.error(`Error: Invalid JSON received:`, error.message);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error(`Error downloading schema:`, error.message);
  process.exit(1);
});
