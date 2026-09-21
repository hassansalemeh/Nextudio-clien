// Builds the application and assembles the upload package for GoDaddy cPanel "Setup Node.js App".
//   npm run package          (from the repository root)
// Result:  deploy/godaddy/            the folder (this is what runs on the host)
//          deploy/nextudio-control-<date>.zip   the same folder as a ZIP, ready to upload
// Nothing is deployed and no database is touched.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = path.join(root, 'server')
const client = path.join(root, 'client')
const out = path.join(root, 'deploy', 'godaddy')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(' ')}   (in ${path.relative(root, cwd) || '.'})`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

// 1. clean builds (no stale files from earlier builds)
fs.rmSync(path.join(server, 'dist'), { recursive: true, force: true })
fs.rmSync(path.join(client, 'dist'), { recursive: true, force: true })
run(npm, ['run', 'build'], server) // tsc -> server/dist
run(npm, ['run', 'build'], client) // tsc -b && vite build -> client/dist

// 2. assemble the package
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
fs.cpSync(path.join(server, 'dist'), path.join(out, 'dist'), { recursive: true })
fs.cpSync(path.join(client, 'dist'), path.join(out, 'public'), { recursive: true })
fs.cpSync(path.join(server, 'assets'), path.join(out, 'assets'), { recursive: true })
fs.cpSync(path.join(root, 'supabase', 'migrations'), path.join(out, 'migrations'), { recursive: true })
fs.copyFileSync(path.join(root, 'docs', 'DEPLOY-GODADDY.md'), path.join(out, 'DEPLOY-GODADDY.md'))
fs.copyFileSync(path.join(root, 'docs', 'production.env.example'), path.join(out, '.env.example'))

// Startup file for Phusion Passenger (cPanel). It only starts the compiled server.
fs.writeFileSync(
  path.join(out, 'app.js'),
  `// Startup file for cPanel "Setup Node.js App" (Phusion Passenger). It just starts the compiled server.\n` +
    `process.env.NODE_ENV = process.env.NODE_ENV || 'production'\n` +
    `require('./dist/index.js')\n`
)

// package.json: only what runs in production (no build tools), and the commands used on the host
const source = JSON.parse(fs.readFileSync(path.join(server, 'package.json'), 'utf8'))
fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'nextudio-control',
      version: source.version,
      private: true,
      description: 'Nextudio Control: management system (production package)',
      main: 'app.js',
      engines: { node: '>=18' },
      scripts: {
        start: 'node dist/index.js',
        migrate: 'node dist/scripts/migrate.js',
        'migrate:status': 'node dist/scripts/migrate.js --status',
        backup: 'node dist/scripts/backup.js',
        restore: 'node dist/scripts/restore.js',
        check: 'node dist/scripts/check.js',
        'create-user': 'node dist/scripts/create-user.js',
      },
      dependencies: source.dependencies,
    },
    null,
    2
  ) + '\n'
)

// 3. lock file for exactly these production dependencies (installs nothing here)
run(npm, ['install', '--package-lock-only', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], out)

// 4. sanity checks on the package
for (const required of ['app.js', 'package.json', 'package-lock.json', 'dist/index.js', 'dist/scripts/migrate.js', 'public/index.html', 'assets/nextudio-logo.webp', 'migrations']) {
  if (!fs.existsSync(path.join(out, required))) throw new Error(`Package is missing ${required}`)
}
for (const forbidden of ['.env', 'node_modules', 'tools', 'backups']) {
  if (fs.existsSync(path.join(out, forbidden))) throw new Error(`Package must not contain ${forbidden}`)
}

// --no-zip: only assemble the folder (used by the Docker build, which does not need a ZIP)
if (process.argv.includes('--no-zip')) {
  console.log(`\nPackage folder: ${out}`)
  process.exit(0)
}

// 5. ZIP (the Windows tar.exe writes normal zip files with forward-slash paths, which Linux hosts need)
const stamp = new Date().toISOString().slice(0, 10)
const zip = path.join(root, 'deploy', `nextudio-control-${stamp}.zip`)
fs.rmSync(zip, { force: true })
if (process.platform === 'win32') {
  execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', out, '.'], { stdio: 'inherit' })
} else {
  execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: out, stdio: 'inherit' })
}

const size = (fs.statSync(zip).size / 1024 / 1024).toFixed(2)
console.log(`\nPackage folder: ${out}\nZIP file:       ${zip} (${size} MB)\nUpload the ZIP (or the folder's contents) to the host. Do NOT upload node_modules or a .env file.`)
