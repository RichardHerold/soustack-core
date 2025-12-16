const https = require('https');
const fs = require('fs');
const path = require('path');
const { soustackSpecTag, soustackSpecVersion } = require('../package.json');

if (!soustackSpecTag) {
  console.error('Error: soustackSpecTag is not defined in package.json');
  process.exit(1);
}

const BASE_URL = `https://raw.githubusercontent.com/RichardHerold/soustack-spec/${soustackSpecTag}`;
const SCHEMA_URL = `${BASE_URL}/soustack.schema.json`;
const OUTPUT_PATHS = [
  path.join(__dirname, '..', 'src', 'schema.json'),
  path.join(__dirname, '..', 'src', 'soustack.schema.json'),
];

const profilesDir = path.join(__dirname, '..', 'src', 'profiles');
const PROFILE_NAMES = ['base', 'cookable', 'quantified', 'illustrated', 'schedulable'];

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}. Status code: ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => resolve(data));
      })
      .on('error', (error) => reject(error));
  });
}

async function main() {
  console.log(`Downloading schema v${soustackSpecVersion || 'unknown'} from ${SCHEMA_URL}...`);

  try {
    const schemaData = await download(SCHEMA_URL);
    JSON.parse(schemaData);

    OUTPUT_PATHS.forEach((outputPath) => {
      fs.writeFileSync(outputPath, schemaData, 'utf8');
      console.log(`✓ Schema downloaded successfully to ${outputPath}`);
    });

    await Promise.all(
      PROFILE_NAMES.map(async (profile) => {
        const profileUrl = `${BASE_URL}/profiles/${profile}.schema.json`;
        const profileData = await download(profileUrl);
        JSON.parse(profileData);
        const outputPath = path.join(profilesDir, `${profile}.schema.json`);
        fs.writeFileSync(outputPath, profileData, 'utf8');
        console.log(`✓ Profile "${profile}" downloaded successfully to ${outputPath}`);
      })
    );
  } catch (error) {
    console.error('Error downloading schema:', error.message);
    process.exit(1);
  }
}

main();
