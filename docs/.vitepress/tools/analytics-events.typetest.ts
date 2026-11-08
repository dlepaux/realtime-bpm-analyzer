// Compile-time checks of track()'s typing (RBA-154), run by the docs typecheck (vue-tsc). Never
// imported: each @ts-expect-error fails the typecheck if the line it guards starts compiling.
import { track } from '../composables/useAnalytics'

export function typeChecks(): void {
  track('bpm_file_restart')
  // @ts-expect-error an event that declares no param takes no argument
  track('bpm_file_restart', { bpm: 1 })
  // @ts-expect-error not even an empty object, which `{}` typing would let through
  track('bpm_file_restart', 'oops')

  track('extension_link_clicked', { placement: 'home_door', target: 'page' })
  // @ts-expect-error a required param is missing
  track('extension_link_clicked', { placement: 'home_door' })
  // @ts-expect-error a value outside the enum
  track('extension_link_clicked', { placement: 'home_door', target: 'elsewhere' })
  // @ts-expect-error a param the event doesn't declare
  track('extension_link_clicked', { placement: 'home_door', target: 'page', bpm: 120 })
  // @ts-expect-error a name outside the catalogue
  track('bpm_something_new')
}
