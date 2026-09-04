/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NDEFReadingEvent extends Event {
  message: {
    records: Array<{
      recordType: string
      data: DataView | null
      encoding?: string
    }>
  }
}

interface NDEFReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>
  addEventListener: (
    type: 'reading' | 'readingerror',
    listener: EventListener,
  ) => void
}

declare const NDEFReader: {
  prototype: NDEFReader
  new (): NDEFReader
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
