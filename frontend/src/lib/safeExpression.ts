/**
 * Safe expression evaluator — a CSP-friendly replacement for `new Function(...)`.
 *
 * The app runs under `Content-Security-Policy: script-src 'self'` (no
 * 'unsafe-eval'), so formulas can no longer be compiled as JavaScript. This
 * module tokenizes, parses (recursive descent) and interprets the subset of
 * JavaScript expression syntax that the formula validators let through, and
 * applies every operator with the real JavaScript operator on real JavaScript
 * values. Results are therefore identical to what `new Function` produced for
 * the same source (coercions, NaN/Infinity, -0, short-circuiting, evaluation
 * order, "x is not a function", ReferenceError for unknown names, …).
 *
 * Supported grammar (JS precedence and associativity):
 *   Expression  := And ( ',' And )*                      comma operator
 *   And         := BitAnd ( '&&' BitAnd )*                short-circuit
 *   BitAnd      := Equality ( '&' Equality )*
 *   Equality    := Relational ( ('=='|'!='|'==='|'!==') Relational )*
 *   Relational  := Shift ( ('<'|'>'|'<='|'>=') Shift )*
 *   Shift       := Additive ( ('<<'|'>>'|'>>>') Additive )*
 *   Additive    := Mult ( ('+'|'-') Mult )*
 *   Mult        := Exp ( ('*'|'/'|'%') Exp )*
 *   Exp         := Unary | Call '**' Exp                 right-assoc; `-a ** b` is a SyntaxError
 *   Unary       := ('+'|'-'|'!') Unary | Call
 *   Call        := Primary ( '(' Args ')' )*              any callee; trailing comma allowed
 *   Primary     := Number | String | RegExp | Identifier | '(' Expression ')'
 * Optionally (`trailingStatements`) newline-separated, never-evaluated extra
 * expression statements, as automatic semicolon insertion would allow.
 * Also JS comments (`//`, `/* *\/`, HTML-like `<!--` and line-start `-->`),
 * strict-mode number/string literal rules (or sloppy legacy-octal numbers with
 * `strict: false`), and regular-expression literals (built with `new RegExp`,
 * which is not eval).
 *
 * Deliberately NOT supported (throws a SyntaxError): assignment and compound
 * assignment, `++`/`--`, arrow functions, member access (`a.b`), spread,
 * `||`, `??`, `?:`, `|`, `^`, `~`, object/array/template literals and any
 * keyword. No input can reach `eval`, `Function`, a property lookup or a
 * global: identifiers resolve only against the caller's `bindings`.
 */

export class SafeExpressionSyntaxError extends SyntaxError {
  constructor(message: string) {
    super(message)
    this.name = 'SyntaxError'
  }
}

export type SafeExpressionOptions = {
  /** Values for identifiers (functions or constants). Unknown names throw ReferenceError. */
  bindings?: Readonly<Record<string, unknown>>
  /**
   * Strict-mode literal rules (default true): leading-zero numbers (`010`, `08`) and
   * octal string escapes are SyntaxErrors. `false` = sloppy script rules
   * (`010` → 8, `08` → 8), matching `new Function('return ' + src)`.
   */
  strict?: boolean
  /**
   * Allow an empty source (only whitespace/comments) → `undefined`, like
   * `return <empty>`. Default false (empty source is a SyntaxError).
   */
  allowEmpty?: boolean
  /**
   * After the expression, accept further expression statements that start on a
   * new line (automatic semicolon insertion). They are syntax-checked but never
   * evaluated, mirroring `return (${src});` where `src` contains `)\n…`.
   */
  trailingStatements?: boolean
}

// ------------------------------------------------------------------ lexer

type TokKind = 'num' | 'str' | 'regex' | 'ident' | 'punc' | 'eof'
type Token = {
  kind: TokKind
  /** punctuator text / identifier name / raw source for literals */
  text: string
  value?: unknown
  /** a line terminator occurred between the previous token and this one */
  nlBefore: boolean
  pos: number
}

const PUNCTUATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '<<=',
  '>>=',
  '>>>',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '**',
  '++',
  '--',
  '<<',
  '>>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '(',
  ')',
  '.',
  ',',
  '&',
  '|',
  '^',
  '~',
  '<',
  '>',
  '=',
  '!',
  '?',
  ':',
  ';',
  '[',
  ']',
  '{',
  '}',
]

const RESERVED_WORDS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const isLineTerminator = (ch: string) =>
  ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029'
// JS WhiteSpace ∪ LineTerminator is exactly the `\s` class.
const isWhitespace = (ch: string) => /\s/.test(ch)
const isDigit = (ch: string | undefined) => ch != null && ch >= '0' && ch <= '9'
const isIdentStart = (ch: string | undefined) =>
  ch != null && (/[A-Za-z_$\\]/.test(ch) || (ch > '\u007f' && /[\p{ID_Start}]/u.test(ch)))
const isIdentPart = (ch: string | undefined) =>
  ch != null &&
  (/[A-Za-z0-9_$]/.test(ch) || (ch > '\u007f' && /[\p{ID_Continue}\u200c\u200d]/u.test(ch)))

function syntaxError(message: string): never {
  throw new SafeExpressionSyntaxError(message)
}

class Lexer {
  private pos = 0
  /** Only whitespace / single-line block comments since the last line terminator. */
  private atLineStart = false
  private prev: Token | null = null
  private readonly src: string
  private readonly strict: boolean

  constructor(src: string, strict: boolean) {
    this.src = src
    this.strict = strict
  }

  /** Regex literals are allowed where an operand is expected. */
  private regexAllowed(): boolean {
    const p = this.prev
    if (!p) return true
    if (p.kind === 'num' || p.kind === 'str' || p.kind === 'regex' || p.kind === 'ident') return false
    return !(p.text === ')' || p.text === ']' || p.text === '}')
  }

  /** Skip whitespace and comments; returns whether a line terminator was crossed. */
  private skipTrivia(): boolean {
    const s = this.src
    let nl = false
    while (this.pos < s.length) {
      const ch = s[this.pos]!
      if (isLineTerminator(ch)) {
        nl = true
        this.atLineStart = true
        this.pos += 1
        continue
      }
      if (isWhitespace(ch)) {
        this.pos += 1
        continue
      }
      if (ch === '/' && s[this.pos + 1] === '*') {
        const end = s.indexOf('*/', this.pos + 2)
        if (end < 0) syntaxError('Invalid or unexpected token')
        const body = s.slice(this.pos + 2, end)
        if (/[\n\r\u2028\u2029]/.test(body)) {
          nl = true
          this.atLineStart = true
        }
        this.pos = end + 2
        continue
      }
      const lineComment =
        (ch === '/' && s[this.pos + 1] === '/') ||
        s.startsWith('<!--', this.pos) ||
        (this.atLineStart && s.startsWith('-->', this.pos))
      if (lineComment) {
        while (this.pos < s.length && !isLineTerminator(s[this.pos]!)) this.pos += 1
        continue
      }
      break
    }
    return nl
  }

  next(): Token {
    const nlBefore = this.skipTrivia()
    const tok = this.scan(nlBefore)
    this.atLineStart = false
    this.prev = tok
    return tok
  }

  private scan(nlBefore: boolean): Token {
    const s = this.src
    const start = this.pos
    if (start >= s.length) return { kind: 'eof', text: '', nlBefore, pos: start }
    const ch = s[start]!

    if (isDigit(ch) || (ch === '.' && isDigit(s[start + 1]))) return this.scanNumber(nlBefore)
    if (ch === '"' || ch === "'") return this.scanString(nlBefore)
    if (ch === '/' && this.regexAllowed()) return this.scanRegex(nlBefore)
    if (isIdentStart(ch)) {
      if (ch === '\\') syntaxError('Invalid or unexpected token')
      let end = start + 1
      while (end < s.length && isIdentPart(s[end])) end += 1
      if (s[end] === '\\') syntaxError('Invalid or unexpected token')
      this.pos = end
      return { kind: 'ident', text: s.slice(start, end), nlBefore, pos: start }
    }
    for (const p of PUNCTUATORS) {
      if (s.startsWith(p, start)) {
        // `?.` followed by a digit is `?` then a number.
        if (p === '?.' && isDigit(s[start + 2])) continue
        this.pos = start + p.length
        return { kind: 'punc', text: p, nlBefore, pos: start }
      }
    }
    syntaxError('Invalid or unexpected token')
  }

  private scanNumber(nlBefore: boolean): Token {
    const s = this.src
    const start = this.pos
    let end = start
    let value: number
    if (s[start] === '0' && isDigit(s[start + 1])) {
      // Legacy octal (`017`) or non-octal decimal with a leading zero (`08`, `09.5`).
      if (this.strict) {
        syntaxError(
          /^0[0-7]+(?![0-9])/.test(s.slice(start))
            ? 'Octal literals are not allowed in strict mode.'
            : 'Decimals with leading zeros are not allowed in strict mode.',
        )
      }
      while (isDigit(s[end])) end += 1
      const intText = s.slice(start, end)
      if (/^[0-7]+$/.test(intText)) {
        value = parseInt(intText, 8)
      } else {
        const m = /^\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/.exec(s.slice(start))!
        end = start + m[0].length
        value = Number(m[0])
      }
    } else {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(start))!
      end = start + m[0].length
      value = Number(m[0])
    }
    // The character right after a numeric literal must not start an identifier or number.
    if (isIdentStart(s[end]) || isDigit(s[end])) syntaxError('Invalid or unexpected token')
    this.pos = end
    return { kind: 'num', text: s.slice(start, end), value, nlBefore, pos: start }
  }

  private scanString(nlBefore: boolean): Token {
    const s = this.src
    const start = this.pos
    const quote = s[start]!
    let i = start + 1
    let out = ''
    const unterminated = () => syntaxError('Invalid or unexpected token')
    for (;;) {
      if (i >= s.length) unterminated()
      const ch = s[i]!
      if (ch === quote) {
        i += 1
        break
      }
      if (ch === '\n' || ch === '\r') unterminated()
      if (ch !== '\\') {
        out += ch
        i += 1
        continue
      }
      // escape sequence
      const e = s[i + 1]
      if (e == null) unterminated()
      i += 2
      switch (e) {
        case 'b':
          out += '\b'
          break
        case 'f':
          out += '\f'
          break
        case 'n':
          out += '\n'
          break
        case 'r':
          out += '\r'
          break
        case 't':
          out += '\t'
          break
        case 'v':
          out += '\v'
          break
        case '\r':
          if (s[i] === '\n') i += 1
          break
        case '\n':
        case '\u2028':
        case '\u2029':
          break
        case 'x': {
          const hex = s.slice(i, i + 2)
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) syntaxError('Invalid hexadecimal escape sequence')
          out += String.fromCharCode(parseInt(hex, 16))
          i += 2
          break
        }
        case 'u': {
          if (s[i] === '{') {
            const close = s.indexOf('}', i + 1)
            const hex = close < 0 ? '' : s.slice(i + 1, close)
            if (!/^[0-9a-fA-F]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff) {
              syntaxError('Invalid Unicode escape sequence')
            }
            out += String.fromCodePoint(parseInt(hex, 16))
            i = close + 1
          } else {
            const hex = s.slice(i, i + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) syntaxError('Invalid Unicode escape sequence')
            out += String.fromCharCode(parseInt(hex, 16))
            i += 4
          }
          break
        }
        default:
          if (e === '0' && !isDigit(s[i])) {
            out += '\0'
          } else if (isDigit(e)) {
            // Legacy octal (\1, \07) and \8 \9 escapes: strict-mode SyntaxErrors.
            syntaxError(
              e === '8' || e === '9'
                ? '\\8 and \\9 are not allowed in strict mode.'
                : 'Octal escape sequences are not allowed in strict mode.',
            )
          } else {
            out += e
          }
      }
    }
    this.pos = i
    return { kind: 'str', text: s.slice(start, i), value: out, nlBefore, pos: start }
  }

  private scanRegex(nlBefore: boolean): Token {
    const s = this.src
    const start = this.pos
    let i = start + 1
    let inClass = false
    for (;;) {
      if (i >= s.length) syntaxError('Invalid regular expression: missing /')
      const ch = s[i]!
      if (isLineTerminator(ch)) syntaxError('Invalid regular expression: missing /')
      if (ch === '\\') {
        if (i + 1 >= s.length || isLineTerminator(s[i + 1]!)) {
          syntaxError('Invalid regular expression: missing /')
        }
        i += 2
        continue
      }
      if (ch === '[') inClass = true
      else if (ch === ']') inClass = false
      else if (ch === '/' && !inClass) break
      i += 1
    }
    const pattern = s.slice(start + 1, i)
    i += 1
    const flagStart = i
    while (i < s.length && isIdentPart(s[i])) i += 1
    if (s[i] === '\\') syntaxError('Invalid regular expression flags')
    const flags = s.slice(flagStart, i)
    try {
      // Early error, like a regex literal: validate the pattern and flags now.
      new RegExp(pattern, flags)
    } catch (err) {
      syntaxError(err instanceof Error ? err.message : 'Invalid regular expression')
    }
    this.pos = i
    return { kind: 'regex', text: s.slice(start, i), value: { pattern, flags }, nlBefore, pos: start }
  }
}

// ------------------------------------------------------------------ parser

export type SafeExprNode =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'regex'; pattern: string; flags: string }
  | { type: 'ident'; name: string }
  | { type: 'unary'; op: '+' | '-' | '!'; arg: SafeExprNode }
  | { type: 'binary'; op: string; left: SafeExprNode; right: SafeExprNode }
  | { type: 'and'; left: SafeExprNode; right: SafeExprNode }
  | { type: 'seq'; items: SafeExprNode[] }
  | { type: 'call'; callee: SafeExprNode; args: SafeExprNode[] }
  | { type: 'empty' }

const ASSIGNMENT_OPS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
])

const BINARY_LEVELS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['&']),
  new Set(['==', '!=', '===', '!==']),
  new Set(['<', '>', '<=', '>=']),
  new Set(['<<', '>>', '>>>']),
  new Set(['+', '-']),
  new Set(['*', '/', '%']),
]

class Parser {
  private tok: Token
  private readonly lexer: Lexer

  constructor(src: string, strict: boolean) {
    this.lexer = new Lexer(src, strict)
    this.tok = this.lexer.next()
  }

  private advance(): Token {
    const t = this.tok
    this.tok = this.lexer.next()
    return t
  }

  private isPunc(text: string): boolean {
    return this.tok.kind === 'punc' && this.tok.text === text
  }

  private unexpected(): never {
    const t = this.tok
    if (t.kind === 'eof') syntaxError('Unexpected end of input')
    if (t.kind === 'num') syntaxError('Unexpected number')
    if (t.kind === 'str') syntaxError('Unexpected string')
    if (t.kind === 'ident') {
      syntaxError(
        RESERVED_WORDS.has(t.text) ? `Unexpected token '${t.text}'` : `Unexpected identifier '${t.text}'`,
      )
    }
    syntaxError(`Unexpected token '${t.text}'`)
  }

  private unsupported(what: string): never {
    syntaxError(`Unsupported formula syntax: ${what}`)
  }

  parseProgram(allowEmpty: boolean, trailingStatements: boolean): SafeExprNode {
    if (allowEmpty && this.tok.kind === 'eof') return { type: 'empty' }
    const node = this.parseExpression()
    // ASI: a token on a new line that cannot continue the expression starts a new
    // (unreachable) statement; it must still be valid syntax.
    while (trailingStatements && this.tok.kind !== 'eof' && this.tok.nlBefore) this.parseExpression()
    if (this.tok.kind !== 'eof') this.unexpected()
    return node
  }

  private parseExpression(): SafeExprNode {
    const first = this.parseAssignment()
    if (!this.isPunc(',')) return first
    const items = [first]
    while (this.isPunc(',')) {
      this.advance()
      items.push(this.parseAssignment())
    }
    return { type: 'seq', items }
  }

  /** AssignmentExpression level: only the (non-assigning) `&&` chain is supported. */
  private parseAssignment(): SafeExprNode {
    const node = this.parseAnd()
    if (this.tok.kind === 'punc') {
      if (ASSIGNMENT_OPS.has(this.tok.text)) this.unsupported(`assignment '${this.tok.text}'`)
      if (this.tok.text === '=>') this.unsupported('arrow function')
      if (this.tok.text === '||' || this.tok.text === '??' || this.tok.text === '?') {
        this.unsupported(`operator '${this.tok.text}'`)
      }
    }
    return node
  }

  private parseAnd(): SafeExprNode {
    let left = this.parseBinary(0)
    while (this.isPunc('&&')) {
      this.advance()
      left = { type: 'and', left, right: this.parseBinary(0) }
    }
    return left
  }

  private parseBinary(level: number): SafeExprNode {
    if (level >= BINARY_LEVELS.length) return this.parseExponent()
    const ops = BINARY_LEVELS[level]!
    let left = this.parseBinary(level + 1)
    while (this.tok.kind === 'punc' && ops.has(this.tok.text)) {
      const op = this.advance().text
      left = { type: 'binary', op, left, right: this.parseBinary(level + 1) }
    }
    return left
  }

  private parseExponent(): SafeExprNode {
    if (this.tok.kind === 'punc' && (this.tok.text === '+' || this.tok.text === '-' || this.tok.text === '!')) {
      const unary = this.parseUnary()
      if (this.isPunc('**')) {
        syntaxError(
          'Unary operator used immediately before exponentiation expression. Parenthesis must be used to disambiguate operator precedence',
        )
      }
      return unary
    }
    const base = this.parseUpdate()
    if (this.isPunc('**')) {
      this.advance()
      return { type: 'binary', op: '**', left: base, right: this.parseExponent() }
    }
    return base
  }

  private parseUnary(): SafeExprNode {
    if (this.tok.kind === 'punc' && (this.tok.text === '+' || this.tok.text === '-' || this.tok.text === '!')) {
      const op = this.advance().text as '+' | '-' | '!'
      return { type: 'unary', op, arg: this.parseUnary() }
    }
    if (this.tok.kind === 'punc' && (this.tok.text === '~' || this.tok.text === '++' || this.tok.text === '--')) {
      this.unsupported(`operator '${this.tok.text}'`)
    }
    return this.parseUpdate()
  }

  private parseUpdate(): SafeExprNode {
    if (this.isPunc('++') || this.isPunc('--')) this.unsupported(`operator '${this.tok.text}'`)
    const node = this.parseCall()
    if ((this.isPunc('++') || this.isPunc('--')) && !this.tok.nlBefore) {
      this.unsupported(`operator '${this.tok.text}'`)
    }
    return node
  }

  private parseCall(): SafeExprNode {
    let node = this.parsePrimary()
    for (;;) {
      if (this.isPunc('(')) {
        this.advance()
        const args: SafeExprNode[] = []
        while (!this.isPunc(')')) {
          if (this.isPunc('...')) this.unsupported('spread')
          args.push(this.parseAssignment())
          if (this.isPunc(',')) {
            this.advance()
            continue
          }
          if (!this.isPunc(')')) this.unexpected()
        }
        this.advance()
        node = { type: 'call', callee: node, args }
        continue
      }
      if (this.isPunc('.') || this.isPunc('?.') || this.isPunc('[')) this.unsupported('member access')
      return node
    }
  }

  private parsePrimary(): SafeExprNode {
    const t = this.tok
    switch (t.kind) {
      case 'num':
        this.advance()
        return { type: 'num', value: t.value as number }
      case 'str':
        this.advance()
        return { type: 'str', value: t.value as string }
      case 'regex': {
        this.advance()
        const { pattern, flags } = t.value as { pattern: string; flags: string }
        return { type: 'regex', pattern, flags }
      }
      case 'ident':
        if (RESERVED_WORDS.has(t.text)) this.unexpected()
        this.advance()
        return { type: 'ident', name: t.text }
      case 'punc':
        if (t.text === '(') {
          this.advance()
          if (this.isPunc(')')) {
            this.advance()
            if (this.isPunc('=>')) this.unsupported('arrow function')
            syntaxError("Unexpected token ')'")
          }
          const inner = this.parseExpression()
          if (!this.isPunc(')')) this.unexpected()
          this.advance()
          if (this.isPunc('=>')) this.unsupported('arrow function')
          return inner
        }
        if (t.text === '...') this.unsupported('spread')
        if (t.text === '[' || t.text === '{') this.unsupported('object/array literal')
        return this.unexpected()
      default:
        return this.unexpected()
    }
  }
}

/** Parse `src` into an AST. Throws SafeExpressionSyntaxError on invalid / unsupported syntax. */
export function parseSafeExpression(src: string, options?: SafeExpressionOptions): SafeExprNode {
  const parser = new Parser(src, options?.strict ?? true)
  return parser.parseProgram(options?.allowEmpty ?? false, options?.trailingStatements ?? false)
}

// ------------------------------------------------------------------ evaluator

type Bindings = Readonly<Record<string, unknown>>

/* eslint-disable @typescript-eslint/no-explicit-any -- operators are applied to
   arbitrary JS values on purpose, to keep JavaScript coercion semantics exactly. */
function applyBinary(op: string, a: any, b: any): unknown {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return a / b
    case '%':
      return a % b
    case '**':
      return a ** b
    case '<<':
      return a << b
    case '>>':
      return a >> b
    case '>>>':
      return a >>> b
    case '<':
      return a < b
    case '>':
      return a > b
    case '<=':
      return a <= b
    case '>=':
      return a >= b
    case '==':
      return a == b
    case '!=':
      return a != b
    case '===':
      return a === b
    case '!==':
      return a !== b
    case '&':
      return a & b
    default:
      throw new SafeExpressionSyntaxError(`Unsupported operator '${op}'`)
  }
}

function applyUnary(op: '+' | '-' | '!', v: any): unknown {
  if (op === '+') return +v
  if (op === '-') return -v
  return !v
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function describeCallee(node: SafeExprNode): string {
  if (node.type === 'ident') return node.name
  if (node.type === 'num') return String(node.value)
  return 'expression'
}

function evaluateNode(node: SafeExprNode, bindings: Bindings): unknown {
  switch (node.type) {
    case 'num':
    case 'str':
      return node.value
    case 'regex':
      return new RegExp(node.pattern, node.flags)
    case 'empty':
      return undefined
    case 'ident':
      if (Object.prototype.hasOwnProperty.call(bindings, node.name)) return bindings[node.name]
      throw new ReferenceError(`${node.name} is not defined`)
    case 'unary':
      return applyUnary(node.op, evaluateNode(node.arg, bindings))
    case 'binary': {
      const left = evaluateNode(node.left, bindings)
      const right = evaluateNode(node.right, bindings)
      return applyBinary(node.op, left, right)
    }
    case 'and': {
      const left = evaluateNode(node.left, bindings)
      return left ? evaluateNode(node.right, bindings) : left
    }
    case 'seq': {
      let last: unknown
      for (const item of node.items) last = evaluateNode(item, bindings)
      return last
    }
    case 'call': {
      const fn = evaluateNode(node.callee, bindings)
      const args = node.args.map((a) => evaluateNode(a, bindings))
      if (typeof fn !== 'function') throw new TypeError(`${describeCallee(node.callee)} is not a function`)
      return (fn as (...a: unknown[]) => unknown)(...args)
    }
  }
}

/** Evaluate an already-parsed expression with the given identifier bindings. */
export function evaluateSafeExpressionNode(node: SafeExprNode, bindings: Bindings = {}): unknown {
  return evaluateNode(node, bindings)
}

/**
 * Parse and evaluate `src`. The whole source is parsed before anything runs, so
 * syntax errors surface before any function is called (like `new Function`).
 */
export function evaluateSafeExpression(src: string, options?: SafeExpressionOptions): unknown {
  const ast = parseSafeExpression(src, options)
  return evaluateNode(ast, options?.bindings ?? {})
}

/**
 * Plain calculator: `^[-+*\/.0-9]+$` style arithmetic typed by a user
 * (whitespace ignored). Returns the result as a string, or 'Error' for
 * invalid / non-finite input — same contract as the old `new Function` helper.
 */
export function evaluateArithmeticToString(expr: string): string {
  const sanitized = expr.replace(/\s+/g, '')
  if (!/^[-+*/.0-9]+$/.test(sanitized)) return 'Error'
  try {
    const res = evaluateSafeExpression(sanitized, { strict: false, allowEmpty: true })
    return isFinite(res as number) ? String(res) : 'Error'
  } catch {
    return 'Error'
  }
}
