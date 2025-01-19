// Error general para la base de datos
export class DatabaseError extends Error {
    constructor(message) {
      super(message);
      this.name = "DatabaseError";
      this.statusCode = 500; // HTTP 500: Internal Server Error
    }
  }
  
  // Error para problemas de procesamiento de archivos
  export class FileProcessingError extends Error {
    constructor(message) {
      super(message);
      this.name = "FileProcessingError";
      this.statusCode = 400; // HTTP 400: Bad Request
    }
  }
  
  // Error para transacciones inválidas
  export class TransactionValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = "TransactionValidationError";
      this.statusCode = 400; // HTTP 400: Bad Request
    }
  }
  
  // Error para fallas de conexión (por ejemplo, con la base de datos)
  export class ConnectionError extends Error {
    constructor(message) {
      super(message);
      this.name = "ConnectionError";
      this.statusCode = 503; // HTTP 503: Service Unavailable
    }
  }
  
  // Error genérico para otros casos
  export class AppError extends Error {
    constructor(message, statusCode = 500) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode; // Por defecto HTTP 500
    }
  }
  