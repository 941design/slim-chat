# Task Completion Checklist

When completing a development task in Nostling, follow this checklist:

## 1. Code Quality Checks

### Type Checking
```bash
npm run lint    # Run TypeScript type checking
```
- Must pass with no type errors
- Ensure all new code has proper type annotations

## 2. Testing

### Run Unit Tests
```bash
npm test        # Run all Jest unit tests
```
- All tests must pass
- Add new tests for new functionality
- Update tests if modifying existing functionality

### Run E2E Tests (if applicable)
```bash
npm run test:e2e   # Run Playwright E2E tests
```
- Required for changes affecting UI or main process behavior
- All tests must pass
- Consider adding E2E tests for new user-facing features

## 3. Build Verification

### Build All Processes
```bash
npm run build   # Clean and build all processes
```
- Ensure build completes without errors
- Verify no build warnings that indicate problems

### Test Individual Builds (if needed)
```bash
npm run build:main      # If you changed main process
npm run build:preload   # If you changed preload script
npm run build:renderer  # If you changed renderer
```

## 4. Security Considerations

For changes to security-critical code (especially in `src/main/security/`):
- Ensure cryptographic operations maintain their invariants
- Verify error handling doesn't leak sensitive information
- Check that all security properties are preserved
- Review CONTRACT documentation if updating security functions

## 5. Documentation Updates

### Update Documentation
- Update README.md if adding new features or changing commands
- Update inline comments and JSDoc for modified functions
- Add GAP references if implementing specification items
- Update CHANGELOG.md for notable changes

## 6. Version Control

### Commit Changes
```bash
git add <files>
git commit -m "descriptive message"
```
- Write clear, descriptive commit messages
- Reference issue numbers if applicable

### Check Git Status
```bash
git status
```
- Ensure no unintended files are staged
- Verify all necessary files are committed

## 7. Before Pull Request

### Full Verification
```bash
make verify     # Run lint + all tests (unit + E2E)
```
OR
```bash
make ci         # Full CI pipeline: install, verify, build
```

### Final Checks
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No type errors
- [ ] Documentation updated
- [ ] Code follows project conventions
- [ ] No security vulnerabilities introduced

## Quick Reference Commands

**Minimum for most tasks:**
```bash
npm run lint && npm test && npm run build
```

**Full verification before PR:**
```bash
make verify
```

**Clean slate verification:**
```bash
make clean && make install && make verify && make build
```
