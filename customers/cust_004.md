---
id: cust_004
name: Premier Bookkeeping
industry: Bookkeeping
region: United Kingdom
contactEmail: 
createdAt: 2025-01-18T10:00:00Z
---

## Config

- sample data: sample-data/CustomerC_PremierBookkeeping
- schema style: snake_case columns
- date format: DD-MM-YYYY
- status values: ACTIVE / DORMANT / SUSPENDED

## Issues

- [open] DD-MM-YYYY dates: 15 of 25 transactions have day > 12 and fail if parsed as MM-DD
- [in-progress] UK entity types (Limited Company, LLP, Sole Trader) have no US picklist equivalent
- [open] 3 Unreconciled (TRN-00005, -00009, -00015) and 1 Cancelled (TRN-00019) transactions need import rules
- [open] Amounts are in GBP (amount_gbp); tenant currency must be set to match
- [open] 14 settlement methods (BACS, Cheque, HP, Standing Order...) need value mapping
- [resolved] All contacts and transactions reference known clients and accounts
