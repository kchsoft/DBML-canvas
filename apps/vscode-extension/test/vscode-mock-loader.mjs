import { pathToFileURL } from 'node:url';

const mockUrl = pathToFileURL(`${import.meta.dirname}/vscode-mock.mjs`).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'vscode') {
    return { url: mockUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
