import * as fs from 'fs';
import * as path from 'path';
import { scaleRecipe } from '../src/parser';
import { validateRecipe } from '../src/validator';
import { fromSchemaOrg } from '../src/fromSchemaOrg';
import { toSchemaOrg } from '../src/toSchemaOrg';
import { scrapeRecipe } from '../src/scraper/index';

const [, , command, ...args] = process.argv;

async function main() {
  try {
  switch (command) {
    case 'validate':
      await handleValidate(args);
      break;
      case 'scale':
        await handleScale(args);
        break;
      case 'import':
        await handleImport(args);
        break;
      case 'export':
        await handleExport(args);
        break;
      case 'scrape':
        await handleScrape(args);
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log('Usage:');
  console.log('  npx soustack validate <soustack.json> [--profile <name>]');
  console.log('  npx soustack scale <soustack.json> <multiplier>');
  console.log('  npx soustack import <schema-org.jsonld> -o <soustack.json>');
  console.log('  npx soustack export <soustack.json> -o <schema-org.jsonld>');
  console.log('  npx soustack scrape <url> -o <soustack.json>');
}

async function handleValidate(args: string[]) {
  const { filePath, profile } = parseValidateArgs(args);
  if (!filePath) throw new Error('Path to recipe JSON is required');
  const recipe = readJsonFile(filePath);
  validateRecipe(recipe, profile ? { profile } : {});
  console.log(`✅ Valid Soustack Recipe${profile ? ` (profile: ${profile})` : ''}`);
}

async function handleScale(args: string[]) {
  const filePath = args[0];
  const multiplier = args[1] ? parseFloat(args[1]) : 1;
  if (!filePath || Number.isNaN(multiplier)) {
    throw new Error('Scale usage: scale <soustack.json> <multiplier>');
  }

  const recipe = readJsonFile(filePath);
  console.log(`\n⚖️  Scaling "${recipe.name}" by ${multiplier}x...\n`);
  const baseYield = recipe.yield?.amount || 1;
  const targetYield = baseYield * multiplier;
  const result = scaleRecipe(recipe, targetYield);

  console.log('--- INGREDIENTS ---');
  result.ingredients.forEach(ing => {
    console.log(`• ${ing.text}`);
  });

  console.log('\n--- TIMING ---');
  console.log(`Total Time: ${result.timing.total} minutes`);
  console.log(`(Active: ${result.timing.active}m | Passive: ${result.timing.passive}m)`);
}

async function handleImport(args: string[]) {
  const filePath = args[0];
  const outputPath = resolveOutputPath(args.slice(1));
  if (!filePath) throw new Error('Import usage: import <schema-org.json> -o <soustack.json>');

  const schemaOrg = readJsonFile(filePath);
  const soustack = fromSchemaOrg(schemaOrg);
  if (!soustack) {
    throw new Error('No valid Schema.org recipe found in input');
  }
  writeOutput(soustack, outputPath);
  console.log(`✅ Converted Schema.org → Soustack${outputPath ? ` (${outputPath})` : ''}`);
}

async function handleExport(args: string[]) {
  const filePath = args[0];
  const outputPath = resolveOutputPath(args.slice(1));
  if (!filePath) throw new Error('Export usage: export <soustack.json> -o <schema-org.jsonld>');

  const soustack = readJsonFile(filePath);
  const schemaOrg = toSchemaOrg(soustack);
  writeOutput(schemaOrg, outputPath);
  console.log(`✅ Converted Soustack → Schema.org${outputPath ? ` (${outputPath})` : ''}`);
}

async function handleScrape(args: string[]) {
  const url = args[0];
  const outputPath = resolveOutputPath(args.slice(1));
  if (!url) throw new Error('Scrape usage: scrape <url> -o <soustack.json>');

  const recipe = await scrapeRecipe(url);
  writeOutput(recipe, outputPath);
  console.log(`✅ Scraped recipe from ${url}${outputPath ? ` (${outputPath})` : ''}`);
}

function readJsonFile(relativePath: string) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Unable to parse JSON in ${absolutePath}`);
  }
}

function resolveOutputPath(args: string[]): string | undefined {
  const index = args.findIndex(arg => arg === '-o' || arg === '--output');
  if (index === -1) return undefined;
  const target = args[index + 1];
  if (!target) {
    throw new Error('Output flag provided without a path');
  }
  return target;
}

function parseValidateArgs(args: string[]): { filePath?: string; profile?: string } {
  let filePath: string | undefined;
  let profile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile') {
      profile = args[i + 1];
      if (!profile) {
        throw new Error('Profile flag provided without a name');
      }
      i++;
    } else if (!filePath) {
      filePath = arg;
    }
  }

  return { filePath, profile };
}

function writeOutput(data: unknown, outputPath?: string) {
  const serialized = JSON.stringify(data, null, 2);
  if (!outputPath) {
    console.log(serialized);
    return;
  }

  const absolutePath = path.resolve(outputPath);
  fs.writeFileSync(absolutePath, serialized, 'utf-8');
}

main();