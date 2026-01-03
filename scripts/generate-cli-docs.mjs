import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CLI_PATH = path.join(ROOT_DIR, 'dist', 'bin', 'cli.js');
const CLI_PATH_ALTERNATIVE = path.join(ROOT_DIR, 'dist', 'cli', 'index.js');
const DOCS_DIR = path.join(ROOT_DIR, 'docs', 'cli');

/**
 * Check if CLI file exists, exit with error if not
 */
function ensureCliExists() {
  if (!fs.existsSync(CLI_PATH)) {
    // Check alternative location and provide helpful error
    if (fs.existsSync(CLI_PATH_ALTERNATIVE)) {
      console.error(`Error: CLI entrypoint not found at ${CLI_PATH}`);
      console.error(`Found CLI at alternative location: ${CLI_PATH_ALTERNATIVE}`);
      console.error('Please update the script to use the correct path, or ensure the CLI is built to dist/bin/cli.js');
    } else {
      console.error(`Error: CLI entrypoint not found at ${CLI_PATH}`);
      console.error('Please run "npm run build" first to build the CLI.');
    }
    process.exit(1);
  }
}

/**
 * Run CLI command and capture stdout
 * Handles non-zero exit codes (CLI shows usage even when exiting with error)
 */
function runCliCommand(args) {
  try {
    const command = ['node', CLI_PATH, ...args].join(' ');
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // CLI commands may exit with non-zero but still output usage/help to stdout
    if (error.stdout && error.stdout.trim()) {
      return error.stdout;
    }
    // If no stdout but stderr has content, use that
    if (error.stderr && error.stderr.trim()) {
      return error.stderr;
    }
    // Otherwise, this is a real error
    const commandName = args[0] || '--help';
    console.error(`Error running command: soustack ${commandName}`);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

/**
 * Extract command names from top-level help output
 * Ignores aliases, headings, and empty lines
 */
function extractCommands(helpOutput) {
  const lines = helpOutput.split('\n');
  const commands = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines, headings, and lines that don't look like commands
    if (!trimmed || trimmed.startsWith('Usage:') || trimmed.startsWith('Profiles:')) {
      continue;
    }
    
    // Look for lines that start with "  soustack <command>"
    // Match pattern: "  soustack <cmd> ..."
    const match = trimmed.match(/^\s*soustack\s+(\w+)/);
    if (match) {
      const cmd = match[1];
      // Skip if it's already in the list (avoid duplicates)
      if (!commands.includes(cmd)) {
        commands.push(cmd);
      }
    }
  }
  
  // Sort commands for deterministic output
  commands.sort();
  
  return commands;
}

/**
 * Generate README.md with command list
 */
function generateReadme(commands) {
  const lines = [
    '# Soustack CLI Reference',
    '',
    'Command-line interface for the Soustack recipe format.',
    '',
    '## Commands',
    '',
  ];
  
  for (const cmd of commands) {
    lines.push(`- [\`soustack ${cmd}\`](./${cmd}.md)`);
  }
  
  return lines.join('\n') + '\n';
}

/**
 * Generate individual command documentation
 */
function generateCommandDoc(cmd, helpOutput) {
  const lines = [
    `# soustack ${cmd}`,
    '',
    '```',
    helpOutput.trim(),
    '```',
    '',
  ];
  
  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  ensureCliExists();
  
  // Get top-level help
  console.log('Fetching top-level help...');
  const topLevelHelp = runCliCommand(['--help']);
  
  // Extract commands
  console.log('Extracting commands...');
  const commands = extractCommands(topLevelHelp);
  
  if (commands.length === 0) {
    console.error('Error: No commands found in help output');
    console.error('Help output:');
    console.error(topLevelHelp);
    process.exit(1);
  }
  
  console.log(`Found ${commands.length} commands: ${commands.join(', ')}`);
  
  // Ensure docs directory exists
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
  
  // Generate README
  console.log('Generating README.md...');
  const readmePath = path.join(DOCS_DIR, 'README.md');
  fs.writeFileSync(readmePath, generateReadme(commands), 'utf-8');
  
  // Generate individual command docs
  for (const cmd of commands) {
    console.log(`Generating ${cmd}.md...`);
    try {
      const helpOutput = runCliCommand([cmd, '--help']);
      const docPath = path.join(DOCS_DIR, `${cmd}.md`);
      fs.writeFileSync(docPath, generateCommandDoc(cmd, helpOutput), 'utf-8');
    } catch (error) {
      console.error(`Failed to generate docs for command: ${cmd}`);
      throw error;
    }
  }
  
  console.log(`✅ Generated CLI documentation in ${DOCS_DIR}`);
}

main();

