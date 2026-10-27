/**
 * Domain Models for Customer Onboarding
 */

/**
 * @typedef {Object} Customer
 * @property {string} id - Unique customer identifier
 * @property {string} name - Customer/company name
 * @property {string} industry - Industry vertical
 * @property {string} region - Geographic region
 * @property {string} contactEmail - Primary contact email
 * @property {string} createdAt - ISO timestamp
 * @property {Object<string, string>} config - Free-form per-customer config key/values
 * @property {{title: string, status: string}[]} issues - Tenant setup issues; status is 'open' | 'in-progress' | 'resolved'
 */

/**
 * @typedef {Object} Tenant
 * @property {string} id - Unique tenant identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} status - 'pending' | 'provisioning' | 'active' | 'failed'
 * @property {string} plan - 'starter' | 'professional' | 'enterprise'
 * @property {string} region - Data residency; defaults to the customer's region when the tenant is created
 * @property {string|null} failureReason - Why provisioning failed; set while status is 'failed', cleared on Retry
 * @property {string} createdAt - ISO timestamp
 */

// Allowed values for Tenant.plan
const TENANT_PLANS = ['starter', 'professional', 'enterprise'];

// The one list of allowed regions, shared by Customer.region (validated on
// save, tickets/customer-info.md slice 3) and Tenant.region (data residency).
// LATAM is customer-info.md's proposal; the list is pending confirmation
// (customer-info.md Clarify 2, tenant-setup.md open question 1).
const REGIONS = ['North America', 'EU', 'UK', 'APAC', 'LATAM'];

// Regions a tenant can be hosted in. An alias of REGIONS, so tenants and
// customers always allow the same values.
const TENANT_REGIONS = REGIONS;

/**
 * @typedef {Object} OnboardingStep
 * @property {string} id - Step identifier
 * @property {string} name - Human-readable step name
 * @property {string} status - 'pending' | 'in_progress' | 'completed' | 'failed'
 * @property {number} order - Step sequence number
 */

/**
 * @typedef {Object} OnboardingState
 * @property {string} customerId - Associated customer ID
 * @property {OnboardingStep[]} steps - Array of onboarding steps
 * @property {number} progressPercent - Overall progress (0-100)
 */

/**
 * @typedef {Object} Client
 * @property {string} id - Unique client identifier
 * @property {string} customerId - Customer whose data this came from
 * @property {string} sourceId - Client ID in the customer's file
 * @property {string} name - Client/company name
 * @property {string} entityType - 'company' | 'llc_llp' | 'partnership' | 'sole_trader' | 'non_profit'
 * @property {string} entityTypeSource - Original entity type value
 * @property {string} status - 'active' | 'inactive' | 'pending'
 * @property {string} statusSource - Original status value
 * @property {string} startDate - ISO date (YYYY-MM-DD)
 * @property {string} taxId - Tax reference
 * @property {number|null} annualRevenue - Revenue as a number
 * @property {string} industry - Industry or sector
 * @property {string} paymentTerms - Payment terms as written by the customer
 */

/**
 * @typedef {Object} ValueMap
 * @property {Object<string, string>} map - Source value → standard value
 * @property {string|null} default - Standard value used when a source value isn't mapped
 */

/**
 * @typedef {Object} Mapping
 * @property {string} id - Unique mapping identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} entity - 'clients' | 'contacts' | 'accounts' | 'transactions'
 * @property {Object<string, string|null>} columns - Target field → source column
 * @property {Object<string, ValueMap>} values - Picklist target field → value map
 * @property {string|null} dateFormat - 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | null
 * @property {string} dateFormatDetected - 'detected' | 'ambiguous' | 'confirmed'
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * @typedef {Object} ImportIssue
 * @property {number} row - Line number in the source file (the header is line 1)
 * @property {string|null} field - Canonical field, or null for whole-row problems
 * @property {string|null} column - Source column
 * @property {string} value - Source value
 * @property {string} message - Readable reason, prefixed with the row
 * @property {string} [default] - Warnings only: the default value that was used
 */

/**
 * @typedef {Object} ImportRun
 * @property {string} id - Unique run identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} entity - 'clients' | 'contacts' | 'accounts' | 'transactions'
 * @property {string} startedAt - ISO timestamp
 * @property {number} imported - Rows saved
 * @property {number} rejected - Rows skipped because of errors
 * @property {ImportIssue[]} warnings - Rows imported with a default value
 * @property {ImportIssue[]} errors - Why each rejected row was skipped
 */

/**
 * Creates a new Customer object
 * @param {Partial<Customer>} data 
 * @returns {Customer}
 */
function createCustomer(data) {
  return {
    id: data.id || `cust_${Date.now()}`,
    name: data.name || '',
    industry: data.industry || '',
    region: data.region || '',
    contactEmail: data.contactEmail || '',
    createdAt: data.createdAt || new Date().toISOString(),
    config: data.config || {},
    issues: data.issues || []
  };
}

/**
 * Creates a new Tenant object
 * @param {Partial<Tenant>} data 
 * @returns {Tenant}
 */
function createTenant(data) {
  return {
    id: data.id || `tenant_${Date.now()}`,
    customerId: data.customerId || '',
    status: data.status || 'pending',
    plan: data.plan || 'starter',
    region: data.region || '',
    failureReason: data.failureReason || null,
    createdAt: data.createdAt || new Date().toISOString()
  };
}

/**
 * Creates default onboarding steps
 * @returns {OnboardingStep[]}
 */
function createDefaultOnboardingSteps() {
  return [
    { id: 'step_1', name: 'Customer Info', status: 'pending', order: 1 },
    { id: 'step_2', name: 'Data Mapping', status: 'pending', order: 2 },
    { id: 'step_3', name: 'Tenant Setup', status: 'pending', order: 3 },
    { id: 'step_4', name: 'Import', status: 'pending', order: 4 }
  ];
}

/**
 * Calculates progress percentage from steps
 * @param {OnboardingStep[]} steps 
 * @returns {number}
 */
function calculateProgress(steps) {
  if (!steps || steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100);
}

/**
 * Allowed tenant status transitions: current status -> statuses it may move to.
 * pending -> provisioning (Start), provisioning -> active (Mark active),
 * provisioning -> failed (Mark failed), failed -> provisioning (Retry).
 * @type {Object<string, string[]>}
 */
const TENANT_STATUS_TRANSITIONS = {
  pending: ['provisioning'],
  provisioning: ['active', 'failed'],
  active: [],
  failed: ['provisioning']
};

/**
 * Onboarding step 3 (Tenant Setup) mirrors the tenant status
 * @type {Object<string, string>}
 */
const TENANT_STATUS_TO_STEP_STATUS = {
  pending: 'pending',
  provisioning: 'in_progress',
  active: 'completed',
  failed: 'failed'
};

/**
 * @param {string} from - Current tenant status
 * @param {string} to - Requested tenant status
 * @returns {boolean}
 */
function canTransitionTenant(from, to) {
  return (TENANT_STATUS_TRANSITIONS[from] || []).includes(to);
}

/**
 * Creates a new Client object
 * @param {Partial<Client>} data
 * @returns {Client}
 */
function createClient(data) {
  return {
    id: data.id || `client_${data.customerId}_${data.sourceId}`,
    customerId: data.customerId || '',
    sourceId: data.sourceId || '',
    name: data.name || '',
    entityType: data.entityType || null,
    entityTypeSource: data.entityTypeSource || '',
    status: data.status || null,
    statusSource: data.statusSource || '',
    startDate: data.startDate || null,
    taxId: data.taxId || '',
    annualRevenue: data.annualRevenue ?? null,
    industry: data.industry || '',
    paymentTerms: data.paymentTerms || ''
  };
}

/**
 * Creates a new Mapping object
 * @param {Partial<Mapping>} data
 * @returns {Mapping}
 */
function createMapping(data) {
  return {
    id: data.id || `mapping_${data.customerId}_${data.entity}`,
    customerId: data.customerId || '',
    entity: data.entity || '',
    columns: data.columns || {},
    values: data.values || {},
    dateFormat: data.dateFormat || null,
    dateFormatDetected: data.dateFormatDetected || 'detected',
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

/**
 * Creates a new ImportRun object
 * @param {Partial<ImportRun>} data
 * @returns {ImportRun}
 */
function createImportRun(data) {
  const startedAt = data.startedAt || new Date().toISOString();
  return {
    id: data.id || `run_${data.customerId}_${data.entity}_${Date.now()}`,
    customerId: data.customerId || '',
    entity: data.entity || '',
    startedAt,
    imported: data.imported || 0,
    rejected: data.rejected || 0,
    warnings: data.warnings || [],
    errors: data.errors || []
  };
}

module.exports = {
  TENANT_PLANS,
  REGIONS,
  TENANT_REGIONS,
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  calculateProgress,
  TENANT_STATUS_TRANSITIONS,
  TENANT_STATUS_TO_STEP_STATUS,
  canTransitionTenant,
  createClient,
  createMapping,
  createImportRun
};
