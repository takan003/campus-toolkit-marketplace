# campus-toolkit marketplace

This repository is the external module marketplace for the `campus-toolkit` host app.

It provides:

- a public marketplace index: `index.json`
- one or more module metadata definitions under `modules/`
- release assets under `releases/`

The host app reads the marketplace index and installs modules from the listed download URLs.

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
