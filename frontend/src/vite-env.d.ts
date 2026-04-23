/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string
    readonly VITE_APP_TITLE: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
