import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = path.resolve(__dirname, '../..');

console.log('🔒 ProcureFlow Secret Scanner (npm run check:secrets)');
console.log('===================================================\n');

let failed = false;

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: rootDir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check 1: Real .env files must be gitignored
function checkEnvFiles() {
  const envFiles: string[] = [];
  function findEnv(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        findEnv(full);
      } else if (e.name.startsWith('.env') && e.name !== '.env.example') {
        envFiles.push(full);
      }
    }
  }
  findEnv(rootDir);

  if (!isGitRepo()) {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignoreContent = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';
    const hasEnvRule =
      gitignoreContent.includes('.env') && gitignoreContent.includes('!.env.example');
    if (envFiles.length > 0) {
      const relList = envFiles.map((f) => path.relative(rootDir, f)).join(', ');
      console.log(
        `ℹ️ INFO: Not a git repository yet. Found real .env file(s) (${relList}) — they must be ignored by .gitignore before the first commit.`
      );
    }
    if (hasEnvRule) {
      console.log('✅ PASS: .gitignore is configured to ignore all real .env files.');
    } else {
      console.error('❌ FAIL: .gitignore is missing .env ignore rules.');
      failed = true;
    }
    return;
  }

  let unignored = false;
  for (const f of envFiles) {
    const rel = path.relative(rootDir, f).replace(/\\/g, '/');
    try {
      execSync(`git check-ignore "${rel}"`, { cwd: rootDir, stdio: 'pipe' });
    } catch {
      console.error(`❌ FAIL: Unignored env file found: ${rel}`);
      unignored = true;
    }
  }

  if (unignored) {
    failed = true;
  } else {
    console.log('✅ PASS: All real .env files are properly ignored by git.');
  }
}

// Check 2: Pattern scan in source files (excluding real .env files which are gitignored)
const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'Google AI Studio API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
  {
    name: 'JWT Secret Token',
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
  },
  {
    name: 'Live Supabase Service Role Key',
    regex: /SUPABASE_SERVICE_ROLE_KEY=(?!your_supabase_service_role_key_here)[A-Za-z0-9._-]{20,}/
  },
  {
    name: 'Live Postgres Password in URL',
    regex: /postgresql:\/\/[^:]+:(?!your_db_password|\[YOUR-PASSWORD\]|<password>)[^@]+@/
  }
];

function scanSourceFiles() {
  let leaks = false;
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (['node_modules', '.git', 'dist', '.vite', 'build'].includes(e.name)) continue;
      if (e.name.startsWith('.env') && e.name !== '.env.example') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (
        e.isFile() &&
        (/\.(ts|tsx|js|jsx|json|sql|md|html)$/.test(e.name) || e.name === '.env.example')
      ) {
        if (e.name === 'check-secrets.ts' || e.name === 'package-lock.json') continue;
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          for (const p of PATTERNS) {
            if (p.regex.test(line)) {
              const rel = path.relative(rootDir, full);
              console.error(`❌ FAIL: Potential ${p.name} pattern in ${rel}:${idx + 1}`);
              leaks = true;
            }
          }
        });
      }
    }
  }
  walk(rootDir);

  if (leaks) {
    failed = true;
  } else {
    console.log('✅ PASS: No hardcoded API keys or live credentials in source files.');
  }
}

// Check 3: client/dist bundle leakage check
function checkClientDist() {
  const distDir = path.resolve(rootDir, 'client/dist');
  if (!fs.existsSync(distDir)) {
    console.log('ℹ️ SKIP: client/dist does not exist yet (run build first for client bundle check).');
    return;
  }

  const forbiddenWords = ['service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'];
  let distLeak = false;

  function walkDist(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walkDist(full);
      } else if (e.isFile() && /\.(js|html|css|map)$/.test(e.name)) {
        const content = fs.readFileSync(full, 'utf-8');
        for (const word of forbiddenWords) {
          if (content.includes(word)) {
            console.error(
              `❌ FAIL: Forbidden server secret identifier "${word}" found in client/dist/${path.relative(
                distDir,
                full
              )}`
            );
            distLeak = true;
          }
        }
        for (const p of PATTERNS) {
          if (p.regex.test(content)) {
            console.error(
              `❌ FAIL: Potential ${p.name} pattern found in client/dist/${path.relative(
                distDir,
                full
              )}`
            );
            distLeak = true;
          }
        }
      }
    }
  }
  walkDist(distDir);

  if (distLeak) {
    failed = true;
  } else {
    console.log('✅ PASS: client/dist is completely free of server secret keys.');
  }
}

checkEnvFiles();
scanSourceFiles();
checkClientDist();

console.log('\n===================================================');
if (failed) {
  console.error('❌ SECRET SCAN FAILED: Remove leaked secrets before committing!');
  process.exit(1);
} else {
  console.log('🎉 ALL SECRET SCAN CHECKS PASSED!\n');
  process.exit(0);
}
