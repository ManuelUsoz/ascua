; Import and re-export rows. Every pattern captures the module string as
; @source; the other captures decide the row.

(import_statement
  (import_clause (identifier) @default)
  source: (string (string_fragment) @source))

(import_statement
  (import_clause (namespace_import (identifier) @namespace))
  source: (string (string_fragment) @source))

(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (_) @imported
        alias: (_)? @local)))
  source: (string (string_fragment) @source))

; export * from './a'
(export_statement
  "*" @star
  source: (string (string_fragment) @source))

; export { a as b } from './a'
(export_statement
  (export_clause
    (export_specifier
      name: (_) @reexport.imported
      alias: (_)? @reexport.local))
  source: (string (string_fragment) @source))
