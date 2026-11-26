# Coverage ratchet

## Frontend

`npm run test:coverage` собирает coverage для критичных helpers:

- feed-seen;
- notification-stream;
- client-errors;
- view-preference;
- local-draft;
- errors;
- version.

Baseline: `frontend/coverage-baseline.json`.

```text
lines      85.84%
branches   65.04%
functions  82.14%
statements 80.00%
```

`scripts/check-coverage.sh` не даёт этим показателям упасть. Обновлять
baseline можно только вместе с ростом тестов.

## Rust

`cargo llvm-cov` требует отдельного тяжёлого прогона с тестовой схемой.
Он вынесен из обычного CI и должен запускаться как отдельный job:

```bash
cargo llvm-cov --workspace --lcov --output-path coverage/lcov.info -- --test-threads=1
```

Пока frontend ratchet закрыт; Rust coverage остаётся остатком T213.
