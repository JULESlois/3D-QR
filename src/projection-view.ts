export type ProjectionView = 'art' | 'qr'

export const PROJECTION_VIEW_REQUEST_EVENT = 'projection-view-request'
export const PROJECTION_VIEW_CHANGE_EVENT = 'projection-view-change'

export interface ProjectionViewRequestDetail {
  view: ProjectionView
}

export interface ProjectionViewChangeDetail {
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

/**
 * Publish a committed projection view after the navigation controller has updated the
 * scanner-facing mesh state, animated view target, and UI copy.
 */
export function notifyProjectionViewChanged(view: ProjectionView): void {
  document.dispatchEvent(new CustomEvent<ProjectionViewChangeDetail>(
    PROJECTION_VIEW_CHANGE_EVENT,
    { detail: { view } },
  ))
}
