import { getAllValidDeposits } from '../../src/db/depositRepository.js';
import db from '../../src/db/connection';

jest.mock('../../src/db/connection');

describe('getAllValidDeposits', () => {
  it('devuelve depósitos válidos correctamente', async () => {
    db.query.mockResolvedValue({
      rows: [{ txid: '1', address: 'address1', amount: 50, confirmations: 6 }],
    });

    const deposits = await getAllValidDeposits(6);
    expect(deposits).toHaveLength(1);
    expect(deposits[0].txid).toBe('1');
  });

  it('maneja errores de base de datos', async () => {
    db.query.mockRejectedValue(new Error('Database error'));

    await expect(getAllValidDeposits(6)).rejects.toThrow('Database error');
  });
});
