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

Отдельный weekly/manual workflow `.github/workflows/coverage.yml`:

```bash
cargo llvm-cov --workspace --lcov --output-path coverage/lcov.info -- --test-threads=1
bash scripts/check-rust-coverage.sh
```

Baseline: `scripts/rust-coverage-baseline.json`. Текущие critical-модули:
core validation/sync/search, auth session/register/login/password/tokens,
sync push/pull/conflicts, desktop store/sync/chat.

```text
total lines      57.17%
total functions  51.19%
```

Rust coverage не входит в каждый PR: инструментированный workspace-прогон
слишком тяжёлый. Он проверяется weekly и вручную после крупных изменений.
