---
id: cust_002
name: ABC Accounting
industry: Accounting
region: North America
contactEmail: 
createdAt: 2025-01-16T10:00:00Z
---

## Config

- sample data: sample-data/CustomerA_ABCAccounting
- schema style: Title Case columns
- date format: MM/DD/YYYY
- status values: Active / Inactive / Pending

## Issues

- [open] chart_of_accounts.csv line 33: description "Electric, gas, water" has unquoted commas (10 fields, expected 8)
- [open] Dates are MM/DD/YYYY; need mapping to the platform date format
- [open] 3 Pending (TXN005, TXN009, TXN015) and 1 Voided (TXN018) transactions need import rules
- [in-progress] 10 payment method values (incl. Bank Charge, Journal Entry, Financing) need value mapping
- [resolved] All contacts and transactions reference known clients and accounts
