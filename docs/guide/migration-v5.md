# Migration Guide: v4 to v5

Version 5.0.0 removes deprecated APIs and improves type safety. This guide covers the breaking changes.

## Breaking Changes

### 1. Removed `removeAllListeners()`

This method didn't work due to EventTarget API limitations. Use native `removeEventListener` instead.

**Before (v4):**
```typescript
analyzer.on('bpm', handler);
analyzer.removeAllListeners(); // Did nothing!
```

**After (v5):**
```typescript
const handler = (data) => console.log(data);
analyzer.on('bpm', handler);
analyzer.removeEventListener('bpm', handler);
```

### 2. Removed `off()` Method

The `off()` method was unreliable. Use native `removeEventListener`.

**Before (v4):**
```typescript
analyzer.on('bpm', handler);
analyzer.off('bpm', handler);
```

**After (v5):**
```typescript
analyzer.on('bpm', handler);
analyzer.removeEventListener('bpm', handler);
```

**React example:**
```typescript
useEffect(() => {
  const handleBpm = (data) => console.log(data);
  analyzer.on('bpm', handleBpm);
  
  return () => {
    analyzer.removeEventListener('bpm', handleBpm);
    analyzer.disconnect();
  };
}, [analyzer]);
```

## Quick Migration Checklist

- Replace `analyzer.removeAllListeners()` with proper `removeEventListener` calls
- Replace `analyzer.off(event, handler)` with `analyzer.removeEventListener(event, handler)`
- Store handler references to enable cleanup

## Additional Improvements

- **Type Safety**: Return types now use readonly properties
- **Memory Leaks**: Fixed Blob URL cleanup in AudioWorklet registration
- **Documentation**: Updated all examples with proper cleanup patterns
