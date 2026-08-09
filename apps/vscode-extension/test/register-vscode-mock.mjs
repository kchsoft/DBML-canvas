import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./vscode-mock-loader.mjs', pathToFileURL(`${import.meta.dirname}/`));
