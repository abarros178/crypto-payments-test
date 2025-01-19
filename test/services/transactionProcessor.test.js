import { processTransactions } from '../../src/services/transactionProcessor';
import { readJsonFile } from '../../src/utils/fileReader';
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
  getExistingTxids,
} from '../../src/db/depositRepository';

jest.mock('../../src/utils/fileReader');
jest.mock('../../src/db/depositRepository');

describe('processTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('procesa archivos JSON correctamente', async () => {
    // Mock de datos
    readJsonFile.mockResolvedValue({
      transactions: [{ txid: '1', address: 'address1', amount: 50, confirmations: 6 }],
    });
    getExistingTxids.mockResolvedValue([]);
    saveValidDepositsInBatch.mockResolvedValue();
    saveFailedTransactionsInBatch.mockResolvedValue();

    const executionId = 'execution-123';
    await processTransactions(executionId);

    // Verificar interacciones
    expect(readJsonFile).toHaveBeenCalled();
    expect(saveValidDepositsInBatch).toHaveBeenCalled();
    expect(saveFailedTransactionsInBatch).toHaveBeenCalled();
  });
});
