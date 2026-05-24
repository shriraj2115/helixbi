export class SemanticCompiler {
  compileModel(rawModel: string): any {
    console.warn('[HelixSemantic] Compiling semantic model...', rawModel)
    return {}
  }

  translateQuery(semanticQuery: any): any {
    return semanticQuery
  }
}

export const semanticCompiler = new SemanticCompiler()
