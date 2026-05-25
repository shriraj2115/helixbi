export type ASTNode = LiteralNode | ColumnRefNode | BinaryOpNode | FunctionCallNode

export interface LiteralNode {
  type: 'Literal'
  value: number | string | boolean | null
}

export interface ColumnRefNode {
  type: 'ColumnRef'
  name: string
}

export interface BinaryOpNode {
  type: 'BinaryOp'
  operator: '+' | '-' | '*' | '/'
  left: ASTNode
  right: ASTNode
}

export interface FunctionCallNode {
  type: 'FunctionCall'
  name: string
  arguments: ASTNode[]
}
