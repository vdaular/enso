import { RawAstExtended } from '@/util/ast/extended'
import { RawAst } from '@/util/ast/raw'
import {
  defineLanguageFacet,
  foldNodeProp,
  Language,
  languageDataProp,
  LanguageSupport,
} from '@codemirror/language'
import {
  type Input,
  NodeProp,
  NodeSet,
  NodeType,
  Parser,
  type PartialParse,
  Tree,
} from '@lezer/common'
import { styleTags, tags } from '@lezer/highlight'
import * as iter from 'enso-common/src/utilities/data/iter'

const nodeTypes: NodeType[] = [
  ...RawAst.Tree.typeNames.map((name, id) => NodeType.define({ id, name })),
  ...RawAst.Token.typeNames.map((name, id) =>
    NodeType.define({ id: id + RawAst.Tree.typeNames.length, name: 'Token' + name }),
  ),
]

const nodeSet = new NodeSet(nodeTypes).extend(
  styleTags({
    Ident: tags.variableName,
    'Private!': tags.variableName,
    Number: tags.number,
    'Wildcard!': tags.variableName,
    'TextLiteral!': tags.string,
    OprApp: tags.operator,
    TokenOperator: tags.operator,
    'Assignment/TokenOperator': tags.definitionOperator,
    UnaryOprApp: tags.operator,
    'Function/Ident': tags.function(tags.variableName),
    ForeignFunction: tags.function(tags.variableName),
    'Import/TokenIdent': tags.function(tags.moduleKeyword),
    Export: tags.function(tags.moduleKeyword),
    Lambda: tags.function(tags.variableName),
    Documented: tags.docComment,
    ConstructorDefinition: tags.function(tags.variableName),
  }),
  foldNodeProp.add({
    Function: (node) => node.lastChild,
    ArgumentBlockApplication: (node) => node,
    OperatorBlockApplication: (node) => node,
  }),
)

type AstNode = RawAstExtended<RawAst.Tree | RawAst.Token, false>
const astProp = new NodeProp<AstNode>({ perNode: true })

function astToCodeMirrorTree(
  nodeSet: NodeSet,
  ast: AstNode,
  props?: readonly [number | NodeProp<any>, any][] | undefined,
): Tree {
  const [start, end] = ast.span()
  const children = ast.children()

  const childrenToConvert = iter.tryGetSoleValue(children)?.isToken() ? [] : children

  return new Tree(
    nodeSet.types[ast.inner.type + (ast.isToken() ? RawAst.Tree.typeNames.length : 0)]!,
    childrenToConvert.map((child) => astToCodeMirrorTree(nodeSet, child)),
    childrenToConvert.map((child) => child.span()[0] - start),
    end - start,
    [...(props ?? []), [astProp, ast]],
  )
}

const facet = defineLanguageFacet()

class EnsoParser extends Parser {
  nodeSet
  constructor() {
    super()
    this.nodeSet = nodeSet
  }
  cachedCode: string | undefined
  cachedTree: Tree | undefined
  createParse(input: Input): PartialParse {
    return {
      parsedPos: input.length,
      stopAt: () => {},
      stoppedAt: null,
      advance: () => {
        const code = input.read(0, input.length)
        if (code !== this.cachedCode || this.cachedTree == null) {
          this.cachedCode = code
          const ast = RawAstExtended.parse(code)
          this.cachedTree = astToCodeMirrorTree(this.nodeSet, ast, [[languageDataProp, facet]])
        }
        return this.cachedTree
      },
    }
  }
}

class EnsoLanguage extends Language {
  constructor() {
    super(facet, new EnsoParser())
  }
}

const ensoLanguage = new EnsoLanguage()

/** TODO: Add docs */
export function ensoSyntax() {
  return new LanguageSupport(ensoLanguage)
}
