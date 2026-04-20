// Local ambient declarations for `import.meta.env`.
// VitePress bundles Vite internally (nested in node_modules/vitepress/node_modules/vite),
// so `/// <reference types="vite/client" />` is not resolvable from the docs package
// root. We declare only the fields our code actually uses.
//
// NOTE: `interface` (not `type`) is required — TypeScript only merges ambient
// declarations for global types like ImportMeta via interface declaration
// merging. Using `type` would shadow the global instead of augmenting it.

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// CSS side-effect imports (e.g. `import './custom.css'`).
declare module '*.css' {
  const content: string
  export default content
}
