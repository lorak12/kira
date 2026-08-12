import type { ToolDefinition } from './types'

// Small recursive-descent arithmetic evaluator -- deliberately not `eval`/
// `Function`, since the expression comes from LLM output derived from user
// speech and should never get access to the JS runtime.
type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma'
interface Token {
  type: TokenType
  value: string
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  min: Math.min,
  max: Math.max
}

export class CalculatorError extends Error {}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      tokens.push({ type: 'num', value: expr.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < expr.length && /[a-zA-Z_0-9]/.test(expr[j])) j++
      tokens.push({ type: 'ident', value: expr.slice(i, j) })
      i = j
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', value: c })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: c })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ type: 'comma', value: c })
      i++
      continue
    }
    if ('+-*/^%'.includes(c)) {
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }
    throw new CalculatorError(`Unexpected character "${c}" in expression.`)
  }
  return tokens
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new CalculatorError('Unexpected end of expression.')
    this.pos++
    return t
  }

  parse(): number {
    const result = this.parseAddSub()
    if (this.pos < this.tokens.length) {
      throw new CalculatorError(`Unexpected token "${this.peek()?.value}".`)
    }
    return result
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv()
    while (this.peek()?.type === 'op' && (this.peek()?.value === '+' || this.peek()?.value === '-')) {
      const op = this.next().value
      const right = this.parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  private parseMulDiv(): number {
    let left = this.parsePow()
    while (this.peek()?.type === 'op' && ['*', '/', '%'].includes(this.peek()?.value ?? '')) {
      const op = this.next().value
      const right = this.parsePow()
      if (op === '*') left *= right
      else if (op === '/') {
        if (right === 0) throw new CalculatorError('Division by zero.')
        left /= right
      } else left %= right
    }
    return left
  }

  private parsePow(): number {
    const left = this.parseUnary()
    if (this.peek()?.type === 'op' && this.peek()?.value === '^') {
      this.next()
      const right = this.parsePow() // right-associative
      return Math.pow(left, right)
    }
    return left
  }

  private parseUnary(): number {
    if (this.peek()?.type === 'op' && this.peek()?.value === '-') {
      this.next()
      return -this.parseUnary()
    }
    if (this.peek()?.type === 'op' && this.peek()?.value === '+') {
      this.next()
      return this.parseUnary()
    }
    return this.parseAtom()
  }

  private parseAtom(): number {
    const token = this.next()
    if (token.type === 'num') return parseFloat(token.value)
    if (token.type === 'lparen') {
      const value = this.parseAddSub()
      if (this.peek()?.type !== 'rparen') throw new CalculatorError('Missing closing parenthesis.')
      this.next()
      return value
    }
    if (token.type === 'ident') {
      const name = token.value.toLowerCase()
      if (this.peek()?.type === 'lparen') {
        this.next()
        const args: number[] = []
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseAddSub())
          while (this.peek()?.type === 'comma') {
            this.next()
            args.push(this.parseAddSub())
          }
        }
        if (this.peek()?.type !== 'rparen') throw new CalculatorError('Missing closing parenthesis.')
        this.next()
        const fn = FUNCTIONS[name]
        if (!fn) throw new CalculatorError(`Unknown function "${name}".`)
        return fn(...args)
      }
      if (name in CONSTANTS) return CONSTANTS[name]
      throw new CalculatorError(`Unknown identifier "${name}".`)
    }
    throw new CalculatorError(`Unexpected token "${token.value}".`)
  }
}

/** Evaluates a plain-text arithmetic expression. Throws CalculatorError on anything unsafe/invalid. */
export function evaluateExpression(expr: string): number {
  const tokens = tokenize(expr)
  if (!tokens.length) throw new CalculatorError('Empty expression.')
  const result = new Parser(tokens).parse()
  if (!Number.isFinite(result)) throw new CalculatorError('Result is not a finite number.')
  return result
}

export const calculatorTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'calculate',
    description:
      'Evaluates a math expression and returns the numeric result. Supports + - * / ^ %, parentheses, and functions like sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, min, max, and constants pi, e.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The math expression to evaluate, e.g. "12 * (3 + 4) / sqrt(49)"'
        }
      },
      required: ['expression']
    }
  },
  async execute(args) {
    const expression = String(args.expression ?? '')
    try {
      const result = evaluateExpression(expression)
      const rounded = Math.round(result * 1e10) / 1e10
      return `${expression} = ${rounded}`
    } catch (err) {
      return `Could not evaluate "${expression}": ${(err as Error).message}`
    }
  }
}
