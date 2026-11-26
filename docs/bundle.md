# Bundle layout and budget

Route-level dynamic imports keep the entry focused on shell, providers and
landing. Everything else is a separate chunk served by Vite/Tauri.

## Baseline 0.7.13+

```text
entry JS       561 KB raw / 164 KB gzip
largest chunk  561 KB
CSS             42 KB
```

## Budget

`scripts/check-bundle-budget.sh` runs after `npm run build`:

| Что | Бюджет |
|---|---:|
| entry JS | 220 KB gzip |
| largest JS chunk | 600 KB |
| CSS | 250 KB |

CI fails on exceeding any budget. Raise a budget only with a written reason.

## Lazy routes

- public profile/collection/item;
- items, item form, item detail;
- collections and tiers;
- feed/recommendations/people/notifications;
- chat inbox/thread;
- settings/dashboard/trash;
- admin screens;
- legal/login/offline/download.

The route fallback is `LoadingScreen` with `aria-busy`.
