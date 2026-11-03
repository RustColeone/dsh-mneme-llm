// Notes (mneme_llm/memory.py) come in a later version. Their term index is here already, so a file whose index is
// rebuilt here (`Store.reindex`) is whole for the Python package too.
import * as texts from './text.js'

/** Every live note of the file in the term index again: the terms of its text, its key's parts and its gloss. */
export function reindexNotes (store) {
  store.execute('delete from note_terms')
  const notes = store.rows('select * from memories where deleted_at is null and superseded_by is null')
  store.transaction(() => {
    for (const note of notes) {
      store.execute('delete from note_terms where memory_id = ?', [note.id])
      for (const term of texts.terms([note.text, (note.key || '').replaceAll('.', ' '), note.gloss || ''].join(' '))) {
        store.execute('insert or ignore into note_terms (space, subject, term, memory_id) select space, subject, ?, ' +
          'id from memories where id = ?', [term, note.id])
      }
    }
  })
}

/** Everyone a note is kept of, hidden ones too: they stay until a purge. */
export const noteSubjects = (store, space) => store.rows(
  'select distinct subject from memories where space = ? order by subject', [space]).map(row => row.subject)
