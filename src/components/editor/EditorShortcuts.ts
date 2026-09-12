import { Extension } from '@tiptap/core'

interface EditorShortcutOptions {
  onInsertLink: () => void
}

export const EditorShortcuts = Extension.create<EditorShortcutOptions>({
  name: 'editorShortcuts',

  addOptions() {
    return {
      onInsertLink: () => undefined,
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.options.onInsertLink()
        return true
      },
    }
  },
})
