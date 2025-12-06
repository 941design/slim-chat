# Design Patterns and Guidelines

## Architectural Patterns

### Electron Multi-Process Architecture
The application strictly follows Electron's security best practices:

1. **Main Process** (`src/main/`)
   - Node.js environment with full system access
   - Manages application lifecycle
   - Creates and manages browser windows
   - Handles system-level operations (file I/O, updates, native features)
   - Communicates with renderer via IPC

2. **Preload Script** (`src/preload/`)
   - Runs in isolated context before renderer
   - Uses `contextBridge` to safely expose APIs to renderer
   - Never exposes full Node.js or Electron APIs directly
   - Acts as security boundary

3. **Renderer Process** (`src/renderer/`)
   - Chromium-based, sandboxed environment
   - Runs React application
   - No direct access to Node.js APIs
   - Communicates with main process only through preload-exposed APIs

### Nested API Structure (GAP-007)
The renderer API is organized into logical namespaces:
```typescript
window.api = {
  updates: {
    checkNow(),
    downloadUpdate(),
    restartToUpdate(),
    onUpdateState()
  },
  config: {
    get(),
    set()
  },
  system: {
    getStatus()
  }
}
```

## Security Patterns

### Cryptographic Verification (GAP-001, GAP-006, GAP-008)
Security-critical operations follow a rigorous verification pattern:

1. **Signature Verification** (Ed25519)
   - Always verify signatures before trusting manifest data
   - Use canonical JSON format for signature payload
   - Fail closed: reject on any error

2. **Hash Verification** (SHA-256)
   - Verify all downloaded artifacts against manifest hashes
   - Use streaming hash computation for large files
   - Compare hashes in constant time to prevent timing attacks

3. **Version Validation**
   - Validate semantic versioning format
   - Prevent downgrade attacks
   - Check version consistency across manifest

### Defense in Depth
Multiple layers of security:
- Ed25519 signature verification (authenticity)
- SHA-256 hash verification (integrity)
- Semantic version validation (consistency)
- HTTPS for manifest/artifact downloads

## Testing Patterns

### Property-Based Testing
Use `fast-check` for testing invariants:
- Define arbitraries for domain types
- Test properties that should hold for all inputs
- Especially important for security-critical code

Example pattern:
```typescript
fc.assert(
  fc.property(arbitraryInput, (input) => {
    const result = functionUnderTest(input);
    return expectedProperty(result);
  })
);
```

### CONTRACT Documentation
For critical functions, document formal contracts:
- Inputs: preconditions
- Outputs: postconditions
- Invariants: conditions that must always hold
- Properties: behavioral characteristics
- Algorithm: implementation approach
- Error Conditions: failure modes

### Test Organization
- Co-locate tests with source files
- Use descriptive test names: `it('should verify valid signature')`
- Group related tests in `describe` blocks
- Create helper functions for complex test setup

## Configuration Management

### Layered Configuration
1. **Default Config**: Hardcoded defaults in code
2. **User Config**: Stored persistently, modified via config API
3. **Runtime Config**: Environment variables for CI/CD (e.g., `ED25519_PRIVATE_KEY`)

### Config API Pattern
```typescript
getConfig(): Promise<AppConfig>        // Read current config
setConfig(partial): Promise<AppConfig> // Update config (merge with existing)
```

## Update System Architecture

### State Machine Pattern
Update process follows a strict state machine:
```
idle → checking → available → downloading → downloaded → 
verifying → ready → (restart)
           ↓
         failed
```

### Event-Driven Updates
- Main process emits update state changes
- Renderer subscribes to state changes via IPC
- Callbacks unsubscribed when component unmounts

### Progress Reporting (GAP-009)
Provide detailed progress for long-running operations:
```typescript
{
  percent: number,
  bytesPerSecond: number,
  transferred: number,
  total: number
}
```

## IPC Communication Pattern

### Handler Registration
Main process registers IPC handlers:
```typescript
ipcMain.handle('channel-name', async (event, ...args) => {
  // Handle request
  return result;
});
```

### API Exposure
Preload script exposes handlers via contextBridge:
```typescript
contextBridge.exposeInMainWorld('api', {
  functionName: (...args) => ipcRenderer.invoke('channel-name', ...args)
});
```

### Renderer Invocation
Renderer calls exposed API:
```typescript
const result = await window.api.functionName(...args);
```

## Error Handling

### Fail Closed for Security
Security operations fail closed:
- Return `false` or throw on invalid signatures
- Reject updates with hash mismatches
- Never proceed on verification errors

### Graceful Degradation for Features
Non-critical features fail gracefully:
- Log errors appropriately
- Show user-friendly error messages
- Allow retry where appropriate

## Logging Pattern

### Structured Logging
Use electron-log with appropriate levels:
- `debug`: Detailed diagnostic information
- `info`: General informational messages
- `warn`: Warning conditions
- `error`: Error conditions

### Log Security
- Never log sensitive data (private keys, user data)
- Log verification failures for audit
- Rotate logs based on retention policy (GAP-011)

## Build and Release

### Separation of Concerns
- Main, preload, renderer built separately
- Different build tools optimized for each process
- Clean builds remove all artifacts first

### Manifest Generation
- Automated manifest creation from built artifacts
- Sign manifests during build process
- Never commit signed manifests (regenerate for each release)

### Release Automation
- GitHub Actions for CI/CD
- Automated releases triggered by version tags (x.x.x format)
- Multiple platform builds in parallel

## Key Security Principles

1. **Never trust user input** - validate everything
2. **Fail closed** - reject on any error in security operations
3. **Defense in depth** - multiple verification layers
4. **Principle of least privilege** - renderer has minimal access
5. **Cryptographic verification** - always verify signatures and hashes
6. **No secrets in code** - use environment variables for keys
