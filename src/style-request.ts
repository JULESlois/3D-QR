import { isStyleId, type StyleId } from './styles'

export const STYLE_REQUEST_EVENT = 'style-request'
export const STYLE_CHANGE_EVENT = 'style-change'

export interface StyleRequestDetail {
  styleId: StyleId
}

export function isStyleRequestDetail(value: unknown): value is StyleRequestDetail {
  if (!value || typeof value !== 'object' || !('styleId' in value)) return false
  const styleId = (value as { styleId?: unknown }).styleId
  return typeof styleId === 'string' && isStyleId(styleId)
}

export function notifyStyleChanged(styleId: StyleId): void {
  document.dispatchEvent(new CustomEvent<StyleRequestDetail>(STYLE_CHANGE_EVENT, {
    detail: { styleId },
  }))
}

export function requestStyle(styleId: StyleId): void {
  document.dispatchEvent(new CustomEvent<StyleRequestDetail>(STYLE_REQUEST_EVENT, {
    detail: { styleId },
  }))
}
