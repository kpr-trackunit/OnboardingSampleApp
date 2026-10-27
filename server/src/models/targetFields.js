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
  contacts: {
    sourceId: { type: 'text', required: true },
    clientSourceId: { type: 'text', required: true, references: { entity: 'clients', key: 'sourceId', label: 'client' } },
    firstName: { type: 'text' },
    lastName: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    role: { type: 'text' },
    active: { type: 'picklist', values: [true, false] }
  }
};

/**
 * Returns the target field definitions for an entity
 * @param {string} entity
 */
function getTargetFields(entity) {
  return TARGET_FIELDS[entity];
}

module.exports = {
  TARGET_FIELDS,
  getTargetFields
};
