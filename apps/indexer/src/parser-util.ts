import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Language, Parser, type Tree } from 'web-tree-sitter';
import { findAsset } from './assets';

export type Grammar = 'typescript' | 'tsx';

const GRAMMAR_BY_EXTENSION: Readonly<Record<string, Grammar>> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
};

/**
 * Turns source code into a tree-sitter syntax tree.
 *
 * What the dependencies do:
 *  - `web-tree-sitter` is the parsing engine (WASM). It knows nothing about
 *    any language until it is given a grammar.
 *  - `tree-sitter-typescript` only ships the grammars, as .wasm files. They
 *    define the node types (function_declaration, class_declaration, ...)
 *    that queries refer to.
 *
 * Everything is static: the engine starts once per process and each grammar
 * and parser is loaded once, on first use.
 */
export class ParserUtil {
  private static engine: Promise<void> | undefined;
  private static readonly languages = new Map<Grammar, Promise<Language>>();
  private static readonly parsers = new Map<Grammar, Promise<Parser>>();

  private constructor() {
    // static-only: never instantiated
  }

  /** Which grammar reads this file, or undefined when it is not supported. */
  static grammarOf(file: string): Grammar | undefined {
    return GRAMMAR_BY_EXTENSION[path.extname(file).toLowerCase()];
  }

  static canParse(file: string): boolean {
    return ParserUtil.grammarOf(file) !== undefined;
  }

  /**
   * Reads a file and parses it. The caller owns the tree: tree-sitter memory
   * lives in WASM, outside the JS garbage collector, so call `tree.delete()`.
   */
  static async parseFile(file: string): Promise<Tree> {
    const grammar = ParserUtil.grammarOf(file);
    if (!grammar) throw new Error(`unsupported file type: ${file}`);
    return ParserUtil.parseSource(await readFile(file, 'utf8'), grammar);
  }

  static async parseSource(
    source: string,
    grammar: Grammar = 'typescript',
  ): Promise<Tree> {
    const parser = await ParserUtil.parserFor(grammar);
    const tree = parser.parse(source);
    if (!tree) throw new Error('tree-sitter returned no tree');
    return tree;
  }

  /** The loaded grammar; queries are compiled against it. */
  static languageFor(grammar: Grammar): Promise<Language> {
    let language = ParserUtil.languages.get(grammar);
    if (!language) {
      language = ParserUtil.startEngine().then(async () =>
        Language.load(await readFile(ParserUtil.grammarFile(grammar))),
      );
      ParserUtil.languages.set(grammar, language);
    }
    return language;
  }

  private static parserFor(grammar: Grammar): Promise<Parser> {
    let parser = ParserUtil.parsers.get(grammar);
    if (!parser) {
      parser = ParserUtil.languageFor(grammar).then((language) => {
        const created = new Parser();
        created.setLanguage(language);
        return created;
      });
      ParserUtil.parsers.set(grammar, parser);
    }
    return parser;
  }

  /** `Parser.init` must run once before any Parser or Language exists. */
  private static startEngine(): Promise<void> {
    ParserUtil.engine ??= Parser.init({
      locateFile: () =>
        findAsset(
          'web-tree-sitter.wasm',
          'web-tree-sitter/web-tree-sitter.wasm',
        ),
    });
    return ParserUtil.engine;
  }

  private static grammarFile(grammar: Grammar): string {
    const name = `tree-sitter-${grammar}.wasm`;
    return findAsset(name, `tree-sitter-typescript/${name}`);
  }
}
