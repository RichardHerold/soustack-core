import { readFileSync, existsSync } from 'fs';
import path from 'path';

describe('browser build', () => {
  it('does not pull node-only built-ins', () => {
    // #region agent log
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browser-build.test.ts:5',message:'test entry',data:{__dirname:__dirname,cwd:process.cwd()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const distDir = path.resolve(__dirname, '..', 'dist');
    const outputs = ['index.js', 'index.mjs'];
    // #region agent log
    fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browser-build.test.ts:7',message:'distDir resolved',data:{distDir,__dirname:__dirname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    for (const file of outputs) {
      const full = path.join(distDir, file);
      // #region agent log
      fetch('http://127.0.0.1:7255/ingest/4f34f152-5cff-4133-a069-6f90159cb43b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browser-build.test.ts:10',message:'checking file',data:{file,full,exists:existsSync(full),distDir},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      expect(existsSync(full)).toBe(true); // build should have produced this
      const content = readFileSync(full, 'utf8');

      const forbidden =
        /(node:|require\(["'](?:fs|path|undici)["']\)|from ["'](?:fs|path|undici)["'])/;
      expect(content).not.toMatch(forbidden);
    }
  });
});
