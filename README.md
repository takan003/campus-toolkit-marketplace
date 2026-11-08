# campus-toolkit marketplace

[![Validate marketplace index](https://github.com/takan003/campus-toolkit-marketplace/actions/workflows/validate-marketplace.yml/badge.svg)](https://github.com/takan003/campus-toolkit-marketplace/actions/workflows/validate-marketplace.yml)

This repository is the external module marketplace for the `campus-toolkit` host app.

It provides:

- a public marketplace index: `index.json`
- one or more module metadata definitions under `modules/`
- release assets under `releases/`

The host app reads the marketplace index and installs modules from the listed download URLs.

## Planning docs

- [模組開發與發布指南（精簡版）](./模組開發與發布指南.md) — module developers start here; full guide: `takan003/campus-toolkit` → `docs/選用功能模組開發者指南.md`
- [模組投稿與審核流程（B+）](./docs/投稿與審核流程.md)
- [外部模組市集架設規劃書](./MARKETPLACE-PLAN.md)
- [主題市集規劃書](./主題市集規劃書.md)
- [模組市集精進方案規劃書（V2）](./模組市集精進方案規劃書.md)

## Directory structure

```text
campus-toolkit-marketplace/
├─ index.json
├─ keys.json
├─ README.md
├─ docs/
│  └─ 投稿與審核流程.md
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
- `status`（`official`／`reviewed`／`experimental`）
- `version`
- `latestVersion`
- `minHostVersion`
- `repoUrl`
- `downloadUrl`
- `checksumSha256`
- `category`
- `tags`
- `signature`／`publicKey`（`reviewed` 必填；ed25519 簽 zip sha256）

## Author keys (`keys.json`)

Each key record contains `author`, `keyId` (auto-computed from the public key),
`publicKey` (base64 ed25519 SPKI), `status` (`active`／`revoked`), and optional
`addedAt`, `note`, `repos`.

```bash
npm run keys:list          # list keys and status
npm run keys:validate      # validate keys.json (also runs in CI)
npm run keys:add -- --author <name> --public-key <base64> --repos owner/repo
npm run keys:revoke -- --key-id sha256:... --author <name>
npm run keys:rotate -- --author <name> --public-key <new-base64>
npm run keys:affected -- --key-id sha256:...
npm run keys:export-trust  # output MODULE_MARKET_TRUSTED_KEYS JSON for a host
```

Rotation uses an overlap window: add the new key first, re-sign and republish all
modules, then revoke the old key. Revoking a key makes every module signed with it
fail validation until it is re-signed or removed. See
[`docs/投稿與審核流程.md`](./docs/投稿與審核流程.md) for the full workflow.

## Security

- download URL must be trusted
- checksum must be validated before install
- `reviewed` must carry a valid ed25519 signature
- `publicKey` must match an active key in `keys.json` for the same author
- host version must satisfy `minHostVersion`
- only HTTPS URLs are recommended for production

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).
Do not open a public issue with reproducible attack details.

## Publishing checklist (required)

Before merging marketplace changes, make sure every module release passes all checks below:

1. `releases/<moduleId>.zip` contains a complete module package (`module.json`, `admin/`, `student/`, `api/`, `components/`, `lib/`, `types/`).
2. `index.json` and `site/index.json` use identical `modules[]` records.
3. `version`, `latestVersion`, `minHostVersion` are valid semver (`x.y.z`).
4. `checksumSha256` is lowercase 64-hex and matches the actual zip digest.
5. `modules/<moduleId>/module.json` stays consistent with `index.json` (`value`, `author.version`, `minHostVersion`).
6. If `status=reviewed`, `signature` and `publicKey` are present, the key is active in `keys.json`, and the signature verifies the zip digest.

Validation is enforced by CI workflow:

- [`.github/workflows/validate-marketplace.yml`](./.github/workflows/validate-marketplace.yml)
- [`scripts/validate-marketplace-index.mjs`](./scripts/validate-marketplace-index.mjs)

Run the same checks locally:

```bash
node scripts/validate-marketplace-index.mjs
```

## Maintainer: required status checks

In GitHub **Settings → Branches**, make `Validate marketplace index / validate` a required
status check so a broken `index.json` or `releases/*.zip` cannot reach `main`.

## License

[MIT](LICENSE)
