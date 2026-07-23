export const ALLOWED_DOCUMENT_EXTENSIONS = [
  // Documents
  '.pdf', '.docx', '.md', '.txt',
  // Spreadsheets
  '.xlsx', '.csv',
  // Web / markup / data
  '.html', '.htm', '.json', '.xml', '.yaml', '.yml',
  // Source code
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php',
  '.c', '.cpp', '.h', '.cs', '.rs', '.sql', '.sh',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
