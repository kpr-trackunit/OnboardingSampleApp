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
    },
    {
      sourceKey: 'xyz-financial-services',
      label: 'XYZ Financial Services',
      entity: 'clients',
      columns: {
        sourceId: 'clientCode',
        name: 'companyName',
        entityType: 'entityType',
        status: 'clientStatus',
        startDate: 'startDate',
        taxId: 'federalTaxId',
        annualRevenue: 'yearlyRevenue',
        industry: 'sectorCode',
        paymentTerms: 'billingTerms'
      },
      values: {
        entityType: {
          map: {
            'CORP': 'company',
            'SCORP': 'company',
            'LLC': 'llc_llp',
            'PART': 'partnership',
            'SOLE': 'sole_trader',
            'NPROF': 'non_profit'
          },
          default: 'company'
        },
        status: {
          map: { 'A': 'active', 'I': 'inactive', 'P': 'pending' },
          default: 'pending'
        }
      },
      dateFormat: 'YYYY-MM-DD',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'premier-bookkeeping',
      label: 'Premier Bookkeeping',
      entity: 'clients',
      columns: {
        sourceId: 'customer_id',
        name: 'business_name',
        entityType: 'legal_structure',
        status: 'account_status',
        startDate: 'registration_date',
        taxId: 'tax_reference',
        annualRevenue: 'gross_revenue',
        industry: 'industry_sector',
        paymentTerms: 'credit_terms'
      },
      values: {
        entityType: {
          map: {
            'Limited Company': 'company',
            'LLP': 'llc_llp',
            'Partnership': 'partnership',
            'Sole Trader': 'sole_trader'
          },
          default: 'company'
        },
        status: {
          // Per sample-data/README.md: DORMANT is inactive, SUSPENDED is pending
          map: { 'ACTIVE': 'active', 'DORMANT': 'inactive', 'SUSPENDED': 'pending' },
          default: 'pending'
        }
      },
      dateFormat: 'DD-MM-YYYY',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    }
  ];
}

module.exports = {
  seedMappings
};
