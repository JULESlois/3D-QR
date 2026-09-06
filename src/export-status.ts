export const GIF_EXPORT_STATUS_EVENT = 'gif-export-status'

export type GifExportStatus =
  | { phase: 'preparing' }
  | { phase: 'encoding'; progress: number }
  | { phase: 'complete' }
  | { phase: 'error'; message: string }

export function publishGifExportStatus(status: GifExportStatus): void {
  document.dispatchEvent(new CustomEvent<GifExportStatus>(GIF_EXPORT_STATUS_EVENT, {
    detail: status,
  }))
}
