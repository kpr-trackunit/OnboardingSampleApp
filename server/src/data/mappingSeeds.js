/**
 * Mapping Seeds
 * Column and value mappings for the sample customers, loaded into the store at startup.
 * These are data, not code: the Data Mapping tab edits the same objects.
 * Each seed names its source (sourceKey + label); the store links it to a customerId at startup.
 */

const SEED_TIMESTAMP = '2026-10-27T00:00:00Z';

function seedMappings() {
  return [
    {
      sourceKey: 'abc-accounting',
      label: 'ABC Accounting',
      entity: 'clients',
      columns: {
        sourceId: 'Client ID',
        name: 'Client Name',
        entityType: 'Business Type',
        status: 'Status',
        startDate: 'Date Onboarded',
        taxId: 'Tax ID',
        annualRevenue: 'Annual Revenue',
        industry: 'Industry',
        paymentTerms: 'Payment Terms'
      },
      values: {
        entityType: {
          map: {
            'Corporation': 'company',
            'S-Corporation': 'company',
            'LLC': 'llc_llp',
            'Partnership': 'partnership',
            'Sole Proprietorship': 'sole_trader',
            'Non-Profit': 'non_profit'
          },
          default: 'company'
        },
        status: {
          map: { 'Active': 'active', 'Inactive': 'inactive', 'Pending': 'pending' },
          default: 'pending'
        }
      },
      dateFormat: 'MM/DD/YYYY',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    }
  ];
}

module.exports = {
  seedMappings
};
