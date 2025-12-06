# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2022
- **Module**: ESNext with Node module resolution
- **Strict mode**: Enabled
- **JSX**: react-jsx
- **esModuleInterop**: true
- **forceConsistentCasingInFileNames**: true
- **skipLibCheck**: true

## File Naming
- TypeScript source files: `.ts` extension
- React components: `.tsx` extension
- Test files: `.test.ts` suffix (e.g., `verify.test.ts`)
- Configuration files: Various formats (`.js`, `.ts`, `.json`)

## Code Organization

### Modular Structure
- Separate concerns by directory: `main/`, `preload/`, `renderer/`, `shared/`
- Group related functionality in subdirectories (e.g., `security/`, `update/`, `ipc/`)
- Shared types go in `src/shared/types.ts`

### Naming Conventions
- **Functions**: camelCase (e.g., `verifySignature`, `createWindow`, `checkForUpdates`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `PUBLIC_KEY`, `TEST_KEYPAIR`)
- **Types/Interfaces**: PascalCase (e.g., `SignedManifest`, `AppConfig`, `UpdateState`)
- **Variables**: camelCase (e.g., `mainWindow`, `updateState`, `lastUpdateCheck`)

## Documentation Style

### File-level Comments
Use JSDoc-style comments at the top of important modules with:
- Reference to requirements/gaps (e.g., `GAP-001, GAP-006, GAP-008`)
- Purpose of the module
- Security notes if applicable

Example:
```typescript
/**
 * GAP-001, GAP-006, GAP-008: Manifest verification with Ed25519 signatures and SHA-256 hashes
 *
 * This module verifies downloaded update artifacts against signed manifests.
 * Security-critical: all cryptographic operations must succeed before accepting updates.
 */
```

### Function-level Documentation
Critical functions include extensive CONTRACT documentation:
- **Inputs**: Parameter types and constraints
- **Outputs**: Return type and meaning
- **Invariants**: Conditions that must hold
- **Properties**: Expected behavior characteristics
- **Algorithm**: Step-by-step description
- **Error Conditions**: How errors are handled

Example structure seen in `verify.ts`:
```typescript
/**
 * Verify Ed25519 signature on manifest
 *
 * CONTRACT:
 *   Inputs: ...
 *   Outputs: ...
 *   Invariants: ...
 *   Properties: ...
 *   Algorithm: ...
 *   Error Conditions: ...
 */
```

### Inline Comments
- Use inline comments for GAP references (e.g., `// GAP-005`, `// GAP-011`)
- Comment security-critical sections
- Keep comments concise and meaningful

## Type Definitions

### Prefer Types Over Interfaces for Unions
```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type UpdatePhase = 'idle' | 'checking' | 'available' | ...;
```

### Use Interfaces for Object Shapes
```typescript
export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  manifestUrl?: string;
}
```

### Export Types from Shared Module
All shared types between processes go in `src/shared/types.ts`

## Testing Conventions

### Test Framework: Jest
- Use `@jest/globals` imports: `describe`, `it`, `expect`, `beforeAll`, `afterAll`
- Test files co-located with source: `verify.ts` → `verify.test.ts`

### Property-Based Testing
- Use `fast-check` library for property-based tests
- Define custom arbitraries for domain-specific data

Example:
```typescript
import fc from 'fast-check';
const hashArb = fc.string({ minLength: 60, maxLength: 70 }).map(s => s.padEnd(64, 'a'));
```

### Test Structure
```typescript
describe('functionName', () => {
  it('should do something specific', () => {
    // arrange, act, assert
  });
});
```

### Helper Functions
Create helper functions for test data generation (e.g., `createValidManifest()`)

## Build Configuration

### Main and Preload Processes
- Built with `tsup`
- Target: Node 18
- Format: CommonJS
- Output: `dist/main/` and `dist/preload/`
- Source maps enabled

### Renderer Process
- Built with Vite
- Uses `@vitejs/plugin-react`
- Output: `dist/renderer/`

## Version Control
- Git repository with `.gitignore` excluding:
  - `node_modules/`
  - `dist/`, `out/`, `release/`
  - Playwright test results
  - `.DS_Store`

## No Linter/Formatter Configuration
The project does not have ESLint or Prettier configuration files at the root level. Type checking is done via TypeScript compiler (`tsc --noEmit`).
