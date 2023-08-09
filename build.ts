/*
 * Copyright 2023 Fair protocol
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * 
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { default as Pino } from 'pino';
/* import fs from 'node:fs'; */

export const logger = Pino({
  name: 'Script build',
  level: 'debug',
});

/* const files = fs.readdirSync('./src');
const entryPoints = files.filter(file => file.includes('.ts')).map(file => `./src/${file}`); */

try {
  const sharedConfig = {
    entryPoints: [ './src/index.ts'], // entryPoints,
    bundle: true,
    minify: true,
    plugins: [ nodeExternalsPlugin() ],
    // outdir: 'dist',
  };

  await esbuild.build({
    ...sharedConfig,
    platform: 'node', // for CJS
    outfile: './dist/index.cjs',
    format: 'cjs'
  });
} catch (e) {
  logger.error(e);
}