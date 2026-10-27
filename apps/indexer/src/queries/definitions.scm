; Definitions the indexer extracts. Each pattern captures the whole definition
; node under its kind (@function, @class, @method) and its identifier as @name.
; Kinds are the capture names, so a new kind only needs a new pattern here.

(function_declaration name: (identifier) @name) @function
(generator_function_declaration name: (identifier) @name) @function

; const foo = () => {} / const foo = function () {}
(variable_declarator
  name: (identifier) @name
  value: [(arrow_function) (function_expression)]) @function

(class_declaration name: (type_identifier) @name) @class
(abstract_class_declaration name: (type_identifier) @name) @class

(method_definition name: (_) @name) @method

; class field holding a function: handler = () => {}
(public_field_definition
  name: (_) @name
  value: [(arrow_function) (function_expression)]) @method
