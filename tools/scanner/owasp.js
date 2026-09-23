// OWASP Top 10 for Agentic Applications (2026), as referenced by the checks.

export const ASI = {
  ASI01: 'Agent Goal Hijack',
  ASI02: 'Tool Misuse & Exploitation',
  ASI03: 'Agent Identity & Privilege Abuse',
  ASI04: 'Agentic Supply Chain Compromise',
  ASI05: 'Unexpected Code Execution',
  ASI06: 'Memory & Context Poisoning',
  ASI07: 'Insecure Inter-Agent Communication',
  ASI08: 'Cascading Agent Failures',
  ASI09: 'Human-Agent Trust Exploitation',
  ASI10: 'Rogue Agents',
};

// Risks the scanner cannot observe on-chain, and why.
export const NOT_OBSERVABLE = {
  ASI05: 'Ejecución de código en el host del agente: fuera de la cadena, no se ve desde el ledger.',
  ASI06: 'Mitigado por diseño: el gasto real vive en el SpendLog on-chain, no en la memoria del agente.',
};
