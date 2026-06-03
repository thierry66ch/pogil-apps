import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'

export default function RichTextEditor({ initialContent, onChange, placeholder }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  function addLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href ?? ''
    const url = window.prompt('URL du lien :', prev)
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
  }

  if (!editor) return null

  const act = (isActive, action) => (
    <button type="button"
      className={`rte-btn${isActive ? ' active' : ''}`}
      onMouseDown={e => { e.preventDefault(); action() }}>
    </button>
  )

  return (
    <div className="rte">
      <div className="rte-toolbar">
        {/* Format texte */}
        <button type="button" className={`rte-btn rte-bold${editor.isActive('bold') ? ' active' : ''}`}
          title="Gras (Ctrl+B)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}>G</button>
        <button type="button" className={`rte-btn rte-italic${editor.isActive('italic') ? ' active' : ''}`}
          title="Italique (Ctrl+I)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}>I</button>
        <button type="button" className={`rte-btn rte-underline${editor.isActive('underline') ? ' active' : ''}`}
          title="Souligné (Ctrl+U)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}>S</button>

        <span className="rte-sep" />

        {/* Code */}
        <button type="button" className={`rte-btn rte-code${editor.isActive('code') ? ' active' : ''}`}
          title="Code inline" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}>&lt;&gt;</button>
        <button type="button" className={`rte-btn rte-code${editor.isActive('codeBlock') ? ' active' : ''}`}
          title="Bloc de code" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }}>{ }</button>

        <span className="rte-sep" />

        {/* Listes */}
        <button type="button" className={`rte-btn${editor.isActive('bulletList') ? ' active' : ''}`}
          title="Puces (Tab pour indenter, Maj+Tab pour désindenter)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}>•</button>
        <button type="button" className={`rte-btn${editor.isActive('orderedList') ? ' active' : ''}`}
          title="Liste numérotée"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}>1.</button>

        <span className="rte-sep" />

        {/* Titres */}
        <button type="button" className={`rte-btn rte-h1${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`}
          title="Titre (H1)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}>H1</button>
        <button type="button" className={`rte-btn rte-h2${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
          title="Sous-titre (H2)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}>H2</button>

        <span className="rte-sep" />

        {/* Lien */}
        <button type="button" className={`rte-btn${editor.isActive('link') ? ' active' : ''}`}
          title="Lien" onMouseDown={e => { e.preventDefault(); addLink() }}>🔗</button>
      </div>

      <EditorContent editor={editor} className="rte-content" data-placeholder={placeholder ?? 'Saisissez le contenu…'} />
    </div>
  )
}
