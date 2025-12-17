import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const BUILD_LOCK_FILE = path.join(__dirname, '..', '.build-lock');
const MAX_LOCK_WAIT = 30000; // 30 seconds
const LOCK_POLL_INTERVAL = 100; // 100ms

function sleepSync(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
}

function acquireLock(): boolean {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_LOCK_WAIT) {
    try {
      writeFileSync(BUILD_LOCK_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        const waitTime = Math.min(LOCK_POLL_INTERVAL, MAX_LOCK_WAIT - (Date.now() - startTime));
        if (waitTime > 0) {
          sleepSync(waitTime);
        }
        continue;
      }
      throw error;
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (existsSync(BUILD_LOCK_FILE)) {
      unlinkSync(BUILD_LOCK_FILE);
    }
  } catch (e) {
    // Ignore errors when releasing lock
  }
}

function buildDist() {
  const distDir = path.resolve(__dirname, '..', 'dist');
  const requiredFiles = ['index.js', 'index.mjs'];
  const allFilesExist = requiredFiles.every(file => 
    existsSync(path.join(distDir, file))
  );
  
  // If files already exist, skip build (another test may have built it)
  if (allFilesExist) {
    return;
  }
  
  // Acquire lock to prevent concurrent builds
  if (!acquireLock()) {
    // If we can't get the lock, wait a bit and check if files exist now
    // (another process may have built them while we waited)
    sleepSync(500);
    const filesExistAfterWait = requiredFiles.every(file => 
      existsSync(path.join(distDir, file))
    );
    if (filesExistAfterWait) {
      return;
    }
    throw new Error('Failed to acquire build lock - timeout');
  }
  
  try {
    // Double-check files don't exist (another process may have built them while we waited for lock)
    const filesExistAfterLock = requiredFiles.every(file => 
      existsSync(path.join(distDir, file))
    );
    if (filesExistAfterLock) {
      return;
    }
    
    const result = execSync('npm run build -- --silent', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (error: any) {
    throw error;
  } finally {
    releaseLock();
  }
}

describe('browser build', () => {
  beforeAll(() => {
    buildDist();
  });

  it('does not pull node-only built-ins', () => {
    const distDir = path.resolve(__dirname, '..', 'dist');
    const outputs = ['index.js', 'index.mjs'];
    const forbidden = /(require\(["'](?:fs|path|undici)["']\)|from ["'](?:fs|path|undici)["']|node:(?:fs|path))/;

    outputs.forEach(file => {
      const content = readFileSync(path.join(distDir, file), 'utf8');
      expect(content).not.toMatch(forbidden);
    });
  });
});
