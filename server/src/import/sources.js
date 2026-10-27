/**
 * Import Sources
 * Discovers customer data waiting to be imported in the sample-data folder
 */

const fs = require('fs');
const path = require('path');

// IMPORT_DATA_DIR points the server at another folder, e.g. tests/fixtures/import for demos
const DEFAULT_DATA_DIR = process.env.IMPORT_DATA_DIR
  ? path.resolve(process.env.IMPORT_DATA_DIR)
  : path.join(__dirname, '../../../sample-data');

// Known CSV files and the canonical entity each one holds, in import order
const ENTITY_FILES = [
  { entity: 'clients', filename: 'clients.csv' },
  { entity: 'contacts', filename: 'contacts.csv' },
  { entity: 'accounts', filename: 'chart_of_accounts.csv' },
  { entity: 'transactions', filename: 'transactions.csv' }
];

/**
 * Turns a folder name like "CustomerB_XYZFinancialServices" into "XYZ Financial Services"
 * @param {string} folderName
 * @returns {string}
 */
function labelFromFolder(folderName) {
  return folderName
    .replace(/^Customer[A-Z]_/, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Turns a label like "XYZ Financial Services" into "xyz-financial-services"
 * @param {string} label
 * @returns {string}
 */
function sourceKeyFromLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Counts data rows in a CSV (non-empty lines, excluding the header)
 * @param {string} filePath
 * @returns {number}
 */
function countRows(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(line => line.trim() !== '');
  return Math.max(lines.length - 1, 0);
}

/**
 * Lists every customer folder in the data directory with its importable files
 * @param {string} [dataDir]
 * @returns {{ sourceKey: string, label: string, folder: string, files: { entity: string, filename: string, rowCount: number }[] }[]}
 */
function listSources(dataDir = DEFAULT_DATA_DIR) {
  if (!fs.existsSync(dataDir)) return [];

  return fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map(folder => {
      const label = labelFromFolder(folder);
      const files = ENTITY_FILES
        .filter(({ filename }) => fs.existsSync(path.join(dataDir, folder, filename)))
        .map(({ entity, filename }) => ({
          entity,
          filename,
          rowCount: countRows(path.join(dataDir, folder, filename))
        }));
      return { sourceKey: sourceKeyFromLabel(label), label, folder, files };
    })
    .filter(source => source.files.length > 0);
}

/**
 * Finds one source by key
 * @param {string} sourceKey
 * @param {string} [dataDir]
 */
function getSource(sourceKey, dataDir = DEFAULT_DATA_DIR) {
  return listSources(dataDir).find(s => s.sourceKey === sourceKey);
}

module.exports = {
  DEFAULT_DATA_DIR,
  ENTITY_FILES,
  labelFromFolder,
  sourceKeyFromLabel,
  listSources,
  getSource
};
