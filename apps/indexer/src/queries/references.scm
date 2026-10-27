; Name occurrences. Captures: @<role>.name, plus @<role>.object for the
; receiver of a member access (ns.f(), obj.m(), new ns.X()). A node captured
; as call/new is not reported again as @ref.

(call_expression function: (identifier) @call.name)
(call_expression
  function: (member_expression
    object: (_) @call.object
    property: (property_identifier) @call.name))

(new_expression constructor: (identifier) @new.name)
(new_expression
  constructor: (member_expression
    object: (_) @new.object
    property: (property_identifier) @new.name))

(identifier) @ref.name
(shorthand_property_identifier) @ref.name
(type_identifier) @type.name
