# English Suite Review Gate

The German suite is frozen and must not be edited without explicit approval.

- Frozen German file: `testfaelle/praxis_de.json`
- Frozen SHA256: `e2e1060f55b46ce47bd6176f68ecb34eb49754102db127e7731e6f6a79327e20`
- English suite: `testfaelle/praxis_en.json`
- Pair validator: `node scripts/validate_case_pairs.mjs`

## Local Gate Status

- Pair structure is locked to the German reference: 200 IDs, same order, same categories, same tags/difficulty fields, same points, and no manual rubrics.
- English expected JSON is generated from the German expected JSON through explicit key/value mappings.
- Existing German test cases were not regenerated or corrected.
- Old runs without suite metadata are treated as German runs.
- Three read-only reviewer agents completed an English-suite review on 2026-05-18.
- Reviewer blockers in the English transfer were fixed in `testfaelle/praxis_en.json` and `scripts/english_suite_transform.mjs`.

## Review Focus

Reviewers should focus on the English transfer:

- Prompt wording is clear and natural English.
- Expected JSON fields and enum values match the English prompt.
- Numbers, dates, IDs, order constraints, and business logic did not drift from the German reference.
- Variable names are not misleading.
- Translated context does not introduce ambiguity that is not present in the German reference.

If a reviewer suspects the German reference case is wrong or ambiguous, record it as a blocker/note here or in the review output. Do not change `testfaelle/praxis_de.json` unless Dirk explicitly approves that specific change.

## Potential German Reference Issues

The German file was not changed. Reviewers flagged these as notes only:

- `reason_elimination_008`: the German prompt does not list the exact enum value that the expected JSON uses. The English prompt now states the matching English enum explicitly so it stays aligned with the frozen expected solution.
- `data_inventory_005`: the German source uses comma-separated values with decimal-comma-looking fragments. The English prompt now uses unambiguous CSV rows while preserving the same parsed values.
