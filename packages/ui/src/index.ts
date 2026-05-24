import { tokens } from '@helixbi/tokens'

export function applyThemeStyle(element: HTMLElement): void {
  element.style.fontFamily = tokens.typography.fontFamily
  element.style.backgroundColor = tokens.colors.background
  element.style.color = tokens.colors.text
  console.warn('[HelixUI] Applied token styles to element')
}
