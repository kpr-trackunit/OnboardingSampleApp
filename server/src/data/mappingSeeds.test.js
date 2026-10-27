const { describe, it } = require('node:test');
const assert = require('node:assert');
const { seedMappings } = require('./mappingSeeds');
const { getTargetFields } = require('../models/targetFields');

describe('Mapping Seeds', () => {
  it('should only map known target fields', () => {
    seedMappings().forEach(mapping => {
      const targetFields = getTargetFields(mapping.entity);
      Object.keys(mapping.columns).forEach(field => assert.ok(targetFields[field], `${mapping.id}: ${field}`));
    });
  });

  it('should only map picklist values to standard values', () => {
    seedMappings().forEach(mapping => {
      const targetFields = getTargetFields(mapping.entity);
      Object.entries(mapping.values).forEach(([field, { map, default: fallback }]) => {
        const allowed = targetFields[field].values;
        Object.values(map).forEach(value => assert.ok(allowed.includes(value), `${mapping.id}: ${field} → ${value}`));
        if (fallback !== null) assert.ok(allowed.includes(fallback), `${mapping.id}: ${field} default`);
      });
    });
  });
});
