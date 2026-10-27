# T-002: Per-customer config and editable customer name

- **Customer:** n/a (internal)
- **Status:** in-progress
- **Priority:** medium

## Description

CS needs to record config info per customer and fix customer names. Customers are stored as markdown files for speed.

## Notes

- Storage: `customers/<id>.md` (front matter plus a `## Config` list of `- key: value` lines), read at server start, written on add/update. Code in `server/src/data/customerFiles.js`.
- API: `PUT /api/customers/:id` accepts `name` and/or `config` (free-form key/value). Blank names and config keys containing `:` return 400.
- Client: the Customers tab has the add-customer form and an "Edit name" button per customer. Config is edited in the Data Mapping tab (pick a customer, edit key/value rows, Save config).
- Sample-data customers (ABC Accounting, XYZ Financial Services, Premier Bookkeeping) are seeded as `customers/cust_002` to `cust_004`, with their schema style and date format as config.
- Tenant Setup tab lists issues per customer (`## Issues` section, `- [status] title`); statuses are open, in-progress, resolved. Saved through the same `PUT /api/customers/:id` (`issues` array). No seeded issues yet.
- Verified via API against a temp directory (create, rename, config, reload from disk). The Edit UI has not been clicked through in a browser yet.
- Not done: unit tests for `customerFiles.js` and the PUT endpoint; config values are single-line only.
