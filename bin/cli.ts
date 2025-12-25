import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';
import { scaleRecipe } from '../src/parser';
import { fromSchemaOrg } from '../src/fromSchemaOrg';
import { toSchemaOrg } from '../src/toSchemaOrg';
import { scrapeRecipe } from '../src/scraper/index';
import { withCanonicalSchema } from '../src/schemaMetadata';
import {
  validateRecipe,
  type NormalizedError,
  type ValidateOptions,
  type ValidateMode,
  type ValidateResult,
} from '../src/validator';

interface ValidationOutcome {
  file: string;
  profile?: ProfileName;
  ok: boolean;
  warnings: string[];
  schemaErrors: NormalizedError[];
  conformanceIssues: ValidateResult['conformanceIssues'];
}

interface ValidationFlags {
  profile?: ProfileName;
  forceProfile: boolean;
  strict: boolean;
  json: boolean;
  mode: ValidateMode;
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
  | 'check'
  | 'validate'
  | 'convert'
  | 'import'
  | 'scale'
  | 'scrape'
  | 'test';

const supportedProfiles: ProfileName[] = [
  'base',
  'equipped',
  'illustrated',
  'lite',
  'prepped',
  'scalable',
  'timed',
];

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  try {
    switch (command as KnownCommand) {
      case 'check':
        await handleCheck(args);
        return;
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
  console.log('  soustack check <file> --json');
  console.log(
    '  soustack validate <fileOrGlob> [--profile <name>] [--force-profile] [--schema-only] [--strict] [--json]',
  );
  console.log('  soustack convert --from <schemaorg|soustack> --to <schemaorg|soustack> <input> [-o <output>]');
  console.log('  soustack import --url <url> [-o <soustack.json>]');
  console.log('  soustack test [--profile <name>] [--force-profile] [--schema-only] [--strict] [--json]');
  console.log('  soustack scale <soustack.json> <multiplier>');
  console.log('  soustack scrape <url> -o <soustack.json>');
  console.log(`\nProfiles: ${supportedProfiles.join(', ')}`);
}

async function handleCheck(args: string[]) {
  const { target, json } = parseCheckArgs(args);
  if (!target) throw new Error('Path to Soustack recipe JSON is required');
  if (!json) throw new Error('Check usage: check <file> --json');

  try {
    const input = readJsonFile(target);
    const result = validateRecipe(input, { mode: 'full', includeNormalized: true });
    const report = buildConformanceReport(result);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error: any) {
    const report = buildConformanceReport({
      ok: false,
      warnings: [],
      schemaErrors: [{ path: '/', message: error?.message || 'Validation failed' }],
      conformanceIssues: [],
      normalizedRecipe: undefined,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

async function handleValidate(args: string[]) {
  const { target, profile, forceProfile, strict, json, mode } = parseValidateArgs(args);
  if (!target) throw new Error('Path or glob to Soustack recipe JSON is required');

  const files = expandTargets(target);
  if (files.length === 0) throw new Error(`No files matched pattern: ${target}`);

  const results = files.map((file) => validateFile(file, profile, mode, forceProfile));
  reportValidation(results, { profile, forceProfile, strict, json, mode });
}

async function handleTest(args: string[]) {
  const { profile, forceProfile, strict, json, mode } = parseValidationFlags(args);
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

  const results = files.map((file) => validateFile(file, profile, mode, forceProfile));
  reportValidation(results, { profile, forceProfile, strict, json, mode, context: 'test' });
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
  let forceProfile = false;
  let strict = false;
  let json = false;
  let mode: ValidateMode = 'full';
  let target: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--profile':
        profile = normalizeProfile(args[i + 1]);
        i++;
        break;
      case '--force-profile':
        forceProfile = true;
        break;
      case '--schema-only':
        mode = 'schema';
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

  return { profile, forceProfile, strict, json, mode, target };
}

function parseCheckArgs(args: string[]): { target?: string; json: boolean } {
  let json = false;
  let target: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (!arg.startsWith('--') && !target) {
      target = arg;
    }
  }

  return { target, json };
}

function parseValidationFlags(args: string[]): ValidationFlags {
  const { profile, forceProfile, strict, json, mode } = parseValidateArgs(args);
  return { profile, forceProfile, strict, json, mode };
}

function normalizeProfile(value?: string): ProfileName | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as ProfileName;
  if (supportedProfiles.includes(normalized)) {
    return normalized;
  }
  throw new Error(`Unknown Soustack profile: ${value}. Supported profiles: ${supportedProfiles.join(', ')}`);
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

function validateFile(
  file: string,
  profile?: ProfileName,
  mode: ValidateMode = 'full',
  forceProfile = false,
): ValidationOutcome {
  try {
    const recipe = readJsonFile(file);
    const { recipe: validationRecipe, mismatchError } = resolveProfileForValidation(recipe, profile, forceProfile);
    if (mismatchError) {
      return {
        file,
        profile,
        ok: false,
        warnings: [],
        schemaErrors: [mismatchError],
        conformanceIssues: [],
      };
    }
    const result = validateRecipe(validationRecipe, profile ? { profile, mode } : { mode });
    return {
      file,
      profile,
      ok: result.ok,
      warnings: result.warnings,
      schemaErrors: result.schemaErrors,
      conformanceIssues: result.conformanceIssues,
    };
  } catch (error: any) {
    // Return validation outcome with error instead of throwing
    return {
      file,
      profile,
      ok: false,
      warnings: [],
      schemaErrors: [{ path: "/", message: error?.message || "Validation failed", keyword: "error" }],
      conformanceIssues: [],
    };
  }
}

function resolveProfileForValidation(
  recipe: unknown,
  profile?: ProfileName,
  forceProfile = false,
): { recipe: unknown; mismatchError?: NormalizedError } {
  if (!profile) return { recipe };
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return { recipe };
  }

  const recipeProfileRaw = (recipe as { profile?: unknown }).profile;
  const recipeProfile = typeof recipeProfileRaw === 'string' ? recipeProfileRaw.toLowerCase() : undefined;

  if (!recipeProfile) {
    return { recipe: { ...(recipe as object), profile } };
  }

  if (recipeProfile !== profile) {
    if (!forceProfile) {
      return {
        recipe,
        mismatchError: {
          path: '/profile',
          keyword: 'profile',
          message: `Recipe profile "${recipeProfile}" does not match --profile "${profile}". Use --force-profile to override.`,
        },
      };
    }

    return { recipe: { ...(recipe as object), profile } };
  }

  return { recipe };
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
      ok: result.ok,
      warnings: result.warnings,
      schemaErrors: result.schemaErrors,
      conformanceIssues: result.conformanceIssues,
      passed,
    };
  });

  if (options.json) {
    console.log(JSON.stringify({ summary, results: serializable }, null, 2));
  } else {
    serializable.forEach((entry) => {
      const prefix = entry.passed ? '✅' : '❌';
      console.log(`${prefix} ${entry.file}`);
      if (!entry.passed && entry.schemaErrors.length) {
        console.log('   Schema errors:');
        entry.schemaErrors.forEach((error) => {
          console.log(`   • [${error.path}] ${error.message}`);
        });
      }
      if (!entry.passed && entry.conformanceIssues.length) {
        console.log('   Conformance issues:');
        entry.conformanceIssues.forEach((issue) => {
          console.log(`   • [${issue.path}] ${issue.message} (${issue.code})`);
        });
      }
      if (!entry.passed && options.strict && entry.warnings.length) {
        console.log('   Warnings:');
        entry.warnings.forEach((warning) => {
          console.log(`   • ${warning} (warning)`);
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
  return result.ok && (!strict || result.warnings.length === 0);
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
  const serialized = JSON.stringify(prepareOutputPayload(data), null, 2);
  if (!outputPath) {
    console.log(serialized);
    return;
  }

  const absolutePath = path.resolve(outputPath);
  fs.writeFileSync(absolutePath, serialized, 'utf-8');
}

function prepareOutputPayload(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => prepareOutputPayload(entry));
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const looksLikeRecipe =
      'ingredients' in record ||
      'instructions' in record ||
      'profile' in record ||
      'stacks' in record ||
      record['@type'] === 'Recipe';

    if (looksLikeRecipe) {
      return withCanonicalSchema(record);
    }
  }

  return data;
}

function buildConformanceReport(result: ValidateResult) {
  const recipe = result.normalizedRecipe;
  const level = typeof recipe?.level === 'string' ? recipe.level : null;
  const stacks = normalizeStacksForReport(recipe?.stacks);
  const schemaErrors = sortSchemaErrors(result.schemaErrors).map((error) => ({
    path: error.path,
    keyword: error.keyword ?? null,
    message: error.message,
  }));
  const conformanceIssues = sortConformanceIssues(result.conformanceIssues).map((issue) => ({
    code: issue.code,
    path: issue.path,
    severity: issue.severity === 'warning' ? 'warn' : 'error',
    message: issue.message,
  }));

  return {
    ok: result.ok,
    level,
    stacks,
    warnings: result.warnings,
    schemaErrors,
    conformanceIssues,
  };
}

function normalizeStacksForReport(stacks: unknown): Record<string, number> {
  if (!stacks || typeof stacks !== 'object' || Array.isArray(stacks)) return {};
  const entries = Object.entries(stacks).filter(([, value]) => typeof value === 'number');
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function sortSchemaErrors(errors: NormalizedError[]): NormalizedError[] {
  return [...errors].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) return pathCompare;
    const leftKeyword = left.keyword ?? '';
    const rightKeyword = right.keyword ?? '';
    return leftKeyword.localeCompare(rightKeyword);
  });
}

function sortConformanceIssues(issues: ValidateResult['conformanceIssues']): ValidateResult['conformanceIssues'] {
  return [...issues].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) return pathCompare;
    return left.code.localeCompare(right.code);
  });
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error?.message ?? error}`);
    process.exit(1);
  });
}
