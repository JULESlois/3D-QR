export type ProjectionView = 'art' | 'qr'

export const PROJECTION_VIEW_REQUEST_EVENT = 'projection-view-request'

export interface ProjectionViewRequestDetail {
  view: ProjectionView
}

export function isProjectionView(value: string): value is ProjectionView {
  return value === 'art' || value === 'qr'
}

/**
 * Request an explicit projection pose without pretending the user clicked the canvas.
 * The renderer remains the sole owner of body[data-mode] and the animated quaternion.
 */
export function requestProjectionView(view: ProjectionView): void {
  document.dispatchEvent(new CustomEvent<ProjectionViewRequestDetail>(
    PROJECTION_VIEW_REQUEST_EVENT,
    { detail: { view } },
  ))
}
