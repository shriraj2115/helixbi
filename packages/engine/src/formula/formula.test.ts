import { describe, it, expect } from 'vitest'
import { Lexer } from './lexer'
import { Parser } from './parser'
import { compileASTToSQL, parseAndCompileFormula } from './compiler'
import { compileFormula } from '../index'

describe('Formula Lexer', () => {
  it('should tokenize simple math and columns', () => {
    const lexer = new Lexer('[AMOUNT] + 10.5 * [QTY]')
    const tokens = lexer.tokenize()

    expect(tokens.map(t => t.type)).toEqual([
      'COLUMN',
      'PLUS',
      'NUMBER',
      'MULTIPLY',
      'COLUMN',
      'EOF'
    ])

    expect(tokens[0]!.value).toBe('AMOUNT')
    expect(tokens[2]!.value).toBe('10.5')
    expect(tokens[4]!.value).toBe('QTY')
  })

  it('should handle single and double quoted strings', () => {
    const lexer = new Lexer(`'Sales' + "Marketing"`)
    const tokens = lexer.tokenize()

    expect(tokens.map(t => t.type)).toEqual([
      'STRING',
      'PLUS',
      'STRING',
      'EOF'
    ])

    expect(tokens[0]!.value).toBe('Sales')
    expect(tokens[2]!.value).toBe('Marketing')
  })

  it('should throw error on unterminated column reference', () => {
    const lexer = new Lexer('[AMOUNT')
    expect(() => lexer.tokenize()).toThrow('Unterminated column reference')
  })

  it('should throw error on unterminated string', () => {
    const lexer = new Lexer(`'unterminated`)
    expect(() => lexer.tokenize()).toThrow('Unterminated string literal')
  })
})

describe('Formula Parser & Compiler', () => {
  const parseExpr = (expr: string) => {
    const lexer = new Lexer(expr)
    const parser = new Parser(lexer.tokenize())
    return parser.parse()
  }

  it('should parse and compile simple addition', () => {
    const ast = parseExpr('[AMOUNT] + 1')
    expect(compileASTToSQL(ast)).toBe('("AMOUNT" + 1)')
  })

  it('should respect operator precedence (* before +)', () => {
    const ast1 = parseExpr('[AMOUNT] + 2 * [QTY]')
    expect(compileASTToSQL(ast1)).toBe('("AMOUNT" + (2 * "QTY"))')

    const ast2 = parseExpr('2 * [QTY] + [AMOUNT]')
    expect(compileASTToSQL(ast2)).toBe('((2 * "QTY") + "AMOUNT")')
  })

  it('should respect parentheses grouping', () => {
    const ast = parseExpr('([AMOUNT] + 2) * [QTY]')
    expect(compileASTToSQL(ast)).toBe('(("AMOUNT" + 2) * "QTY")')
  })

  it('should parse and compile function calls', () => {
    const ast = parseExpr('COALESCE([DISCOUNT], 0)')
    expect(compileASTToSQL(ast)).toBe('COALESCE("DISCOUNT", 0)')
  })

  it('should compile nested function calls', () => {
    const ast = parseExpr('IFNULL([PRICE], COALESCE([BASE_PRICE], 100))')
    expect(compileASTToSQL(ast)).toBe('IFNULL("PRICE", COALESCE("BASE_PRICE", 100))')
  })

  it('should parse prefix minus', () => {
    const ast = parseExpr('-[AMOUNT]')
    expect(compileASTToSQL(ast)).toBe('(0 - "AMOUNT")')
  })

  it('should parse booleans and null', () => {
    const astTrue = parseExpr('TRUE')
    expect(compileASTToSQL(astTrue)).toBe('TRUE')

    const astFalse = parseExpr('FALSE')
    expect(compileASTToSQL(astFalse)).toBe('FALSE')

    const astNull = parseExpr('NULL')
    expect(compileASTToSQL(astNull)).toBe('NULL')
  })
})

describe('Dependency Extraction', () => {
  it('should extract correct dependencies', () => {
    const { dependsOn } = parseAndCompileFormula('([PRICE] - [DISCOUNT]) * [QTY]')
    expect(dependsOn).toEqual(['PRICE', 'DISCOUNT', 'QTY'])
  })

  it('should extract dependencies from function arguments', () => {
    const { dependsOn } = parseAndCompileFormula('COALESCE([DISCOUNT], [GLOBAL_DISCOUNT], 0)')
    expect(dependsOn).toEqual(['DISCOUNT', 'GLOBAL_DISCOUNT'])
  })

  it('should extract no dependencies for literals', () => {
    const { dependsOn } = parseAndCompileFormula('100 * 200')
    expect(dependsOn).toEqual([])
  })
})

describe('Integrations & compileFormula', () => {
  it('should successfully compile expression via exported compileFormula', () => {
    const sql = compileFormula('COALESCE([PROFIT], 0) * 1.5')
    expect(sql).toBe('(COALESCE("PROFIT", 0) * 1.5)')
  })
})
