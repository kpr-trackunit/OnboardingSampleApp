/**
 * File-backed customer storage: one markdown file per customer in /customers.
 *
 * Format:
 *   ---
 *   id: cust_001
 *   name: Acme Corporation
 *   ---
 *
 *   ## Config
 *
 *   - date format: MM/DD/YYYY
 *
 *   ## Issues
 *
 *   - [open] Tenant failed to provision
 */

const fs = require('fs');
const path = require('path');

const CUSTOMERS_DIR = process.env.CUSTOMERS_DIR || path.join(__dirname, '..', '..', '..', 'customers');
const FIELDS = ['id', 'name', 'industry', 'region', 'contactEmail', 'createdAt'];

const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

// Ids come from the API and become file names, so keep them path-safe
const fileFor = (id) => path.join(CUSTOMERS_DIR, `${String(id).replace(/[^\w-]/g, '_')}.md`);

function splitPair(line) {
  const i = line.indexOf(':');
  return i === -1 ? null : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
}

function parse(text) {
  const customer = { config: {}, issues: [] };
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  for (const line of (match ? match[1] : '').split(/\r?\n/)) {
    const pair = splitPair(line);
    if (pair && FIELDS.includes(pair[0])) customer[pair[0]] = pair[1];
  }
  for (const line of section(text, 'Config').split(/\r?\n/)) {
    const pair = splitPair(line.replace(/^\s*-\s*/, ''));
    if (line.trim().startsWith('-') && pair && pair[0]) customer.config[pair[0]] = pair[1];
  }
  for (const line of section(text, 'Issues').split(/\r?\n/)) {
    const issue = line.match(/^\s*-\s*\[([\w-]+)\]\s*(.+)$/);
    if (issue) customer.issues.push({ status: issue[1], title: issue[2].trim() });
  }
  return customer;
}

// Body of a "## Name" section, up to the next "## " heading
function section(text, name) {
  const match = text.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return match ? match[1] : '';
}

function serialize(customer) {
  const front = FIELDS.map((f) => `${f}: ${oneLine(customer[f])}`).join('\n');
  const config = Object.entries(customer.config || {})
    .filter(([key]) => oneLine(key))
    .map(([key, value]) => `- ${oneLine(key)}: ${oneLine(value)}`)
    .join('\n');
  const issues = (customer.issues || [])
    .filter((issue) => oneLine(issue.title))
    .map((issue) => `- [${oneLine(issue.status)}] ${oneLine(issue.title)}`)
    .join('\n');
  return `---\n${front}\n---\n\n## Config\n\n${config}\n\n## Issues\n\n${issues}\n`;
}

function loadAll() {
  if (!fs.existsSync(CUSTOMERS_DIR)) return [];
  return fs
    .readdirSync(CUSTOMERS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => parse(fs.readFileSync(path.join(CUSTOMERS_DIR, f), 'utf8')))
    .filter((c) => c.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function save(customer) {
  fs.mkdirSync(CUSTOMERS_DIR, { recursive: true });
  fs.writeFileSync(fileFor(customer.id), serialize(customer), 'utf8');
}

module.exports = { loadAll, save, parse, serialize, CUSTOMERS_DIR };
