export function isScriptInvoked(pattern: RegExp): boolean {
  if (typeof process === 'undefined') return false;
  return process.argv.slice(1).some((arg) => pattern.test(arg))
    || pattern.test(process.env.RUN_SCRIPT || '')
    || pattern.test(process.env.npm_lifecycle_script || '');
}

export function argsAfterScript(pattern: RegExp): string[] {
  const index = process.argv.findIndex((arg, position) => position > 0 && pattern.test(arg));
  if (index >= 0) return process.argv.slice(index + 1);
  // `node path/to/tsx-cli script.ts ...` strips script.ts from process.argv.
  // In npm scripts, argv then contains only user-provided arguments.
  return pattern.test(process.env.RUN_SCRIPT || '') || pattern.test(process.env.npm_lifecycle_script || '')
    ? process.argv.slice(1)
    : [];
}
