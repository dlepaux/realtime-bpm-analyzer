// A file's name on the home tool's result, on one line (RBA-116, round 2). A long name wrapped onto
// three lines and grew the result 20 px past its reserved height on phones, so the name is cut in
// the middle instead: the start and the end, extension included, are what tell two files apart.
// Pure, so the rba-web port can reuse it as it is.

/** How many characters, as drawn, stay whole at the end of a cut name. */
export const FILE_NAME_TAIL = 16

export type FileNameParts = { readonly head: string; readonly tail: string }

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * `name` split so `head + tail === name`: the head may be clipped with an ellipsis, the tail never
 * is. Counted in graphemes, so a flag or an accented letter is never cut in two.
 */
export function fileNameParts(name: string): FileNameParts {
  const characters = Array.from(graphemes.segment(name), (part) => part.segment)
  if (characters.length <= FILE_NAME_TAIL) return { head: '', tail: name }
  return {
    head: characters.slice(0, -FILE_NAME_TAIL).join(''),
    tail: characters.slice(-FILE_NAME_TAIL).join(''),
  }
}
