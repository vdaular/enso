import DocumentationImage from '@/components/MarkdownEditor/DocumentationImage.vue'
import type { VueHost } from '@/components/VueComponentHost.vue'
import { syntaxTree } from '@codemirror/language'
import { type EditorSelection, type Extension, RangeSetBuilder, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common'
import { h, markRaw } from 'vue'

/** Extension applying decorators for Markdown. */
export function markdownDecorators({ vueHost }: { vueHost: VueHost }): Extension {
  const stateDecorator = new TreeStateDecorator(vueHost, [
    decorateImageWithClass,
    decorateImageWithRendered,
  ])
  const stateDecoratorExt = EditorView.decorations.compute(['doc'], (state) =>
    stateDecorator.decorate(syntaxTree(state), state.doc),
  )
  const viewDecoratorExt = ViewPlugin.define(
    (view) => new TreeViewDecorator(view, vueHost, [decorateLink]),
    {
      decorations: (v) => v.decorations,
    },
  )
  const cursorDecoratorExt = EditorView.decorations.compute(['selection', 'doc'], (state) =>
    cursorDecorations(state.selection, state.doc),
  )
  return [stateDecoratorExt, viewDecoratorExt, cursorDecoratorExt]
}

interface NodeDecorator {
  (
    nodeRef: SyntaxNodeRef,
    doc: Text,
    emitDecoration: (from: number, to: number, deco: Decoration) => void,
    vueHost: VueHost,
  ): void
}

// === Tree state decorator ===

/** Maintains a set of decorations based on the tree. */
class TreeStateDecorator {
  constructor(
    private readonly vueHost: VueHost,
    private readonly nodeDecorators: NodeDecorator[],
  ) {}

  decorate(tree: Tree, doc: Text): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const emit = (from: number, to: number, value: Decoration) => {
      builder.add(from, to, value)
    }
    tree.iterate({
      enter: (nodeRef) => {
        for (const decorator of this.nodeDecorators) decorator(nodeRef, doc, emit, this.vueHost)
      },
    })
    return builder.finish()
  }
}

// === Cursor decorator ===

function cursorDecorations(selection: EditorSelection, doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of selection.ranges) {
    const line = doc.lineAt(range.from)
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: 'cm-has-cursor',
      }),
    )
    if (range.to != range.from) {
      // TODO: Add decorations to each line
    }
  }
  return builder.finish()
}

// === Tree view decorator ===

/** Maintains a set of decorations based on the tree, lazily-constructed for the visible range of the document. */
class TreeViewDecorator implements PluginValue {
  decorations: DecorationSet

  constructor(
    view: EditorView,
    private readonly vueHost: VueHost,
    /**
     * Functions that construct decorations based on tree. The decorations must not have significant impact on the
     * height of the document, or scrolling issues would result, because decorations are lazily computed based on the
     * current viewport.
     */
    private readonly nodeDecorators: NodeDecorator[],
  ) {
    this.decorations = this.buildDeco(syntaxTree(view.state), view)
  }

  update(update: ViewUpdate) {
    // TODO
    // Attaching widgets can change the geometry, so don't re-attach widgets in response to geometry changes.
    // Reusing unchanged widgets would be a better solution, but this works correctly as long as rendering widgets
    // within the `visibleRanges` doesn't bring any new content into the `visibleRanges`; in practice this should hold.
    //if (!update.docChanged && !update.viewportChanged) return
    if (!update.docChanged) return
    this.decorations = this.buildDeco(syntaxTree(update.state), update.view)
  }

  private buildDeco(tree: Tree, view: EditorView) {
    if (!tree.length) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const doc = view.state.doc
    const emit = (from: number, to: number, value: Decoration) => {
      builder.add(from, to, value)
    }
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter: (nodeRef) => {
          for (const decorator of this.nodeDecorators) decorator(nodeRef, doc, emit, this.vueHost)
        },
      })
    }
    return builder.finish()
  }
}

// === Links ===

/** Parse a link or image */
function parseLinkLike(node: SyntaxNode, doc: Text) {
  const textOpen = node.firstChild // [ or ![
  if (!textOpen) return
  const textClose = textOpen.nextSibling // ]
  if (!textClose) return
  const urlOpen = textClose.nextSibling // (
  // The parser accepts partial links such as `[Missing url]`.
  if (!urlOpen) return
  const urlNode = urlOpen.nextSibling
  // If the URL is empty, this will be the closing 'LinkMark'.
  if (urlNode?.name !== 'URL') return
  return {
    textFrom: textOpen.to,
    textTo: textClose.from,
    url: doc.sliceString(urlNode.from, urlNode.to),
  }
}

function decorateLink(
  nodeRef: SyntaxNodeRef,
  doc: Text,
  emitDecoration: (from: number, to: number, deco: Decoration) => void,
) {
  if (nodeRef.name === 'Link') {
    const parsed = parseLinkLike(nodeRef.node, doc)
    if (!parsed) return
    const { textFrom, textTo, url } = parsed
    if (textFrom === textTo) return
    emitDecoration(
      textFrom,
      textTo,
      Decoration.mark({
        tagName: 'a',
        attributes: { href: url },
      }),
    )
  }
}

// === Images ===

function decorateImageWithClass(
  nodeRef: SyntaxNodeRef,
  _doc: Text,
  emitDecoration: (from: number, to: number, deco: Decoration) => void,
) {
  if (nodeRef.name === 'Image') {
    emitDecoration(
      nodeRef.from,
      nodeRef.to,
      Decoration.mark({
        class: 'cm-image-markup',
      }),
    )
  }
}

function decorateImageWithRendered(
  nodeRef: SyntaxNodeRef,
  doc: Text,
  emitDecoration: (from: number, to: number, deco: Decoration) => void,
  vueHost: VueHost,
) {
  if (nodeRef.name === 'Image') {
    const parsed = parseLinkLike(nodeRef.node, doc)
    if (!parsed) return
    const { textFrom, textTo, url } = parsed
    const text = doc.sliceString(textFrom, textTo)
    const widget = new ImageWidget({ alt: text, src: url }, vueHost)
    emitDecoration(
      nodeRef.to,
      nodeRef.to,
      Decoration.widget({
        widget,
        // Ensure the cursor is drawn relative to the content before the widget.
        // If it is drawn relative to the widget, it will be hidden when the widget is hidden (i.e. during editing).
        side: 1,
      }),
    )
  }
}

class ImageWidget extends WidgetType {
  private container: HTMLElement | undefined
  private vueHostRegistration: { unregister: () => void } | undefined

  constructor(
    private readonly props: {
      readonly alt: string
      readonly src: string
    },
    private readonly vueHost: VueHost,
  ) {
    super()
  }

  override get estimatedHeight() {
    return -1
  }

  override eq(other: WidgetType) {
    return (
      other instanceof ImageWidget &&
      other.props.src == this.props.src &&
      other.props.alt == this.props.alt
    )
  }

  override toDOM(): HTMLElement {
    if (!this.container) {
      const container = markRaw(document.createElement('span'))
      container.className = 'cm-image-rendered'
      this.vueHostRegistration = this.vueHost.register(
        h(DocumentationImage, {
          src: this.props.src,
          alt: this.props.alt,
        }),
        container,
      )
      this.container = container
    }
    return this.container
  }

  override destroy() {
    this.vueHostRegistration?.unregister()
    this.container = undefined
  }
}
