# Dependency notes

Only the choices that are not obvious, and would otherwise be "fixed" by
someone reading a warning without the context.

## `xlsx` is fetched from SheetJS's CDN, not npm

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

This looks like a supply-chain smell and gets flagged as one. It is deliberate,
and it was tried the other way round first.

SheetJS stopped publishing to npm at **0.18.5**. That version is still on the
registry and still installable, and it carries two live advisories —
**prototype pollution** and a **ReDoS** — both fixed in 0.19.3+, which exists
only on the CDN. `xlsx` in this app parses **spreadsheets a user supplies**:
bank statements and broker reports, i.e. untrusted input, in a finance app.
Taking the registry version to satisfy a lint rule swaps a hosting concern for
two exploitable bugs on the exact path where they matter.

Measured, not assumed:

| source | version | `npm audit` |
|---|---|---|
| npm registry | 0.18.5 | prototype pollution + ReDoS (HIGH) |
| SheetJS CDN | 0.20.3 | no advisories |

The residual risk is that the CDN, not npm, is the thing that must stay up and
stay honest. Both are mitigated by `package-lock.json`, which pins the exact
`sha512` integrity hash — a tampered or substituted tarball fails `npm ci`
rather than installing. A CDN outage breaks a build, which is visible and
recoverable; a silent prototype-pollution gadget in a statement parser is
neither.

Revisit if SheetJS returns to the registry, or if the parsing moves to a
sandboxed worker where the blast radius is smaller.

## `flutter_secure_storage` is on a beta

`^10.0.0-beta.4` guards the vault salt on mobile. A beta is not a shipping
dependency for a paid security product; the stable 10.x line is the upgrade to
make before the first paid release. Tracked in the launch plan.
