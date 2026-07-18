# Compatibility Disposition

Counts are exact class-token occurrences in production `src/**/*.{ts,tsx}`;
tests are excluded and the development gallery is included.

| Family                                  |        Entry count | Decision           | Owner / condition                                                       |
| --------------------------------------- | -----------------: | ------------------ | ----------------------------------------------------------------------- |
| `cc-panel`                              |                 85 | retain             | shared surfaces; no-growth ratchet                                      |
| `cc-button` / secondary / danger / icon | 243 / 151 / 14 / 1 | retain             | Button primitive plus live class consumers                              |
| `cc-button-primary`                     |                  5 | remove             | no CSS definition; base `cc-button` already supplies primary appearance |
| `cc-input` / `cc-password-toggle`       |             94 / 1 | retain             | forms, Input/Command, PasswordInput                                     |
| `cc-alert` / `cc-success`               |              5 / 3 | retain             | Alert/PageStates and live feedback surfaces                             |
| `cc-badge*`                             |          9 / 3 / 4 | retain             | provider/integration status                                             |
| `cc-nav-item`                           |                  0 | remove definition  | zero consumer; active variant is separate                               |
| `cc-nav-item-active`                    |                  4 | retain             | shell/document navigation                                               |
| `cc-tab` / active                       |              6 / 3 | retain             | chat question UI and protected compatibility                            |
| `cc-empty-state` / `cc-eyebrow`         |             2 / 11 | retain             | Surface/PageHeader and page headings                                    |
| `cc-logo-background` / icon             |              1 / 2 | retain             | EX-001 AppLogo styling                                                  |
| `cc-md` / `cc-md--chat`                 |              1 / 4 | retain permanently | protected Markdown contract, not migration debt                         |

Nonvisual `cc-*` storage keys, MIME types, data-transfer keys, Monaco theme IDs,
and test IDs are not compatibility styling APIs and are excluded from class
ratchets. Dynamic class construction was searched; only the listed visual
families are produced dynamically.
