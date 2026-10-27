---
id: cust_003
name: XYZ Financial Services
industry: Financial Services
region: North America
contactEmail: 
createdAt: 2025-01-17T10:00:00Z
---

## Config

- sample data: sample-data/CustomerB_XYZFinancialServices
- schema style: camelCase columns
- date format: YYYY-MM-DD
- status values: A / I / P

## Issues

- [open] clients.csv: all 12 rows have unquoted "Last, First" mainContact (11 fields, expected 10), columns shift
- [open] Client status codes A / I / P need value mapping
- [open] Entry types DR / CR need mapping to Debit / Credit
- [in-progress] contacts.csv isActive has a third value "P" besides Y / N
- [resolved] All contacts and transactions reference known clients and accounts
