const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { ImportError, listImportSources, importEntity, getImported } = require('./importer');
const { transformRow } = require('./transform');
const { seedMappings } = require('../data/mappingSeeds');
const store = require('../data/store');

// Fixture: ABC clients (C003 is rejected for a bad date) and ABC contacts for clients
// C001 and C002, the rejected C003 and a client that doesn't exist at all (C999)
const FIXTURE_DIR = path.join(__dirname, '../../../tests/fixtures/import');

const contactsMapping = sourceKey => seedMappings().find(m => m.sourceKey === sourceKey && m.entity === 'contacts');

// The parts of an ImportRun that don't change between runs
const summary = run => ({ imported: run.imported, rejected: run.rejected, warnings: run.warnings.length });

// The store is shared across this file and never reset, so the describes run in order:
// nothing imported, then the fixture for ABC, then the full sample files
describe('Contacts import', () => {
  describe('before clients are imported', () => {
    it('should flag the contacts file as waiting for clients', () => {
      const premier = listImportSources().find(s => s.sourceKey === 'premier-bookkeeping');
      assert.strictEqual(premier.files.find(f => f.entity === 'contacts').waitingFor, 'clients');
      assert.strictEqual(premier.files.find(f => f.entity === 'clients').waitingFor, null);
    });

    it('should refuse to import contacts with "Import clients first"', () => {
      assert.throws(
        () => importEntity('premier-bookkeeping', 'contacts'),
        err => err instanceof ImportError && err.status === 409 && err.message === 'Import clients first'
      );
      const customerId = store.getSourceCustomerId('premier-bookkeeping', 'Premier Bookkeeping');
      assert.strictEqual(store.getImportRuns(customerId).length, 0);
    });
  });

  describe('unknown clients', () => {
    it('should reject contacts whose client is not among the imported clients', () => {
      importEntity('abc-accounting', 'clients', { dataDir: FIXTURE_DIR });
      const run = importEntity('abc-accounting', 'contacts', { dataDir: FIXTURE_DIR });

      assert.deepStrictEqual(summary(run), { imported: 2, rejected: 2, warnings: 0 });
      assert.deepStrictEqual(run.errors, [
        { row: 4, field: 'clientSourceId', column: 'Client ID', value: 'C003', message: 'row 4: unknown client `C003`' },
        { row: 5, field: 'clientSourceId', column: 'Client ID', value: 'C999', message: 'row 5: unknown client `C999`' }
      ]);
      assert.deepStrictEqual(getImported('abc-accounting', 'contacts').map(c => c.sourceId), ['CT001', 'CT003']);
    });
  });

  describe('mapping per source', () => {
    const cases = [
      {
        sourceKey: 'abc-accounting',
        counts: { imported: 15, rejected: 0, warnings: 0 },
        first: {
          sourceId: 'CT001', clientSourceId: 'C001', clientName: 'Riverside Manufacturing LLC',
          firstName: 'John', lastName: 'Smith', email: 'john.smith@riverside-mfg.com',
          phone: '(555) 123-4567', role: 'Owner', active: true, activeSource: 'Active'
        }
      },
      {
        sourceKey: 'xyz-financial-services',
        counts: { imported: 18, rejected: 0, warnings: 0 },
        first: {
          sourceId: 'CON-001', clientSourceId: 'XYZ-001', clientName: 'Apex Digital Marketing',
          firstName: 'Robert', lastName: 'Williams', email: 'rwilliams@apexdigital.com',
          phone: '555.111.2222', role: 'CEO', active: true, activeSource: 'Y'
        }
      },
      {
        sourceKey: 'premier-bookkeeping',
        counts: { imported: 20, rejected: 0, warnings: 0 },
        first: {
          sourceId: 'CTR-001', clientSourceId: 'PB-0001', clientName: 'Artisan Bakery & Cafe',
          firstName: 'Sophie', lastName: 'Bennett', email: 'sophie@artisanbakery.co.uk',
          phone: '+44 7700 100001', role: 'Owner/Manager', active: true, activeSource: 'Active'
        }
      }
    ];

    cases.forEach(({ sourceKey, counts, first }) => {
      it(`should import every ${sourceKey} contact linked to its client`, () => {
        importEntity(sourceKey, 'clients');
        const run = importEntity(sourceKey, 'contacts');
        assert.deepStrictEqual(summary(run), counts);

        const contacts = getImported(sourceKey, 'contacts');
        assert.strictEqual(contacts.length, counts.imported);
        const { id, customerId, ...fields } = contacts[0];
        assert.deepStrictEqual(fields, first);
        assert.strictEqual(id, `contact_${customerId}_${first.sourceId}`);
        contacts.forEach(c => assert.ok(c.clientName, `${c.sourceId} has a client`));
      });
    });

    it('should not duplicate contacts when the same file is imported twice', () => {
      importEntity('xyz-financial-services', 'contacts');
      importEntity('xyz-financial-services', 'contacts');

      const contacts = getImported('xyz-financial-services', 'contacts');
      assert.strictEqual(contacts.length, 18);
      assert.strictEqual(new Set(contacts.map(c => c.sourceId)).size, 18);
    });

    it('should no longer flag contacts as waiting once clients are imported', () => {
      const premier = listImportSources().find(s => s.sourceKey === 'premier-bookkeeping');
      assert.strictEqual(premier.files.find(f => f.entity === 'contacts').waitingFor, null);
    });
  });

  describe('active flag', () => {
    const cases = [
      ['abc-accounting', 'Active', true],
      ['abc-accounting', 'Inactive', false],
      ['abc-accounting', 'Pending', false],
      ['xyz-financial-services', 'Y', true],
      ['xyz-financial-services', 'N', false],
      ['xyz-financial-services', 'P', false],
      ['premier-bookkeeping', 'Active', true],
      ['premier-bookkeeping', 'Dormant', false],
      ['premier-bookkeeping', 'Suspended', false]
    ];

    cases.forEach(([sourceKey, value, expected]) => {
      it(`should read ${sourceKey} '${value}' as ${expected}`, () => {
        const mapping = contactsMapping(sourceKey);
        const { record, warnings } = transformRow({ [mapping.columns.active]: value }, mapping);

        assert.strictEqual(record.active, expected);
        assert.strictEqual(record.activeSource, value);
        assert.deepStrictEqual(warnings, []);
      });
    });

    it('should default an unknown spelling to false with a warning', () => {
      const mapping = contactsMapping('xyz-financial-services');
      const { record, warnings } = transformRow({ isActive: 'Maybe' }, mapping);

      assert.strictEqual(record.active, false);
      assert.deepStrictEqual(warnings.map(w => w.message), ["`isActive` 'Maybe' is not mapped, used default 'false'"]);
    });
  });
});
