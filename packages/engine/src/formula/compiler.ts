import { ASTNode } from './ast'

import { Lexer } from './lexer'
import { Parser } from './parser'

export function compileASTToSQL(node: ASTNode): string {
  switch (node.type) {
    case 'Literal':
      if (node.value === null) {
        return 'NULL'
      }
      if (typeof node.value === 'string') {
        const escaped = node.value.replace(/'/g, "''")
        return `'${escaped}'`
      }
      if (typeof node.value === 'boolean') {
        return node.value ? 'TRUE' : 'FALSE'
      }
      return node.value.toString()

    case 'ColumnRef':
      return `"${node.name}"`

    case 'BinaryOp': {
      const leftSQL = compileASTToSQL(node.left)
      const rightSQL = compileASTToSQL(node.right)
      return `(${leftSQL} ${node.operator} ${rightSQL})`
    }

    case 'FunctionCall': {
      const argsSQL = node.arguments.map((arg) => compileASTToSQL(arg)).join(', ')
      return `${node.name}(${argsSQL})`
    }

    default:
      throw new Error(`Unknown AST node type: ${(node as any).type}`)
  }
}

export function extractASTDependencies(node: ASTNode): string[] {
  const deps = new Set<string>()

  function walk(n: ASTNode) {
    if (n.type === 'ColumnRef') {
      deps.add(n.name)
    } else if (n.type === 'BinaryOp') {
      walk(n.left)
      walk(n.right)
    } else if (n.type === 'FunctionCall') {
      for (const arg of n.arguments) {
        walk(arg)
      }
    }
  }

  walk(node)
  return Array.from(deps)
}

export function parseAndCompileFormula(expression: string): { sqlExpression: string; dependsOn: string[] } {
  const lexer = new Lexer(expression)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens)
  const ast = parser.parse()
  
  return {
    sqlExpression: compileASTToSQL(ast),
    dependsOn: extractASTDependencies(ast),
  }
}
