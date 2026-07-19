import { spawnSync } from "node:child_process";

const checks = [
  ["npm", ["run", "test:migrations:saved-pursuits"]],
  ["npm", ["run", "test:fixtures"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "build"]],
];

for (const [command, args] of checks) {
  process.stdout.write(`\n[release:check] ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("\n[release:check] all checks passed\n");
