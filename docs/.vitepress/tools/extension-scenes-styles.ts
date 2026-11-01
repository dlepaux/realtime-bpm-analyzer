import restStyles from '../theme/extension-scenes-rest.css?inline'

let adopted = false

// Attached by hand because VitePress bundles every stylesheet it can see into the one the whole
// site loads, and these only matter to a computer that is about to play the demo.
export function adoptSceneStyles(): void {
  if (adopted || typeof document === 'undefined') return
  adopted = true
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(restStyles)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
}
