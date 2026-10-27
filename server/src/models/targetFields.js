/**
 * Target Fields
 * The canonical fields each entity is mapped into, and how each one is parsed.
 * Shared by import and the Data Mapping tab.
 *
 * type: 'text' (trimmed string) | 'number' | 'date' (stored as ISO YYYY-MM-DD) | 'picklist'
 * required: the row is rejected when the value is missing
 * values: the region-neutral standard values a picklist field can take
 * strict: picklist with no default; an unmapped value rejects the row instead of
 *   using the default (transaction direction, account type and normalBalance)
 * key: the field that identifies a record within a customer's file (defaults to sourceId)
 * references: the value must be the key of a record already imported for the same
 *   customer, e.g. { entity: 'clients', key: 'sourceId', label: 'client' }
 */

const TARGET_FIELDS = {
  clients: {
    sourceId: { type: 'text', required: true },
    name: { type: 'text', required: true },
    entityType: { type: 'picklist', values: ['company', 'llc_llp', 'partnership', 'sole_trader', 'non_profit'] },
    status: { type: 'picklist', values: ['active', 'inactive', 'pending'] },
    startDate: { type: 'date' },
    taxId: { type: 'text' },
    annualRevenue: { type: 'number' },
    industry: { type: 'text' },
    paymentTerms: { type: 'text' }
  },
  accounts: {
    // Codes stay strings so Premier's 0010 keeps its leading zero
    code: { type: 'text', required: true, key: true },
    name: { type: 'text', required: true },
    type: { type: 'picklist', required: true, strict: true, values: ['asset', 'liability', 'equity', 'revenue', 'expense'] },
    subType: { type: 'text' },
    normalBalance: { type: 'picklist', required: true, strict: true, values: ['debit', 'credit'] },
    active: { type: 'picklist', values: [true, false] },
    // Must be the code of another account in the same file
    parentCode: { type: 'text' }
  },
  contacts: {
    sourceId: { type: 'text', required: true },
    clientSourceId: { type: 'text', required: true, references: { entity: 'clients', key: 'sourceId', label: 'client' } },
    firstName: { type: 'text' },
    lastName: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    role: { type: 'text' },
    active: { type: 'picklist', values: [true, false] }
  },
  transactions: {
    sourceId: { type: 'text', required: true },
    date: { type: 'date', required: true },
    clientSourceId: { type: 'text', required: true, references: { entity: 'clients', key: 'sourceId', label: 'client' } },
    // A string, compared as written: '0010' and '10' are different accounts
    accountCode: { type: 'text', required: true, references: { entity: 'accounts', key: 'code', label: 'account' } },
    description: { type: 'text' },
    direction: { type: 'picklist', required: true, strict: true, values: ['debit', 'credit'] },
    amount: { type: 'number', required: true },
    status: { type: 'picklist', values: ['completed', 'pending', 'cancelled'] },
    paymentMethod: { type: 'picklist', values: ['wire', 'bank_transfer', 'ach', 'check', 'card', 'cash'] },
    reference: { type: 'text' }
  }
};

/**
 * Returns the target field definitions for an entity
 * @param {string} entity
 */
function getTargetFields(entity) {
  return TARGET_FIELDS[entity];
}

/**
 * Returns the field that identifies a record within a customer's file
 * @param {string} entity
 * @returns {string}
 */
function getKeyField(entity) {
  const fields = getTargetFields(entity) || {};
  return Object.keys(fields).find(field => fields[field].key) || 'sourceId';
}

module.exports = {
  TARGET_FIELDS,
  getTargetFields,
  getKeyField
};
