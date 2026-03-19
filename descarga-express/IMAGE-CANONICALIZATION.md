# Image Library

The public image contract for this repo is now simple:

- Page HTML should use `/img/...`.
- `public/img/` is the only delivery layer the site should depend on.
- The old Wix-oriented staging tree under `public/assets/img/` has been retired.

## Public Structure

- `/img/icons/...`
- `/img/avatars/...`
- `/img/shared/...`
- `/img/<domain>/<page>/image-001.ext`

Use route-shaped folders and short filenames. Do not reintroduce Wix `v1/fill/...`, density variants, or remote image URLs into page HTML.

## Script

The maintained script is `scripts/build-simple-image-library.js`.

Usage:

```bash
node scripts/build-simple-image-library.js --dry-run
node scripts/build-simple-image-library.js --write
```

What it does:

- scans every HTML file under `sites/`
- materializes the local image library into `public/img/`
- rewrites HTML from legacy local refs to `/img/...`
- writes `SIMPLE-IMAGE-LIBRARY-REPORT.json` and `SIMPLE-IMAGE-LIBRARY-REPORT.md`

## Runtime Notes

- `public/assets/js/local/image-fallback.js` is still kept as a light compatibility layer for avatar restoration and safe local image hydration.
- Blog and community avatars are resolved through `public/assets/data/avatar-manifest.json`, but the manifest now points at `/img/avatars/...`.

## Recommended Workflow

1. Run `build-simple-image-library.js --dry-run`.
2. Run `build-simple-image-library.js --write`.
3. Spot-check representative pages in a browser.
4. Confirm there are no image requests to `/assets/img/`.
