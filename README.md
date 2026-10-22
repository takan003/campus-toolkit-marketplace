# campus-toolkit marketplace

This repository is the external module marketplace for the `campus-toolkit` host app.

It provides:

- a public marketplace index: `index.json`
- one or more module metadata definitions under `modules/`
- release assets under `releases/`

The host app reads the marketplace index and installs modules from the listed download URLs.

## Planning docs

- [模組開發與發布指南（精簡版）](./模組開發與發布指南.md) — module developers start here; full guide: `takan003/campus-toolkit` → `docs/選用功能模組開發者指南.md`
- [外部模組市集架設規劃書](./MARKETPLACE-PLAN.md)
- [主題市集規劃書](./主題市集規劃書.md)
- [模組市集精進方案規劃書（V2）](./模組市集精進方案規劃書.md)

## Directory structure

```text
campus-toolkit-marketplace/
├─ index.json
├─ README.md
├─ modules/
│  └─ examRegistration/
│     └─ module.json
├─ releases/
│  └─ examRegistration.zip
├─ .gitignore
└─ MARKETPLACE-PLAN.md
```

## Contract

Each `index.json` entry includes:

- `id`
- `name`
- `description`
- `version`
- `latestVersion`
- `minHostVersion`
- `repoUrl`
- `downloadUrl`
- `checksumSha256`
- `category`
- `tags`

## Security

- download URL must be trusted
- checksum must be validated before install
- host version must satisfy `minHostVersion`
- only HTTPS URLs are recommended for production

## Publishing checklist (required)

Before merging marketplace changes, make sure every module release passes all checks below:

1. `releases/<moduleId>.zip` contains a complete module package (`module.json`, `admin/`, `student/`, `api/`, `components/`, `lib/`, `types/`).
2. `index.json` and `site/index.json` use identical `modules[]` records.
3. `version`, `latestVersion`, `minHostVersion` are valid semver (`x.y.z`).
4. `checksumSha256` is lowercase 64-hex and matches the actual zip digest.
5. `modules/<moduleId>/module.json` stays consistent with `index.json` (`value`, `author.version`, `minHostVersion`).

Validation is enforced by CI workflow:

- [`.github/workflows/validate-marketplace.yml`](./.github/workflows/validate-marketplace.yml)
- [`scripts/validate-marketplace-index.mjs`](./scripts/validate-marketplace-index.mjs)

Run the same checks locally:

```bash
node scripts/validate-marketplace-index.mjs
```
