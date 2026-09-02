import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('Release validation must be started through npm.');
  process.exitCode = 1;
}

const gates = [
  ['run', 'verify:xerces-runtime'],
  ['run', 'verify:relaxng-runtime'],
  ['run', 'verify:release-integrity'],
  ['run', 'acceptance:complete-visualization'],
  ['run', 'relaxng:conformance'],
  ['run', 'acceptance:relaxng-complete-visualization'],
  ['run', 'check'],
  ['test'],
  ['run', 'lint'],
  ['run', 'format:check'],
  ['run', 'build'],
  ['run', 'verify:dist', '--', '--base=./'],
  ['run', 'verify:hostile-mime'],
];

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      stdio: 'inherit',
      shell: false,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`npm ${args.join(' ')} stopped after ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(`npm ${args.join(' ')} failed with exit code ${code}.`),
        );
        return;
      }
      resolve();
    });
  });
}

try {
  if (npmCli) {
    for (const gate of gates) {
      await runNpm(gate);
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Release validation failed.',
  );
  process.exitCode = 1;
}
