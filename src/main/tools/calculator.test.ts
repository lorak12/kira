import { describe, it, expect } from 'vitest'
import { evaluateExpression, CalculatorError, calculatorTool } from './calculator'

describe('evaluateExpression', () => {
  it('handles basic arithmetic with precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14)
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20)
  })

  it('handles exponents right-associatively', () => {
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512) // 2^(3^2), not (2^3)^2
  })

  it('handles unary minus', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2)
    expect(evaluateExpression('3 - -2')).toBe(5)
  })

  it('handles functions and constants', () => {
    expect(evaluateExpression('sqrt(49)')).toBe(7)
    expect(evaluateExpression('round(pi)')).toBe(3)
    expect(evaluateExpression('max(1, 5, 3)')).toBe(5)
  })

  it('handles modulo and division', () => {
    expect(evaluateExpression('10 % 3')).toBe(1)
    expect(evaluateExpression('10 / 4')).toBe(2.5)
  })

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(CalculatorError)
  })

  it('throws on unknown identifiers', () => {
    expect(() => evaluateExpression('banana')).toThrow(CalculatorError)
  })

  it('throws on unsafe/invalid characters', () => {
    expect(() => evaluateExpression('process.exit()')).toThrow(CalculatorError)
    expect(() => evaluateExpression('1; 2')).toThrow(CalculatorError)
  })

  it('throws on empty input', () => {
    expect(() => evaluateExpression('')).toThrow(CalculatorError)
  })

  it('throws on mismatched parens', () => {
    expect(() => evaluateExpression('(1 + 2')).toThrow(CalculatorError)
  })
})

describe('calculatorTool.execute', () => {
  it('returns a friendly "expr = result" string', async () => {
    const result = await calculatorTool.execute({ expression: '2 + 2' })
    expect(result).toBe('2 + 2 = 4')
  })

  it('returns a friendly error instead of throwing', async () => {
    const result = await calculatorTool.execute({ expression: '1 / 0' })
    expect(result).toContain('Could not evaluate')
  })

  it('rounds away floating point noise', async () => {
    const result = await calculatorTool.execute({ expression: '0.1 + 0.2' })
    expect(result).toBe('0.1 + 0.2 = 0.3')
  })
})
