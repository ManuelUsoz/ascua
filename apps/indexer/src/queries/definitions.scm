; Definitions the indexer extracts. Each pattern captures the whole definition
; node under its kind (@function, @class, @method) and its identifier as @name.
; Kinds are the capture names, so a new kind only needs a new pattern here.

(function_declaration name: (identifier) @name) @function
(generator_function_declaration name: (identifier) @name) @function

; const foo = () => {} / const foo = function () {}
(variable_declarator
  name: (identifier) @name
  value: [(arrow_function) (function_expression)]) @function

; const x = {...} satisfies I / const x: I = {...}: carries a `satisfies` relation
(variable_declarator
  name: (identifier) @name
  value: (satisfies_expression)) @variable
(variable_declarator
  name: (identifier) @name
  type: (type_annotation [(type_identifier) (nested_type_identifier)])
  value: (object)) @variable

(class_declaration name: (type_identifier) @name) @class
(abstract_class_declaration name: (type_identifier) @name) @class

(interface_declaration name: (type_identifier) @name) @interface

(method_definition name: (_) @name) @method

; interface members: owner is the interface. Members of anonymous object types
; (type aliases, unions) are filtered in QueryUtil.definitionsIn.
(method_signature name: (_) @name) @method
; only function-typed properties (send: () => void); data fields are noise
(property_signature
  name: (_) @name
  type: (type_annotation (function_type))) @method

; class field holding a function: handler = () => {}
(public_field_definition
  name: (_) @name
  value: [(arrow_function) (function_expression)]) @method
