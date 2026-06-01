/**
 * Dynamically import an optional browser SDK by name. The specifier is a
 * variable so the bundler/tsc never tries to resolve it at build time — the
 * SDK only loads when an engine is actually used in the browser.
 */
export function loadModule<T = unknown>(specifier: string): Promise<T> {
  return import(/* @vite-ignore */ specifier) as Promise<T>;
}
