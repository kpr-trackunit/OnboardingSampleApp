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
    },
    {
      sourceKey: 'abc-accounting',
      label: 'ABC Accounting',
      entity: 'contacts',
      columns: {
        sourceId: 'Contact ID',
        clientSourceId: 'Client ID',
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        phone: 'Phone',
        role: 'Role',
        active: 'Status'
      },
      values: {
        active: {
          // A pending contact isn't active yet
          map: { 'Active': true, 'Inactive': false, 'Pending': false },
          default: false
        }
      },
      dateFormat: 'MM/DD/YYYY',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'xyz-financial-services',
      label: 'XYZ Financial Services',
      entity: 'contacts',
      columns: {
        sourceId: 'contactId',
        clientSourceId: 'clientCode',
        firstName: 'firstName',
        lastName: 'lastName',
        email: 'emailAddress',
        phone: 'phoneNumber',
        role: 'jobTitle',
        active: 'isActive'
      },
      values: {
        active: {
          map: { 'Y': true, 'N': false, 'P': false },
          default: false
        }
      },
      dateFormat: 'YYYY-MM-DD',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'premier-bookkeeping',
      label: 'Premier Bookkeeping',
      entity: 'contacts',
      columns: {
        sourceId: 'contact_ref',
        clientSourceId: 'customer_id',
        firstName: 'given_name',
        lastName: 'family_name',
        email: 'email',
        phone: 'telephone',
        role: 'position',
        active: 'contact_status'
      },
      values: {
        active: {
          map: { 'Active': true, 'Dormant': false, 'Suspended': false },
          default: false
        }
      },
      dateFormat: 'DD-MM-YYYY',
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    // Chart of accounts: type and normalBalance are strict (no default), see data-mapping.md decision 5
    {
      sourceKey: 'abc-accounting',
      label: 'ABC Accounting',
      entity: 'accounts',
      columns: {
        code: 'Account Number',
        name: 'Account Name',
        type: 'Account Type',
        subType: 'Sub Type',
        normalBalance: 'Normal Balance',
        active: 'Status',
        parentCode: 'Parent Account'
      },
      values: {
        type: {
          map: { 'Asset': 'asset', 'Liability': 'liability', 'Equity': 'equity', 'Revenue': 'revenue', 'Expense': 'expense' },
          default: null
        },
        normalBalance: { map: { 'Debit': 'debit', 'Credit': 'credit' }, default: null },
        active: { map: { 'Active': true, 'Inactive': false }, default: true }
      },
      dateFormat: null,
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'xyz-financial-services',
      label: 'XYZ Financial Services',
      entity: 'accounts',
      columns: {
        code: 'acctCode',
        name: 'acctName',
        type: 'acctCategory',
        subType: 'acctSubCategory',
        normalBalance: 'balanceType',
        active: 'activeFlag',
        parentCode: 'parentAcctCode'
      },
      values: {
        type: {
          map: { 'ASSET': 'asset', 'LIABILITY': 'liability', 'EQUITY': 'equity', 'REVENUE': 'revenue', 'EXPENSE': 'expense' },
          default: null
        },
        normalBalance: { map: { 'DR': 'debit', 'CR': 'credit' }, default: null },
        active: { map: { '1': true, '0': false }, default: true }
      },
      dateFormat: null,
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'premier-bookkeeping',
      label: 'Premier Bookkeeping',
      entity: 'accounts',
      columns: {
        code: 'nominal_code',
        name: 'account_title',
        type: 'category',
        subType: 'sub_category',
        normalBalance: 'debit_credit',
        active: 'is_active',
        parentCode: 'parent_code'
      },
      values: {
        type: {
          // UK terms: Capital is equity, Income is revenue, and all three cost categories are expenses
          map: {
            'Assets': 'asset',
            'Liabilities': 'liability',
            'Capital': 'equity',
            'Income': 'revenue',
            'Direct Costs': 'expense',
            'Overheads': 'expense',
            'Finance Costs': 'expense'
          },
          default: null
        },
        normalBalance: { map: { 'D': 'debit', 'C': 'credit' }, default: null },
        active: { map: { 'Yes': true, 'No': false }, default: true }
      },
      dateFormat: null,
      dateFormatDetected: 'detected',
      updatedAt: SEED_TIMESTAMP
    },
    // Transactions: direction is strict (no default), see data-mapping.md decision 5.
    // Values that aren't payment methods (journal entries, financing, fees) are left
    // unmapped on purpose, so they import with the default and a warning for CS to review.
    {
      sourceKey: 'abc-accounting',
      label: 'ABC Accounting',
      entity: 'transactions',
      columns: {
        sourceId: 'Transaction ID',
        date: 'Date',
        clientSourceId: 'Client ID',
        accountCode: 'Account Number',
        description: 'Description',
        direction: 'Transaction Type',
        amount: 'Amount',
        status: 'Status',
        paymentMethod: 'Payment Method',
        reference: 'Reference Number'
      },
      values: {
        direction: { map: { 'Debit': 'debit', 'Credit': 'credit' }, default: null },
        status: { map: { 'Cleared': 'completed', 'Pending': 'pending', 'Voided': 'cancelled' }, default: 'pending' },
        paymentMethod: {
          map: {
            'Wire Transfer': 'wire',
            'ACH': 'ach',
            'Direct Deposit': 'ach',
            'Check': 'check',
            'Credit Card': 'card',
            'Cash': 'cash',
            'Bank Transfer': 'bank_transfer'
          },
          default: 'bank_transfer'
        }
      },
      dateFormat: 'MM/DD/YYYY',
      dateFormatDetected: 'detected',
      currency: 'USD',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'xyz-financial-services',
      label: 'XYZ Financial Services',
      entity: 'transactions',
      columns: {
        sourceId: 'txnId',
        date: 'txnDate',
        clientSourceId: 'clientCode',
        accountCode: 'acctCode',
        description: 'memo',
        direction: 'entryType',
        amount: 'txnAmount',
        status: 'txnStatus',
        paymentMethod: 'paymentType',
        reference: 'docNumber'
      },
      values: {
        direction: { map: { 'DR': 'debit', 'CR': 'credit' }, default: null },
        status: { map: { 'POSTED': 'completed', 'PENDING': 'pending', 'VOID': 'cancelled' }, default: 'pending' },
        paymentMethod: {
          map: {
            'WIRE': 'wire',
            'EFT': 'ach',
            'ACH': 'ach',
            'CHECK': 'check',
            'CARD': 'card',
            'CASH': 'cash',
            'BANK': 'bank_transfer'
          },
          default: 'bank_transfer'
        }
      },
      dateFormat: 'YYYY-MM-DD',
      dateFormatDetected: 'detected',
      currency: 'USD',
      updatedAt: SEED_TIMESTAMP
    },
    {
      sourceKey: 'premier-bookkeeping',
      label: 'Premier Bookkeeping',
      entity: 'transactions',
      columns: {
        sourceId: 'transaction_ref',
        date: 'posting_date',
        clientSourceId: 'customer_id',
        accountCode: 'nominal_code',
        description: 'narrative',
        direction: 'dr_cr',
        amount: 'amount_gbp',
        status: 'posting_status',
        paymentMethod: 'settlement_method',
        reference: 'document_ref'
      },
      values: {
        direction: { map: { 'D': 'debit', 'C': 'credit' }, default: null },
        status: { map: { 'Reconciled': 'completed', 'Unreconciled': 'pending', 'Cancelled': 'cancelled' }, default: 'pending' },
        paymentMethod: {
          // UK terms: BACS and Direct Debit are the ACH equivalents, Cheque is check
          map: {
            'Wire': 'wire',
            'Bank Transfer': 'bank_transfer',
            'Bank': 'bank_transfer',
            'Standing Order': 'bank_transfer',
            'Online Payment': 'bank_transfer',
            'BACS': 'ach',
            'Direct Debit': 'ach',
            'Cheque': 'check',
            'Credit Card': 'card',
            'Card Payment': 'card',
            'Cash': 'cash',
            'Petty Cash': 'cash'
          },
          default: 'bank_transfer'
        }
      },
      dateFormat: 'DD-MM-YYYY',
      dateFormatDetected: 'detected',
      // Premier's amounts are in pounds (amount_gbp). Stored as-is, never converted
      currency: 'GBP',
      updatedAt: SEED_TIMESTAMP
    }
  ];
}

module.exports = {
  seedMappings
};
