# Publishing checklist (maintainer)

## 1. GitHub (public)
```bash
cd verifact
git init -b main && git add -A
git commit -m "Initial release 0.1.0"
git remote add origin https://github.com/isagarpinninti/verifact.git
git push -u origin main
```
Create the empty public repo `isagarpinninti/verifact` first (no README or license). Enable private vulnerability reporting under *Settings → Security*, and add repo topics.

## 2. npm scope `@verifact`
1. `npm login` (2FA on).
2. Create the organization at <https://www.npmjs.com/org/create>: **verifact**.
3. Create a scoped token and add it as the repo secret `NPM_TOKEN`:
   ```bash
   npm token create --name "verifact-release" --scopes @verifact --packages-and-scopes-permission read-write --expires 90 --bypass-2fa
   ```

## 3. Publish
Automated: push a tag; the release workflow builds, tests and publishes with provenance.
```bash
git tag v0.1.0 && git push origin v0.1.0
```
Manual (order matters, `react` and `cli` depend on `core`):
```bash
npm run ci
npm publish -w @verifact/core  --access public
npm publish -w @verifact/react --access public
npm publish -w @verifact/cli   --access public
```
New scoped packages may sit in npm's staged-release state until you approve them on npmjs.com. Do not do both the tag and the manual publish for the same version.

## 4. Verify the published package
```bash
cd "$(mktemp -d)" && npx @verifact/cli init demo && cd demo && npx @verifact/cli validate
```

## Before every release
`npm run ci` must pass, update `CHANGELOG.md`, bump all four `package.json` versions together.
