# Publishing Guide

This document describes how to publish `cloudflare-kit` to npm.

## Prerequisites

- npm account with access to the `cloudflare-kit` package
- Node.js 18+ installed
- All tests passing
- Clean git working directory

## Pre-Publish Checklist

Before publishing, ensure:

- [ ] Version updated in `package.json`
- [ ] `CHANGELOG.md` updated with new version
- [ ] All tests passing: `npm test`
- [ ] Build successful: `npm run build`
- [ ] Linting clean: `npm run lint`
- [ ] Documentation updated (if needed)

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, backward compatible

## Publish Steps

### 1. Update Version

```bash
# For major version (breaking changes)
npm version major

# For minor version (new features)
npm version minor

# For patch version (bug fixes)
npm version patch
```

Or manually update `package.json`:

```json
{
  "version": "2.0.0"
}
```

### 2. Update Changelog

Add new version entry to `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format.

### 3. Build Distribution

```bash
npm run build
```

This creates:
- `dist/index.js` - ESM build
- `dist/index.cjs` - CJS build
- `dist/index.d.ts` - TypeScript definitions

### 4. Test the Build

```bash
# Verify files exist
ls -la dist/

# Check bundle size
npm run size
```

### 5. Create Git Tag

```bash
git add -A
git commit -m "Release v2.0.0"
git tag -a v2.0.0 -m "Release version 2.0.0"
git push origin main --tags
```

### 6. Publish to npm

```bash
# Login to npm (if not already logged in)
npm login

# Publish (requires 2FA)
npm publish

# For beta/alpha releases
npm publish --tag beta
```

### 7. Verify Publication

```bash
# Check package on npm
npm view cloudflare-kit

# Install and test
npm install cloudflare-kit@latest
```

### 8. Create GitHub Release

1. Go to [GitHub Releases](https://github.com/bhuvaneshcj/cloudflare-kit/releases)
2. Click "Create a new release"
3. Select the tag (e.g., `v2.0.0`)
4. Add release title: `v2.0.0 - Enterprise Storage`
5. Copy relevant section from `CHANGELOG.md`
6. Attach distribution files (optional)
7. Publish release

## Automated Publishing (CI/CD)

The project includes a GitHub Actions workflow for automated publishing:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

To use automated publishing:

1. Add `NPM_TOKEN` secret to GitHub repository
2. Create and push a tag: `git tag v2.0.0 && git push origin v2.0.0`
3. GitHub Actions will automatically publish

## Beta/Pre-release Versions

For testing new features:

```bash
# Publish as beta
npm version 2.0.0-beta.1
npm publish --tag beta

# Users can install with
npm install cloudflare-kit@beta
```

## Troubleshooting

### "You cannot publish over the previously published versions"

Cannot republish the same version. Bump version number.

### "2FA required"

Enable 2FA on npm account and use:

```bash
npm publish --otp=<code>
```

### "E403 Forbidden"

Check package name availability and npm permissions.

### Build Failures

```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

## Post-Publish

After successful publish:

1. Update documentation site (if applicable)
2. Announce on social media / Discord
3. Close related GitHub issues
4. Update migration guides

## Contact

For publishing issues, contact:
- Maintainer: Bhuvanesh C <cjbhuvanesh8@gmail.com>
- npm: [@cjbhuvanesh8](https://www.npmjs.com/~cjbhuvanesh8)
