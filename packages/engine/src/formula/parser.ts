import { Token, TokenType } from './lexer'
import { ASTNode } from './ast'

enum Precedence {
  LOWEST = 0,
  SUM = 1,     // + -
  PRODUCT = 2, // * /
  CALL = 3     // Function call
}

const PRECEDENCES: Partial<Record<TokenType, Precedence>> = {
  PLUS: Precedence.SUM,
  MINUS: Precedence.SUM,
  MULTIPLY: Precedence.PRODUCT,
  DIVIDE: Precedence.PRODUCT,
}

type PrefixParseFn = () => ASTNode
type InfixParseFn = (left: ASTNode) => ASTNode

export class Parser {
  private tokens: Token[]
  private curPos: number = 0

  private prefixParseFns: Partial<Record<TokenType, PrefixParseFn>> = {}
  private infixParseFns: Partial<Record<TokenType, InfixParseFn>> = {}

  constructor(tokens: Token[]) {
    this.tokens = tokens

    // Register prefix functions
    this.registerPrefix('NUMBER', this.parseLiteral)
    this.registerPrefix('STRING', this.parseLiteral)
    this.registerPrefix('COLUMN', this.parseColumnRef)
    this.registerPrefix('IDENTIFIER', this.parseIdentifierOrFunction)
    this.registerPrefix('LPAREN', this.parseGroupedExpression)
    this.registerPrefix('MINUS', this.parsePrefixMinus)

    // Register infix functions
    this.registerInfix('PLUS', this.parseBinaryExpression)
    this.registerInfix('MINUS', this.parseBinaryExpression)
    this.registerInfix('MULTIPLY', this.parseBinaryExpression)
    this.registerInfix('DIVIDE', this.parseBinaryExpression)
  }

  parse(): ASTNode {
    if (this.tokens.length === 0 || (this.tokens.length === 1 && this.tokens[0]?.type === 'EOF')) {
      throw new Error('Empty expression')
    }
    const expr = this.parseExpression(Precedence.LOWEST)
    if (this.curToken().type !== 'EOF') {
      throw new Error(
        `Unexpected token '${this.curToken().value}' at position ${this.curToken().position}`
      )
    }
    return expr
  }

  private parseExpression(precedence: Precedence): ASTNode {
    const token = this.curToken()
    const prefix = this.prefixParseFns[token.type]
    if (!prefix) {
      throw new Error(`Unexpected token '${token.value}' at position ${token.position}`)
    }

    let left = prefix.call(this)

    while (precedence < this.curPrecedence()) {
      const nextToken = this.curToken()
      const infix = this.infixParseFns[nextToken.type]
      if (!infix) {
        return left
      }
      left = infix.call(this, left)
    }

    return left
  }

  private parseLiteral(): ASTNode {
    const token = this.curToken()
    this.nextToken()
    if (token.type === 'NUMBER') {
      const val = parseFloat(token.value)
      if (isNaN(val)) {
        throw new Error(`Invalid number '${token.value}' at position ${token.position}`)
      }
      return { type: 'Literal', value: val }
    }
    return { type: 'Literal', value: token.value }
  }

  private parseColumnRef(): ASTNode {
    const token = this.curToken()
    this.nextToken()
    return { type: 'ColumnRef', name: token.value }
  }

  private parseIdentifierOrFunction(): ASTNode {
    const nameToken = this.curToken()
    this.nextToken()

    if (this.curToken().type === 'LPAREN') {
      this.nextToken() // consume '('
      const args: ASTNode[] = []

      if (this.curToken().type !== 'RPAREN') {
        args.push(this.parseExpression(Precedence.LOWEST))
        while (this.curToken().type === 'COMMA') {
          this.nextToken() // consume ','
          args.push(this.parseExpression(Precedence.LOWEST))
        }
      }

      if (this.curToken().type !== 'RPAREN') {
        throw new Error(`Expected ')' at position ${this.curToken().position}, got '${this.curToken().value}'`)
      }
      this.nextToken() // consume ')'

      return {
        type: 'FunctionCall',
        name: nameToken.value.toUpperCase(),
        arguments: args
      }
    }

    const upperVal = nameToken.value.toUpperCase()
    if (upperVal === 'TRUE') return { type: 'Literal', value: true }
    if (upperVal === 'FALSE') return { type: 'Literal', value: false }
    if (upperVal === 'NULL') return { type: 'Literal', value: null }

    // Bare identifier defaults to a column reference
    return { type: 'ColumnRef', name: nameToken.value }
  }

  private parseGroupedExpression(): ASTNode {
    this.nextToken() // consume '('
    const expr = this.parseExpression(Precedence.LOWEST)
    if (this.curToken().type !== 'RPAREN') {
      throw new Error(`Expected ')' at position ${this.curToken().position}, got '${this.curToken().value}'`)
    }
    this.nextToken() // consume ')'
    return expr
  }

  private parsePrefixMinus(): ASTNode {
    this.nextToken() // consume '-'
    const right = this.parseExpression(Precedence.CALL)
    return {
      type: 'BinaryOp',
      operator: '-',
      left: { type: 'Literal', value: 0 },
      right
    }
  }

  private parseBinaryExpression(left: ASTNode): ASTNode {
    const operatorToken = this.curToken()
    const precedence = this.curPrecedence()
    this.nextToken()

    const right = this.parseExpression(precedence)
    return {
      type: 'BinaryOp',
      operator: operatorToken.value as '+' | '-' | '*' | '/',
      left,
      right
    }
  }

  private registerPrefix(type: TokenType, fn: PrefixParseFn) {
    this.prefixParseFns[type] = fn
  }

  private registerInfix(type: TokenType, fn: InfixParseFn) {
    this.infixParseFns[type] = fn
  }

  private nextToken() {
    if (this.curPos < this.tokens.length - 1) {
      this.curPos++
    }
  }

  private curToken(): Token {
    return this.tokens[this.curPos] || { type: 'EOF', value: '', position: 0 }
  }

  private curPrecedence(): Precedence {
    return PRECEDENCES[this.curToken().type] ?? Precedence.LOWEST
  }
}
