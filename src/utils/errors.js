// Error general para la base de datos
export class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseError";
    this.statusCode = 500;
  }
}

// Error para transacciones inválidas
export class TransactionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransactionValidationError";
    this.statusCode = 400;
  }
}

// Error para fallas de conexión
export class ConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConnectionError";
    this.statusCode = 503;
  }
}

// Error genérico
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export class FileProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "FileProcessingError";
    this.statusCode = 500;
  }
}
