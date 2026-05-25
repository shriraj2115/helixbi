export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'COLUMN'
  | 'IDENTIFIER'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF'

export interface Token {
  type: TokenType
  value: string
  position: number
}

export class Lexer {
  private input: string
  private position: number = 0

  constructor(input: string) {
    this.input = input
  }

  tokenize(): Token[] {
    const tokens: Token[] = []
    let token = this.nextToken()
    while (token.type !== 'EOF') {
      tokens.push(token)
      token = this.nextToken()
    }
    tokens.push(token)
    return tokens
  }

  private nextToken(): Token {
    this.skipWhitespace()

    if (this.position >= this.input.length) {
      return { type: 'EOF', value: '', position: this.position }
    }

    const char = this.input[this.position]!

    if (char === '+') return this.createToken('PLUS', '+')
    if (char === '-') return this.createToken('MINUS', '-')
    if (char === '*') return this.createToken('MULTIPLY', '*')
    if (char === '/') return this.createToken('DIVIDE', '/')
    if (char === '(') return this.createToken('LPAREN', '(')
    if (char === ')') return this.createToken('RPAREN', ')')
    if (char === ',') return this.createToken('COMMA', ',')

    if (char === '[') {
      const startPos = this.position
      this.position++ // Skip '['
      let content = ''
      while (this.position < this.input.length && this.input[this.position] !== ']') {
        content += this.input[this.position]
        this.position++
      }
      if (this.position >= this.input.length) {
        throw new Error(`Unterminated column reference starting at position ${startPos}`)
      }
      this.position++ // Skip ']'
      return { type: 'COLUMN', value: content, position: startPos }
    }

    if (this.isDigit(char)) {
      const startPos = this.position
      let numStr = ''
      while (
        this.position < this.input.length &&
        (this.isDigit(this.input[this.position]!) || this.input[this.position] === '.')
      ) {
        numStr += this.input[this.position]
        this.position++
      }
      return { type: 'NUMBER', value: numStr, position: startPos }
    }

    if (char === "'" || char === '"') {
      const quoteChar = char
      const startPos = this.position
      this.position++ // Skip open quote
      let strContent = ''
      while (this.position < this.input.length && this.input[this.position] !== quoteChar) {
        if (this.input[this.position] === '\\' && this.position + 1 < this.input.length) {
          this.position++ // Skip escape character
          strContent += this.input[this.position]
        } else {
          strContent += this.input[this.position]
        }
        this.position++
      }
      if (this.position >= this.input.length) {
        throw new Error(`Unterminated string literal starting at position ${startPos}`)
      }
      this.position++ // Skip close quote
      return { type: 'STRING', value: strContent, position: startPos }
    }

    if (this.isAlpha(char) || char === '_') {
      const startPos = this.position
      let ident = ''
      while (
        this.position < this.input.length &&
        (this.isAlphaNum(this.input[this.position]!) || this.input[this.position] === '_')
      ) {
        ident += this.input[this.position]
        this.position++
      }
      return { type: 'IDENTIFIER', value: ident, position: startPos }
    }

    throw new Error(`Unexpected character '${char}' at position ${this.position}`)
  }

  private createToken(type: TokenType, value: string): Token {
    const pos = this.position
    this.position++
    return { type, value, position: pos }
  }

  private skipWhitespace() {
    while (this.position < this.input.length && /\s/.test(this.input[this.position]!)) {
      this.position++
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9'
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
  }

  private isAlphaNum(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char)
  }
}
