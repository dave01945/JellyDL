/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JELLYFIN_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
