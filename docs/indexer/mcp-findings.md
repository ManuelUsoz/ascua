# MCP `ascua-indexer`: findings, mejoras y conclusiones

Prueba hecha usando el MCP como buscador para una feature real: entender `RoomState`,
seguir el flujo de `AssistantService.send` y localizar los llamadores de
`toAssistantError`. Cada resultado se contrastó con `rg` sobre el repo.

Las causas indicadas son hipótesis: no se revisó el código fuente del indexador.

## Qué funciona bien

- `search_symbols` es case-insensitive y por subcadena (`roomstate` → `RoomState`).
  Devuelve `id`, tipo, ruta y rango de líneas.
- `get_file_outline` lista los métodos con sus rangos (`RoomState`: 16 métodos).
- `find_implementations` de `AssistantEngine` encuentra `ClaudeCodeEngine`
  (`rel: implements`).
- `find_callees` y `find_callers` sobre `guarded` y `registerAssistantIpc`
  coinciden con el código.
- `find_importers` distingue reexports (`re: true`) de imports directos.
- Los errores por ruta inexistente son claros
  (`File ... is not in the index.`).

## Findings (de mayor a menor severidad)

### 1. `find_callers` pierde llamadas anidadas como argumento

`toAssistantError` se llama en `apps/desktop/src/app/assistant/assistant-ipc.ts:24`
dentro de `encodeError(toAssistantError(error))`.

- `find_callers toAssistantError` → `[]`.
- `find_callees guarded` sí lista esa llamada en la línea 24.

**Diagnóstico corregido: no reproducible.** La hipótesis original (solo se
registra la llamada más externa) era falsa: dos tests de regresión
(`QueryService nested arrow in call`, `query-service.spec.ts`) pasan sin cambios
en el código. Además `guarded` es una declaración de función genérica
(`assistant-ipc.ts:20-26`), no un const flecha. Causa probable, sin verificar:
`toAssistantError` no es un nombre único y `find_callers` elegía o fusionaba por
nombre; lo cubre `resolveSymbol` (finding 2/3).
Estado: no reproducible, tests de regresión añadidos.

### 2. Nombres ambiguos se fusionan o se eligen en silencio

- `find_callees send` devuelve llamadas de varios métodos distintos
  (`AssistantService`, `ClaudeCodeEngine`, `ChatService`, `AssistantStore`…)
  sin `from` con archivo ni dueño. No se puede saber de qué `send` sale cada línea.
- `get_symbol_context send` devuelve el de `assistant-service.ts` sin avisar de
  que hay más candidatos.

### 3. Los nombres calificados `Clase.método` no resuelven

- `find_callees AssistantService.send` → vacío.
- `get_symbol_context AssistantService.send` → `No indexed symbol matches`.

`search_symbols` sí conoce el dueño (`o: "AssistantService"`), así que el
parámetro es inconsistente con lo que el propio índice almacena.

### 4. `find_callees` sobre una clase solo mira los campos

`find_callees RoomState` devuelve 4 llamadas, todas en las líneas 22–26
(inicializadores de campo). Ignora el constructor y todos los métodos. Un agente
concluiría que la clase casi no llama a nada.

### 5. `find_implementations` no ve objetos tipados con `satisfies`

`apps/desktop/src/app/assistant/assistant-service.spec.ts:25` contiene
`} satisfies AssistantEngine;`. El resultado solo incluye `ClaudeCodeEngine`.
Es un implementador real que falta.

### 6. `find_references` no ve el uso en plantillas

`Avatar` aparece en `app.ts:16`, pero no en `apps/renderer/src/app/app.html`,
donde se usa `<app-avatar>` (confirmado con `rg`). Para responder "quién
renderiza este componente" el resultado queda incompleto.

### 7. Sin búsqueda por concepto ni multipalabra

`search_symbols "push to talk"` → `[]`, mientras que `PushToTalk` sí funciona.
Preguntas como "dónde está el fail-open del hook" no tienen respuesta con este
índice.

**Diagnóstico corregido:** el tokenizador FTS `unicode61` (`migrations.ts:50`) no
parte camelCase, así que `PushToTalk` es un único token y `push`, `to`, `talk`
no lo encuentran. Arreglo en `searchSymbols` (`query-service.ts`): una consulta
multipalabra es `(AND de tokens) OR "palabras unidas"*`; `toFtsQuery` no cambia.
Búsqueda por concepto (semántica) sigue sin existir.
Estado: arreglado para multipalabra, concepto no soportado.

### 8. Cobertura: ficheros no `.ts` fuera del índice

`search_symbols hook` encuentra `HookServer` en `permissions/`, pero
`tools/ascua-hook.mjs` devuelve `not in the index`. Encaja con "ts only" del
CLAUDE.md, pero el error no distingue "lenguaje no soportado" de "archivo
inexistente".

### 9. Truncado sin paginación visible

`find_references warm` devuelve `"omitted": 9` sin forma aparente de pedir el resto.

**Diagnóstico corregido:** `omitted` es un tope de tokens (`cap`), no paginación;
no hay cursor. Ahora las herramientas de lista añaden `truncated: true` cuando
cortan y la descripción aclara que `omitted` no es paginable.
Estado: documentado y parcialmente arreglado. Abierto: `find_callees` y
`find_importers` devuelven arrays desnudos, sin `truncated`.

### 10. Ruido de specs y helpers en `search_symbols`

`PushToTalk` trae también `key`, una función de un `.spec.ts`. No hay filtro por
tipo, carpeta ni para excluir specs. Tampoco hay ranking: las coincidencias
exactas no salen primero (en `AssistantEngine` la interfaz aparece entre
`AssistantError`, `AssistantStore`, etc.).

### 11. Parámetros inconsistentes entre herramientas

- `get_file_outline` → `path`
- `find_importers` → `target`
- `find_callers` y `find_references` → `symbol`

Adivinar el nombre cuesta un intento fallido por herramienta. `find_importers`
tampoco normaliza `./` ni separadores.

### 12. Campo `u` sin documentar

Aparece en callees y callers (`"u": true`) y no se explica si significa "no
resuelto", "externo" o "unsafe".

### 13. Coste en tokens de `get_symbol_context`

Devuelve el cuerpo completo: `RoomState` ocupa unos 9 KB. No hay límite de líneas
ni modo "solo firma". Es el resultado más caro del conjunto para una tarea normal.

## Estado de los findings

| #   | Estado                                                                                                                                                                                                                                                        | Dónde                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | no reproducible (causa probable sin verificar: ambigüedad de nombre)                                                                                                                                                                                          | `query-service.spec.ts` ("nested arrow in call")   |
| 2   | arreglado: `candidates` si es ambiguo; callees llevan `o`/`p`                                                                                                                                                                                                 | `resolveSymbol` en `query-service.ts`, `server.ts` |
| 3   | arreglado: `Owner.name` y `path#name`                                                                                                                                                                                                                         | `resolveSymbol`, `query-service.spec.ts`           |
| 4   | arreglado: callees de una clase incluyen sus métodos                                                                                                                                                                                                          | `query-service.ts`, `query-service.spec.ts`        |
| 5   | arreglado: relación `satisfies`, nuevo kind `variable`; `find_implementations` devuelve `{extends, implements, satisfies, truncated}` (cambio de forma, rompe el array plano). Efecto lateral: las llamadas dentro de esos objetos se atribuyen a la variable | `query-util.ts`, `query-service.ts`, `bench.ts`    |
| 6   | documentado: las plantillas Angular no están cubiertas                                                                                                                                                                                                        | descripciones en `server.ts`                       |
| 7   | arreglado para multipalabra (ver arriba); concepto no soportado                                                                                                                                                                                               | `searchSymbols`                                    |
| 8   | arreglado: distingue lenguaje no soportado de no indexado                                                                                                                                                                                                     | `server.ts` (`canParse`)                           |
| 9   | documentado + `truncated` (ver arriba)                                                                                                                                                                                                                        | `cap`, `server.ts`                                 |
| 10  | arreglado: filtros `kind`, `path`, `excludeSpecs`; ranking exacto primero                                                                                                                                                                                     | `searchSymbols`                                    |
| 11  | arreglado: alias `path`; normaliza `./` y `\`                                                                                                                                                                                                                 | `server.ts`, `query-service.ts`                    |
| 12  | documentado: `u`/`a` en las descripciones                                                                                                                                                                                                                     | `server.ts`                                        |
| 13  | arreglado: `signatureOnly` / `maxLines` en `get_symbol_context`                                                                                                                                                                                               | `query-service.ts`, `server.ts`                    |

Huecos abiertos: `find_callees`/`find_importers` sin `truncated`; `find_importers`
con nombre con puntos informa "unsupported language"; `truncated` de
`get_symbol_context` no marca los cortes por `maxLines`/`signatureOnly`.

## Mejoras propuestas

- **Índice inverso de llamadas:** registrar también las llamadas anidadas como
  argumento (fix del finding 1), con test para `f(g(x))`.
- **Identidad completa de símbolo:** cada resultado debe llevar `owner` y `path`
  en `from` y en `callers`. El parámetro debe aceptar `Clase.método` y
  `archivo#método`. Si el nombre es ambiguo, devolver `candidates` en vez de elegir uno.
- **`find_implementations` con `satisfies` y tipos anotados**
  (`const x: I = {…}`, `satisfies I`).
- **Búsqueda más útil:** ranking (exacto > prefijo > subcadena), filtros
  `kind`, `path` y exclusión de specs, y tokenización multipalabra
  (`push to talk` → AND de tokens).
- **`get_symbol_context` con `signature` o `maxLines`**, y `cursor`/`offset` para
  el campo `omitted`.
- **Unificar nombres de parámetro** (`path` en todas, o alias) y documentar `u`.
- **Errores accionables:** distinguir "no indexado: lenguaje no soportado" de
  "no existe", y sugerir candidatos cercanos.
- **Indexar plantillas Angular (`.html`)** como referencias a selectores, o
  indicar en la respuesta que no están cubiertas.
- **Ampliar la cobertura** a `.mjs` de `tools/` si el agente necesita el hook.
  Si no, documentarlo en la descripción de la herramienta.

## Conclusiones

- Para "dónde está X" por nombre exacto y para outlines, el MCP sirve.
- Para trazar flujos (quién llama a qué) con nombres comunes, y para cualquier
  pregunta por concepto, **no es fiable todavía**. Obliga a verificar cada
  respuesta con `rg`, lo que anula el ahorro de tokens.
- Los findings **1, 2 y 5** son los que más dañan una feature real. Conviene
  atacarlos primero: identidad de símbolo y el índice inverso de llamadas.

## Segunda ronda (cross-file): estado

Numeración de la segunda prueba de uso, distinta de la lista anterior.

| #   | Finding                                              | Estado    | Causa y arreglo                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Propiedades de type literal indexadas como métodos   | Arreglado | `definitions.scm` capturaba cualquier `property_signature`. Ahora solo las de tipo función y `QueryUtil.isTypeLiteralMember` descarta las que no están en una `interface_declaration`.                                                                  |
| 2   | Imports `@ascua/*` quedaban `u`                      | Arreglado | Los alias de `tsconfig` (`paths`) no se resolvían. `scan/tsconfig-paths.ts` los lee y `resolveSpecifier` los usa al indexar.                                                                                                                            |
| 3   | Ruido en callers calificados (`Clase.método`)        | Arreglado | La regla "alcanzable por imports" (archivo de la definición o que la importa, directa o vía barrel) se aplica antes del descarte de nombres de menos de 6 caracteres. `omitted` cuenta solo los name-only de archivos que nunca importan la definición. |
| 4   | Candidatos ambiguos sin orden ni tope                | Arreglado | `query/ranking.ts` los ordena (declaraciones sobre miembros, código sobre specs), máximo 10 y `moreCandidates` con el resto.                                                                                                                            |
| 5   | JSON schema grande (`anyOf null`, enum `"Infinity"`) | Arreglado | `Schema.optionalKey` y `Schema.Finite`/`Schema.Int` en lugar de `optional`/`Number`. Test en `server.spec.ts`.                                                                                                                                          |
| 6   | `search_symbols` mal ordenado                        | Arreglado | Se piden `max(limit*5, 100)` filas y se reordenan con `Ranking` antes de cortar a `limit`.                                                                                                                                                              |
| 8   | Símbolo desconocido devolvía resultado vacío         | Arreglado | `find_references/callers/callees/implementations` devuelven `undefined` sin definición ni coincidencias y el MCP responde `No indexed symbol matches "<symbol>"` (`isError`).                                                                           |

### Parámetros tipados nuevos

- `search_symbols`: `kind` (`class|interface|function|method|variable`), `owner`.
- `find_references`: `role` (`call|new|ref|type`), `within`, `excludeSpecs`.
- `find_callers`: `within`, `excludeSpecs`.
- `find_importers`: `within`, `excludeSpecs`.
- `find_implementations`: `relation` (`extends|implements|satisfies`), `within`,
  `excludeSpecs`.
- `find_callees`: `onlyResolved`.

`within` es un prefijo de ruta relativo a la raíz de los archivos que USAN el
símbolo (`path` sigue siendo el archivo de la definición).

### Huecos nuevos

- **Campos de clase que no son funciones** (p. ej. `readonly open = signal(false)`)
  no se indexan. Herramienta nueva `search_text`: búsqueda literal o regex sobre
  el texto de los `.ts` indexados. Params: `pattern`, `regex`, `caseSensitive`,
  `within`, `excludeSpecs`, `limit`, `max_tokens`. Lee de disco: `text` refleja
  ediciones posteriores al último index y `e` (símbolo envolvente) puede estar
  desactualizado.
- **`find_importers`** acepta alias de `tsconfig` (`@ascua/assistant`) y
  especificadores exactos (`rxjs`), después de los nombres de archivo y antes
  del modo símbolo.
- **Plantillas HTML y otros lenguajes**: no soportados por diseño. Todas las
  descripciones de herramientas lo dicen (constante `ONLY_TS`) y el error de
  símbolo desconocido sugiere `search_text`.

### Abiertos

- Finding 7: búsqueda por concepto.
- `find_callees` y `find_importers` no tienen flag `truncated`.

## Reproducción

| Consulta                                         | Resultado esperado                     | Resultado observado           |
| ------------------------------------------------ | -------------------------------------- | ----------------------------- |
| `find_callers toAssistantError`                  | incluir `guarded` (l. 24)              | `[]`                          |
| `find_callees AssistantService.send`             | llamadas de ese método                 | `[]`                          |
| `get_symbol_context AssistantService.send`       | cuerpo del método                      | error "No indexed symbol"     |
| `find_callees RoomState`                         | llamadas de todos los métodos          | 4 llamadas (campos, l. 22–26) |
| `find_implementations AssistantEngine`           | incluir el objeto `satisfies` del spec | solo `ClaudeCodeEngine`       |
| `find_references Avatar`                         | incluir `app.html`                     | sin `app.html`                |
| `search_symbols "push to talk"`                  | coincidencias por tokens               | `[]`                          |
| `get_file_outline tools/ascua-hook.mjs`          | outline o "no soportado"               | "not in the index"            |
| `find_importers ./libs/assistant/src/lib/engine` | normalizar ruta                        | error sin pistas              |
