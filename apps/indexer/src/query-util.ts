import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { Query, type Language, type Node, type Tree } from 'web-tree-sitter';
import { findAsset } from './assets';
import { ParserUtil, type Grammar } from './parser-util';

export type DefinitionKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'variable';

export interface Definition {
  readonly kind: DefinitionKind;
  readonly name: string;
  /** Enclosing class, for methods. */
  readonly owner?: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
  /** Classes only. */
  readonly extends?: readonly HeritageRef[];
  readonly implements?: readonly HeritageRef[];
  /** Variables only: `x satisfies I` or `const x: I = {...}`. */
  readonly satisfies?: readonly HeritageRef[];
}

export interface HeritageRef {
  readonly name: string;
  /** `ns` in `ns.Base`. */
  readonly qualifier?: string;
}

export interface ImportRef {
  readonly kind: 'import' | 'reexport';
  readonly localName: string | null;
  /** 'default', '*' or the exported name. */
  readonly importedName: string | null;
  readonly specifier: string;
  readonly line: number;
}

export type OccurrenceRole = 'call' | 'new' | 'ref' | 'type';

export interface Occurrence {
  readonly role: OccurrenceRole;
  readonly name: string;
  /** Receiver or namespace: `ns` in `ns.f()`. */
  readonly qualifier?: string;
  readonly line: number;
  readonly col: number;
  /** Innermost definition containing the occurrence. */
  readonly enclosing?: Definition;
  /** Set when a plain reference is a local, a parameter or an object key. */
  readonly binding?: OccurrenceBinding;
  /** Inferred type of the receiver of a member call: `T` in `x.f()`. */
  readonly receiverType?: string;
}

export type OccurrenceBinding = 'local' | 'param' | 'property';

/** Repo-relative posix path without its extension. */
export const moduleKeyOf = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\.[^./]+$/, '');

/**
 * Resolves a relative import specifier to a known repo-relative posix path.
 * Bare specifiers (packages, tsconfig aliases) return null.
 */
export const resolveSpecifier = (
  fromPath: string,
  specifier: string,
  knownPaths: ReadonlySet<string>,
  aliases: readonly PathAlias[] = [],
): string | null => {
  if (!specifier.startsWith('.')) {
    for (const joined of aliasTargets(specifier, aliases)) {
      const found = firstKnown(joined, knownPaths);
      if (found) return found;
    }
    return null;
  }
  const from = fromPath.replace(/\\/g, '/');
  const joined = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (joined === '..' || joined.startsWith('../')) return null;
  return firstKnown(joined, knownPaths);
};

/** A tsconfig `paths` entry; targets are root-relative posix paths. */
export interface PathAlias {
  /** `@scope/lib` or `@scope/*`. */
  readonly pattern: string;
  readonly targets: readonly string[];
}

/** Root-relative candidates for a bare specifier, from tsconfig `paths`. */
const aliasTargets = (
  specifier: string,
  aliases: readonly PathAlias[],
): string[] => {
  const out: string[] = [];
  for (const { pattern, targets } of aliases) {
    const star = pattern.indexOf('*');
    if (star < 0) {
      if (pattern === specifier) out.push(...targets);
      continue;
    }
    const head = pattern.slice(0, star);
    const tail = pattern.slice(star + 1);
    if (
      specifier.length >= head.length + tail.length &&
      specifier.startsWith(head) &&
      specifier.endsWith(tail)
    ) {
      const middle = specifier.slice(
        head.length,
        specifier.length - tail.length,
      );
      out.push(...targets.map((target) => target.replace('*', middle)));
    }
  }
  return out;
};

const firstKnown = (
  joined: string,
  knownPaths: ReadonlySet<string>,
): string | null => {
  const base = joined.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
    ...(base === joined ? [] : [`${base}.ts`, `${base}.tsx`]),
  ];
  return candidates.find((candidate) => knownPaths.has(candidate)) ?? null;
};

const KINDS: ReadonlySet<string> = new Set<DefinitionKind>([
  'function',
  'class',
  'method',
  'interface',
  'variable',
]);
const FUNCTION_NODES: ReadonlySet<string> = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
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
  private static readonly compiled = new WeakMap<
    Language,
    Map<string, Query>
  >();

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
      if (QueryUtil.isTypeLiteralMember(whole.node)) continue;
      const owner =
        kind === 'method' ? QueryUtil.ownerNameAround(whole.node) : undefined;
      definitions.push({
        kind,
        name: name.node.text,
        ...(owner && { owner }),
        ...((kind === 'class' || kind === 'interface') &&
          QueryUtil.heritageOf(whole.node)),
        ...(kind === 'variable' && QueryUtil.satisfiesOf(whole.node)),
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

  /** Import and re-export rows of a file, in source order. */
  static async importsInFile(file: string): Promise<ImportRef[]> {
    return QueryUtil.withTreeOf(await ParserUtil.parseFile(file), (tree) =>
      QueryUtil.importsIn(tree),
    );
  }

  static async importsInSource(
    source: string,
    grammar: Grammar = 'typescript',
  ): Promise<ImportRef[]> {
    return QueryUtil.withTreeOf(
      await ParserUtil.parseSource(source, grammar),
      (tree) => QueryUtil.importsIn(tree),
    );
  }

  static importsIn(tree: Tree): ImportRef[] {
    const rows: ImportRef[] = [];
    const matches = QueryUtil.queryFor(tree.language, 'imports.scm').matches(
      tree.rootNode,
    );
    for (const { captures } of matches) {
      const get = (name: string) =>
        captures.find((capture) => capture.name === name)?.node;
      const source = get('source');
      if (!source) continue;
      const base = {
        specifier: source.text,
        line: source.startPosition.row + 1,
      };
      const defaultName = get('default');
      const namespace = get('namespace');
      const imported = get('imported');
      const reexported = get('reexport.imported');
      if (defaultName) {
        rows.push({
          ...base,
          kind: 'import',
          localName: defaultName.text,
          importedName: 'default',
        });
      } else if (namespace) {
        rows.push({
          ...base,
          kind: 'import',
          localName: namespace.text,
          importedName: '*',
        });
      } else if (imported) {
        rows.push({
          ...base,
          kind: 'import',
          localName: (get('local') ?? imported).text,
          importedName: imported.text,
        });
      } else if (reexported) {
        rows.push({
          ...base,
          kind: 'reexport',
          localName: (get('reexport.local') ?? reexported).text,
          importedName: reexported.text,
        });
      } else if (get('star')) {
        rows.push({
          ...base,
          kind: 'reexport',
          localName: null,
          importedName: '*',
        });
      }
    }
    return rows.sort((a, b) => a.line - b.line);
  }

  /** Calls, `new`s, plain references and type references of a file. */
  static async occurrencesInFile(file: string): Promise<Occurrence[]> {
    return QueryUtil.withTreeOf(await ParserUtil.parseFile(file), (tree) =>
      QueryUtil.occurrencesIn(tree),
    );
  }

  static async occurrencesInSource(
    source: string,
    grammar: Grammar = 'typescript',
  ): Promise<Occurrence[]> {
    return QueryUtil.withTreeOf(
      await ParserUtil.parseSource(source, grammar),
      (tree) => QueryUtil.occurrencesIn(tree),
    );
  }

  static occurrencesIn(tree: Tree): Occurrence[] {
    const definitions = QueryUtil.definitionsIn(tree);
    const defNames = new Set<number>();
    for (const { captures } of QueryUtil.queryFor(
      tree.language,
      'definitions.scm',
    ).matches(tree.rootNode)) {
      for (const capture of captures) {
        if (capture.name === 'name') defNames.add(capture.node.startIndex);
      }
    }
    const seen = new Set<number>();
    const found: Occurrence[] = [];
    const add = (role: OccurrenceRole, node: Node, object?: Node) => {
      if (seen.has(node.startIndex) || defNames.has(node.startIndex)) return;
      seen.add(node.startIndex);
      if (QueryUtil.isImportName(node)) return;
      const line = node.startPosition.row + 1;
      let enclosing: Definition | undefined;
      for (const definition of definitions) {
        if (definition.startLine <= line && line <= definition.endLine) {
          enclosing = definition; // sorted by start: the last hit is innermost
        }
      }
      const binding = role === 'ref' ? QueryUtil.bindingOf(node) : undefined;
      const receiverType =
        object && (role === 'call' || role === 'new')
          ? QueryUtil.inferReceiverType(object)
          : undefined;
      found.push({
        role,
        name: node.text,
        ...(object && { qualifier: object.text }),
        ...(binding && { binding }),
        ...(receiverType && { receiverType }),
        line,
        col: node.startPosition.column,
        ...(enclosing && { enclosing }),
      });
    };
    const matches = QueryUtil.queryFor(tree.language, 'references.scm').matches(
      tree.rootNode,
    );
    // call/new first so a node is never also reported as a plain reference
    for (const role of ['call', 'new', 'ref', 'type'] as const) {
      for (const { captures } of matches) {
        const name = captures.find((c) => c.name === `${role}.name`);
        if (!name) continue;
        const object = captures.find((c) => c.name === `${role}.object`);
        add(role, name.node, object?.node);
      }
    }
    return found.sort((a, b) => a.line - b.line || a.col - b.col);
  }

  /** True for names inside `import ...` or `export ... from`. */
  private static isImportName(node: Node): boolean {
    for (let up = node.parent; up; up = up.parent) {
      if (up.type === 'import_statement') return true;
      if (up.type === 'export_statement') {
        return up.childForFieldName('source') !== null;
      }
      if (CLASS_NODES.has(up.type) || up.type.endsWith('_statement')) {
        return false;
      }
    }
    return false;
  }

  private static withTreeOf<T>(tree: Tree, read: (tree: Tree) => T): T {
    try {
      return read(tree);
    } finally {
      tree.delete();
    }
  }

  private static queryFor(language: Language, file = 'definitions.scm'): Query {
    let byFile = QueryUtil.compiled.get(language);
    if (!byFile) {
      byFile = new Map();
      QueryUtil.compiled.set(language, byFile);
    }
    let query = byFile.get(file);
    if (!query) {
      const source = readFileSync(findAsset(file, `./queries/${file}`), 'utf8');
      query = new Query(language, source);
      byFile.set(file, query);
    }
    return query;
  }

  /** `extends`/`implements` targets of a class node. */
  private static heritageOf(
    node: Node,
  ): Pick<Definition, 'extends' | 'implements'> {
    const heritage = node.namedChildren.find(
      (child) =>
        child.type === 'class_heritage' || child.type === 'extends_type_clause',
    );
    if (!heritage) return {};
    if (heritage.type === 'extends_type_clause') {
      const refs: HeritageRef[] = [];
      for (const child of heritage.namedChildren) {
        if (child.type === 'type_arguments') continue;
        const ref = QueryUtil.heritageRef(child);
        if (ref) refs.push(ref);
      }
      return refs.length > 0 ? { extends: refs } : {};
    }
    const extendsRefs: HeritageRef[] = [];
    const implementsRefs: HeritageRef[] = [];
    for (const clause of heritage.namedChildren) {
      const target =
        clause.type === 'extends_clause'
          ? extendsRefs
          : clause.type === 'implements_clause'
            ? implementsRefs
            : undefined;
      if (!target) continue;
      for (const child of clause.namedChildren) {
        if (child.type === 'type_arguments') continue;
        const ref = QueryUtil.heritageRef(child);
        if (ref) target.push(ref);
      }
    }
    return {
      ...(extendsRefs.length > 0 && { extends: extendsRefs }),
      ...(implementsRefs.length > 0 && { implements: implementsRefs }),
    };
  }

  /** `satisfies` targets of a variable declarator. */
  private static satisfiesOf(node: Node): Pick<Definition, 'satisfies'> {
    const value = node.childForFieldName('value');
    const typeNode =
      value?.type === 'satisfies_expression'
        ? value.namedChildren[value.namedChildren.length - 1]
        : node
            .childForFieldName('type')
            ?.namedChildren.find((child) => child.type !== 'type_arguments');
    const ref = typeNode ? QueryUtil.heritageRef(typeNode) : undefined;
    return ref ? { satisfies: [ref] } : {};
  }

  private static heritageRef(node: Node): HeritageRef | undefined {
    switch (node.type) {
      case 'identifier':
      case 'type_identifier':
        return { name: node.text };
      case 'member_expression': {
        const name = node.childForFieldName('property');
        const object = node.childForFieldName('object');
        return name
          ? {
              name: name.text,
              ...(object && { qualifier: object.text }),
            }
          : undefined;
      }
      case 'nested_type_identifier': {
        const name = node.childForFieldName('name');
        const module = node.childForFieldName('module');
        return name
          ? {
              name: name.text,
              ...(module && { qualifier: module.text }),
            }
          : undefined;
      }
      case 'generic_type': {
        const inner = node.childForFieldName('name');
        return inner ? QueryUtil.heritageRef(inner) : undefined;
      }
      default:
        return undefined;
    }
  }

  /** Walks up the tree to the class or interface a method belongs to. */
  /** Signatures inside `type X = { ... }` or a union: no owner, not definitions. */
  private static isTypeLiteralMember(node: Node): boolean {
    if (
      node.type !== 'method_signature' &&
      node.type !== 'property_signature'
    ) {
      return false;
    }
    return node.parent?.parent?.type !== 'interface_declaration';
  }

  private static ownerNameAround(node: Node): string | undefined {
    for (let up = node.parent; up; up = up.parent) {
      if (CLASS_NODES.has(up.type) || up.type === 'interface_declaration') {
        return up.childForFieldName('name')?.text;
      }
    }
    return undefined;
  }

  /** Declared names of a scope node: [name, declarator-or-parameter]. */
  private static declarationsOf(scope: Node): [string, Node][] {
    const out: [string, Node][] = [];
    if (FUNCTION_NODES.has(scope.type)) {
      const single = scope.childForFieldName('parameter');
      if (single) out.push([single.text, scope]);
      for (const param of scope.childForFieldName('parameters')
        ?.namedChildren ?? []) {
        const pattern = param.childForFieldName('pattern');
        if (pattern) out.push([pattern.text, param]);
      }
    } else if (scope.type === 'statement_block' || scope.type === 'program') {
      for (const child of scope.namedChildren) {
        if (
          child.type !== 'lexical_declaration' &&
          child.type !== 'variable_declaration'
        ) {
          continue;
        }
        for (const declarator of child.namedChildren) {
          const name = declarator.childForFieldName('name');
          if (declarator.type === 'variable_declarator' && name) {
            out.push([name.text, declarator]);
          }
        }
      }
    }
    return out;
  }

  /** Nearest declaration of an identifier by walking up the scopes. */
  private static declarationOf(
    node: Node,
  ): { scope: Node; decl: Node } | undefined {
    for (let up = node.parent; up; up = up.parent) {
      const hit = QueryUtil.declarationsOf(up).find(
        ([name]) => name === node.text,
      );
      if (hit) return { scope: up, decl: hit[1] };
    }
    return undefined;
  }

  private static bindingOf(node: Node): OccurrenceBinding | undefined {
    // A shorthand `{ name }` is also a value reference: never a key-only property.
    if (node.type === 'shorthand_property_identifier') return undefined;
    const parent = node.parent;
    if (
      parent &&
      (parent.type === 'required_parameter' ||
        parent.type === 'optional_parameter') &&
      parent.childForFieldName('pattern')?.startIndex === node.startIndex
    ) {
      return 'param';
    }
    if (
      parent?.type === 'arrow_function' &&
      parent.childForFieldName('parameter')?.startIndex === node.startIndex
    ) {
      return 'param';
    }
    if (
      parent?.type === 'variable_declarator' &&
      parent.childForFieldName('name')?.startIndex === node.startIndex
    ) {
      return 'local';
    }
    const found = QueryUtil.declarationOf(node);
    if (!found || found.scope.type === 'program') return undefined;
    return found.decl.type === 'variable_declarator' ? 'local' : 'param';
  }

  /** Type name from `: T`, `: T<A>` or `: ns.T`. */
  private static typeNameOf(annotation: Node | null): string | undefined {
    let type = annotation?.namedChildren[0];
    if (type?.type === 'generic_type')
      type = type.childForFieldName('name') ?? type;
    if (type?.type === 'nested_type_identifier') {
      return type.childForFieldName('name')?.text;
    }
    return type?.type === 'type_identifier' ? type.text : undefined;
  }

  /** Type of an initializer: `yield* Tag` or `new T()`. */
  private static typeOfExpression(expr: Node | null): string | undefined {
    let node = expr;
    while (node?.type === 'parenthesized_expression')
      node = node.namedChildren[0] ?? null;
    if (node?.type === 'yield_expression') {
      const inner = node.namedChildren[0];
      if (inner?.type === 'identifier') return inner.text;
      if (inner?.type === 'member_expression') {
        return inner.childForFieldName('property')?.text;
      }
    }
    if (node?.type === 'new_expression') {
      const ctor = node.childForFieldName('constructor');
      if (ctor?.type === 'identifier') return ctor.text;
    }
    return undefined;
  }

  /** Best-effort type of the receiver `x` in `x.f()`; undefined if unknown. */
  private static inferReceiverType(object: Node): string | undefined {
    let node: Node | null = object;
    while (node?.type === 'parenthesized_expression')
      node = node.namedChildren[0] ?? null;
    if (!node) return undefined;
    if (node.type === 'yield_expression')
      return QueryUtil.typeOfExpression(node);
    if (node.type !== 'identifier') return undefined;
    const found = QueryUtil.declarationOf(node);
    if (!found) return undefined;
    const { decl } = found;
    if (decl.type === 'variable_declarator') {
      return (
        QueryUtil.typeNameOf(decl.childForFieldName('type')) ??
        QueryUtil.typeOfExpression(decl.childForFieldName('value'))
      );
    }
    return QueryUtil.typeNameOf(decl.childForFieldName('type'));
  }
}
