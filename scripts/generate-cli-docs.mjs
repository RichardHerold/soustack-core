import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CLI_PATH = path.join(ROOT_DIR, 'dist', 'bin', 'cli.js');
const DOCS_DIR = path.join(ROOT_DIR, 'docs', 'cli');

/**
 * Check if CLI file exists, exit with error if not
 */
function ensureCliExists() {
  if (!fs.existsSync(CLI_PATH)) {
    console.error('Missing dist/bin/cli.js. Run `npm run build` first.');
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
    const errorMessage = `Error running command: soustack ${commandName}`;
    if (error.stderr) {
      throw new Error(`${errorMessage}\n${error.stderr}`);
    }
    throw new Error(errorMessage);
  }
}

/**
 * Extract command names from the delimited commands block in help output
 * Parses only the section between --- COMMANDS BEGIN --- and --- COMMANDS END ---
 */
function extractCommands(helpOutput) {
  const lines = helpOutput.split('\n');
  const commands = [];
  
  // Find the delimited block
  let inCommandsBlock = false;
  const commandsBeginMarker = '--- COMMANDS BEGIN ---';
  const commandsEndMarker = '--- COMMANDS END ---';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for start marker
    if (trimmed === commandsBeginMarker) {
      inCommandsBlock = true;
      continue;
    }
    
    // Check for end marker
    if (trimmed === commandsEndMarker) {
      break;
    }
    
    // If we're in the commands block, extract command tokens
    if (inCommandsBlock) {
      // Skip blank lines and the "Commands:" header
      if (!trimmed || trimmed === 'Commands:') {
        continue;
      }
      
      // Extract the first word (command token) from lines like:
      // "  check     Generate JSON conformance report for a recipe file"
      // "  validate  Validate recipe files against schema and conformance rules"
      const match = trimmed.match(/^\s*(\w+)/);
      if (match) {
        const cmd = match[1];
        // Skip if it's already in the list (avoid duplicates)
        if (!commands.includes(cmd)) {
          commands.push(cmd);
        }
      }
    }
  }
  
  // If we never found the delimiters, throw an error
  if (!inCommandsBlock || commands.length === 0) {
    console.error('Could not find delimited commands block in `soustack --help` output.');
    process.exit(1);
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
    'Generated from `soustack --help`. Do not edit manually.',
    '',
    '## Commands',
    '',
  ];
  
  for (const cmd of commands) {
    lines.push(`- \`soustack ${cmd}\` → ${cmd}.md`);
  }
  
  return lines.join('\n') + '\n';
}

/**
 * Normalize paths in help output to avoid environment-specific absolute paths
 * Replaces absolute paths with relative paths or placeholders
 */
function normalizePathsInOutput(output, rootDir) {
  // Replace absolute paths with relative paths
  return output.replace(new RegExp(rootDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.');
}

/**
 * Generate individual command documentation
 */
function generateCommandDoc(cmd, helpOutput) {
  // Normalize paths to avoid environment-specific absolute paths in docs
  const normalizedOutput = normalizePathsInOutput(helpOutput, ROOT_DIR);
  
  const lines = [
    `# soustack ${cmd}`,
    '',
    `Generated from \`soustack ${cmd} --help\`. Do not edit manually.`,
    '',
    '```text',
    normalizedOutput.trim(),
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
  
  // Extract commands from delimited block
  console.log('Extracting commands from delimited block...');
  const commands = extractCommands(topLevelHelp);
  
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
