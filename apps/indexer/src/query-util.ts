import { readFileSync } from 'node:fs';
import { Query, type Language, type Node, type Tree } from 'web-tree-sitter';
import { findAsset } from './assets';
import { ParserUtil, type Grammar } from './parser-util';

export type DefinitionKind = 'function' | 'class' | 'method';

export interface Definition {
  readonly kind: DefinitionKind;
  readonly name: string;
  /** Enclosing class, for methods. */
  readonly owner?: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
}

const KINDS: ReadonlySet<string> = new Set<DefinitionKind>([
  'function',
  'class',
  'method',
]);
const CLASS_NODES: ReadonlySet<string> = new Set([
  'class_declaration',
  'abstract_class_declaration',
  'class',
]);

/**
 * Asks questions of a syntax tree with tree-sitter queries (.scm files).
 *
 * A query is a pattern over node types, e.g.
 * `(function_declaration name: (identifier) @name) @function`. Running it
 * over a tree yields one match per hit, each holding the nodes captured by
 * its `@` tags. The patterns live in queries/definitions.scm, so what counts
 * as a definition is data, not code.
 */
export class QueryUtil {
  // A query is compiled against one grammar, so cache per Language.
  private static readonly compiled = new WeakMap<Language, Query>();

  private constructor() {
    // static-only: never instantiated
  }

  /** Functions, classes and methods in a file, in source order. */
  static async definitionsInFile(file: string): Promise<Definition[]> {
    return QueryUtil.withTree(await ParserUtil.parseFile(file));
  }

  static async definitionsInSource(
    source: string,
    grammar: Grammar = 'typescript',
  ): Promise<Definition[]> {
    return QueryUtil.withTree(await ParserUtil.parseSource(source, grammar));
  }

  /** Functions, classes and methods of an already parsed tree. */
  static definitionsIn(tree: Tree): Definition[] {
    const matches = QueryUtil.queryFor(tree.language).matches(tree.rootNode);
    const definitions: Definition[] = [];
    for (const { captures } of matches) {
      const name = captures.find((capture) => capture.name === 'name');
      const whole = captures.find((capture) => KINDS.has(capture.name));
      if (!name || !whole) continue;
      const kind = whole.name as DefinitionKind;
      const owner =
        kind === 'method' ? QueryUtil.classNameAround(whole.node) : undefined;
      definitions.push({
        kind,
        name: name.node.text,
        ...(owner && { owner }),
        startLine: whole.node.startPosition.row + 1,
        endLine: whole.node.endPosition.row + 1,
      });
    }
    return definitions.sort((a, b) => a.startLine - b.startLine);
  }

  /** Reads the tree, then frees its WASM memory. */
  private static withTree(tree: Tree): Definition[] {
    try {
      return QueryUtil.definitionsIn(tree);
    } finally {
      tree.delete();
    }
  }

  private static queryFor(language: Language): Query {
    let query = QueryUtil.compiled.get(language);
    if (!query) {
      const source = readFileSync(
        findAsset('definitions.scm', './queries/definitions.scm'),
        'utf8',
      );
      query = new Query(language, source);
      QueryUtil.compiled.set(language, query);
    }
    return query;
  }

  /** Walks up the tree to the class a method belongs to. */
  private static classNameAround(node: Node): string | undefined {
    for (let up = node.parent; up; up = up.parent) {
      if (CLASS_NODES.has(up.type)) return up.childForFieldName('name')?.text;
    }
    return undefined;
  }
}
