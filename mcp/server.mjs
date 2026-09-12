#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createBraliServer } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_API = path.resolve(HERE, '..', 'api', 'v1');
const BUNDLED_API = path.resolve(HERE, 'dist-data', 'api', 'v1');
const API = process.env.BRALI_API_DIR
  ? path.resolve(process.env.BRALI_API_DIR)
  : (fs.existsSync(REPO_API) ? REPO_API : BUNDLED_API);

if (!fs.existsSync(API)) {
  throw new Error('Brali API data not found. Use the published package, run the repository build, or set BRALI_API_DIR.');
}

const loadItems = name => JSON.parse(fs.readFileSync(path.join(API, name), 'utf8')).items || [];
void serveStdio(() => createBraliServer({ loadItems }));
console.error(`Brali MCP server running on stdio using ${API}`);
