const https = require('https');
const fs = require('fs');
const path = require('path');

const SCHEMA_URL = 'https://raw.githubusercontent.com/RichardHerold/soustack-spec/main/soustack.schema.json';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'schema.json');

console.log(`Downloading schema from ${SCHEMA_URL}...`);

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
      
      // Write to file
      fs.writeFileSync(OUTPUT_PATH, data, 'utf8');
      console.log(`✓ Schema downloaded successfully to ${OUTPUT_PATH}`);
    } catch (error) {
      console.error(`Error: Invalid JSON received:`, error.message);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error(`Error downloading schema:`, error.message);
  process.exit(1);
});
