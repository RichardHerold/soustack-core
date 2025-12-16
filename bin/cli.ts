import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';
import { scaleRecipe } from '../src/parser';
import { fromSchemaOrg } from '../src/fromSchemaOrg';
import { toSchemaOrg } from '../src/toSchemaOrg';
import { scrapeRecipe } from '../src/scraper/index';
import {
  validateRecipe,
  type NormalizedError,
  type NormalizedWarning,
  type ValidateOptions,
} from '../src/validator';

interface ValidationOutcome {
  file: string;
  profile?: ProfileName;
  valid: boolean;
  warnings: NormalizedWarning[];
  errors: NormalizedError[];
}

interface ValidationFlags {
  profile?: ProfileName;
  strict: boolean;
  json: boolean;
}

interface ValidationSummary {
  strict: boolean;
  total: number;
  passed: number;
  failed: number;
}

type ConvertDirection = 'schemaorg-to-soustack' | 'soustack-to-schemaorg';
type ProfileName = NonNullable<ValidateOptions['profile']>;

type KnownCommand =
  | 'validate'
  | 'convert'
  | 'import'
  | 'scale'
  | 'scrape'
  | 'test';

const supportedProfiles: ProfileName[] = ['base', 'cookable', 'scalable', 'quantified', 'illustrated', 'schedulable'];

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  try {
    switch (command as KnownCommand) {
      case 'validate':
        await handleValidate(args);
        return;
      case 'convert':
        await handleConvert(args);
        return;
      case 'import':
        await handleImport(args);
        return;
      case 'scale':
        await handleScale(args);
        return;
      case 'scrape':
        await handleScrape(args);
        return;
      case 'test':
        await handleTest(args);
        return;
      default:
        printUsage();
        process.exitCode = 1;
    }
  } catch (error: any) {
    console.error(`❌ ${error?.message ?? error}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log('Usage:');
  console.log('  soustack validate <fileOrGlob> [--profile <name>] [--strict] [--json]');
  console.log('  soustack convert --from <schemaorg|soustack> --to <schemaorg|soustack> <input> [-o <output>]');
  console.log('  soustack import --url <url> [-o <soustack.json>]');
  console.log('  soustack test [--profile <name>] [--strict] [--json]');
  console.log('  soustack scale <soustack.json> <multiplier>');
  console.log('  soustack scrape <url> -o <soustack.json>');
}

async function handleValidate(args: string[]) {
  const { target, profile, strict, json } = parseValidateArgs(args);
  if (!target) throw new Error('Path or glob to Soustack recipe JSON is required');

  const files = expandTargets(target);
  if (files.length === 0) throw new Error(`No files matched pattern: ${target}`);

  const results = files.map((file) => validateFile(file, profile));
  reportValidation(results, { profile, strict, json });
}

async function handleTest(args: string[]) {
  const { profile, strict, json } = parseValidationFlags(args);
  const cwd = process.cwd();
  const files = globSync('**/*.soustack.json', {
    cwd,
    absolute: true,
    nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  }).map((file) => path.resolve(cwd, file));

  if (files.length === 0) {
    console.log('No *.soustack.json files found in the current repository.');
    return;
  }

  const results = files.map((file) => validateFile(file, profile));
  reportValidation(results, { profile, strict, json, context: 'test' });
}

async function handleConvert(args: string[]) {
  const { from, to, inputPath, outputPath } = parseConvertArgs(args);
  const fromKey = from?.toLowerCase();
  const toKey = to?.toLowerCase();

  if (!inputPath || !fromKey || !toKey) {
    throw new Error('Convert usage: convert --from <schemaorg|soustack> --to <schemaorg|soustack> <input> [-o <output>]');
  }

  const direction = resolveConvertDirection(fromKey, toKey);
  if (!direction) {
    throw new Error(`Unsupported conversion from "${from}" to "${to}"`);
  }

  const input = readJsonFile(inputPath);
  const result = direction === 'schemaorg-to-soustack' ? fromSchemaOrg(input) : toSchemaOrg(input as any);

  if (!result) {
    throw new Error('Unable to convert input with the provided formats.');
  }

  writeOutput(result, outputPath);
  console.log(`✅ Converted ${fromKey} → ${toKey}${outputPath ? ` (${outputPath})` : ''}`);
}

async function handleImport(args: string[]) {
  const { url, outputPath } = parseImportArgs(args);
  if (!url) throw new Error('Import usage: import --url <url> [-o <soustack.json>]');

  const recipe = await scrapeRecipe(url);
  writeOutput(recipe, outputPath);
  console.log(`✅ Imported recipe from ${url}${outputPath ? ` (${outputPath})` : ''}`);
}

async function handleScale(args: string[]) {
  const filePath = args[0];
  const multiplier = args[1] ? parseFloat(args[1]) : 1;
  if (!filePath || Number.isNaN(multiplier)) {
    throw new Error('Scale usage: scale <soustack.json> <multiplier>');
  }

  const recipe = readJsonFile(filePath);
  console.log(`\n⚖️  Scaling "${(recipe as any)?.name ?? filePath}" by ${multiplier}x...\n`);
  const result = scaleRecipe(recipe as any, { multiplier });

  console.log(JSON.stringify(result, null, 2));
}

async function handleScrape(args: string[]) {
  const url = args[0];
  const outputPath = resolveOutputPath(args.slice(1));
  if (!url) throw new Error('Scrape usage: scrape <url> -o <soustack.json>');

  const recipe = await scrapeRecipe(url);
  writeOutput(recipe, outputPath);
  console.log(`✅ Scraped recipe from ${url}${outputPath ? ` (${outputPath})` : ''}`);
}

function parseValidateArgs(args: string[]): { target?: string } & ValidationFlags {
  let profile: ProfileName | undefined;
  let strict = false;
  let json = false;
  let target: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--profile':
        profile = normalizeProfile(args[i + 1]);
        i++;
        break;
      case '--strict':
        strict = true;
        break;
      case '--json':
        json = true;
        break;
      default:
        if (!arg.startsWith('--') && !target) {
          target = arg;
        }
        break;
    }
  }

  return { profile, strict, json, target };
}

function parseValidationFlags(args: string[]): ValidationFlags {
  const { profile, strict, json } = parseValidateArgs(args);
  return { profile, strict, json };
}

function normalizeProfile(value?: string): ProfileName | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as ProfileName;
  if (supportedProfiles.includes(normalized)) {
    return normalized;
  }
  throw new Error(`Unknown Soustack profile: ${value}`);
}

function parseConvertArgs(args: string[]): { from?: string; to?: string; inputPath?: string; outputPath?: string } {
  let from: string | undefined;
  let to: string | undefined;
  let outputPath: string | undefined;
  let inputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--from':
        from = args[i + 1];
        if (!from) throw new Error('Missing value for --from');
        i++;
        break;
      case '--to':
        to = args[i + 1];
        if (!to) throw new Error('Missing value for --to');
        i++;
        break;
      case '-o':
      case '--output':
        outputPath = args[i + 1];
        if (!outputPath) throw new Error('Missing value for output');
        i++;
        break;
      default:
        if (!inputPath && !arg.startsWith('--')) {
          inputPath = arg;
        }
        break;
    }
  }

  return { from, to, inputPath, outputPath };
}

function parseImportArgs(args: string[]): { url?: string; outputPath?: string } {
  let url: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url') {
      url = args[i + 1];
      if (!url) {
        throw new Error('URL flag provided without a value');
      }
      i++;
    } else if (arg === '-o' || arg === '--output') {
      outputPath = args[i + 1];
      if (!outputPath) {
        throw new Error('Output flag provided without a path');
      }
      i++;
    }
  }

  return { url, outputPath };
}

function resolveConvertDirection(from: string, to: string): ConvertDirection | null {
  if (from === 'schemaorg' && to === 'soustack') return 'schemaorg-to-soustack';
  if (from === 'soustack' && to === 'schemaorg') return 'soustack-to-schemaorg';
  return null;
}

function expandTargets(target: string): string[] {
  const matches = globSync(target, { absolute: true, nodir: true });
  const unique = Array.from(new Set(matches.map((match) => path.resolve(match))));
  return unique;
}

function validateFile(file: string, profile?: ProfileName): ValidationOutcome {
  const recipe = readJsonFile(file);
  const result = validateRecipe(recipe, profile ? { profile } : {});
  return {
    file,
    profile,
    valid: result.valid,
    warnings: result.warnings,
    errors: result.errors,
  };
}

function reportValidation(
  results: ValidationOutcome[],
  options: ValidationFlags & { profile?: ProfileName; context?: 'test' | 'validate' },
) {
  const summary: ValidationSummary = {
    strict: options.strict,
    total: results.length,
    passed: 0,
    failed: 0,
  };

  const serializable = results.map((result) => {
    const passed = isEffectivelyValid(result, options.strict);
    if (passed) summary.passed += 1;
    else summary.failed += 1;

    return {
      file: path.relative(process.cwd(), result.file),
      profile: result.profile,
      valid: result.valid,
      warnings: result.warnings,
      errors: result.errors,
      passed,
    };
  });

  if (options.json) {
    console.log(JSON.stringify({ summary, results: serializable }, null, 2));
  } else {
    serializable.forEach((entry) => {
      const prefix = entry.passed ? '✅' : '❌';
      console.log(`${prefix} ${entry.file}`);
      if (!entry.passed && entry.errors.length) {
        entry.errors.forEach((error) => {
          console.log(`   • [${error.path}] ${error.message}`);
        });
      }
      if (!entry.passed && options.strict && entry.warnings.length) {
        entry.warnings.forEach((warning) => {
          console.log(`   • [${warning.path}] ${warning.message} (warning)`);
        });
      }
    });

    const contextLabel = options.context === 'test' ? 'Test summary' : 'Validation summary';
    console.log(`${contextLabel}: ${summary.passed}/${summary.total} files valid${options.strict ? ' (strict)' : ''}`);
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

function isEffectivelyValid(result: ValidationOutcome, strict: boolean): boolean {
  return result.valid && (!strict || result.warnings.length === 0);
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
  const index = args.findIndex((arg) => arg === '-o' || arg === '--output');
  if (index === -1) return undefined;
  const target = args[index + 1];
  if (!target) {
    throw new Error('Output flag provided without a path');
  }
  return target;
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

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error?.message ?? error}`);
    process.exit(1);
  });
}
