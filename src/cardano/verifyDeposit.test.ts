import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { verifyDeposit } from './verifyDeposit.js';
import {
  txWithTreasuryDonation,
  txWithDeposit,
  txWithoutStakeKey,
  stakeAddr,
  depositAddr,
} from '../__fixtures__/transactions.js';

vi.mock('./cardanoApi.js', () => ({
  fetchTxInfo: vi.fn(),
}));

const { fetchTxInfo } = (await import('./cardanoApi.js')) as {
  fetchTxInfo: ReturnType<typeof vi.fn>;
};

describe('verifyDeposit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchTxInfo.mockReset();
  });

  const validTxHash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

  describe('input validation', () => {
    it('rejects missing txHash', async () => {
      const result = await verifyDeposit('', stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toEqual({ error: 'Transaction hash is missing or invalid' });
    });

    it('rejects non-hex txHash', async () => {
      const result = await verifyDeposit('not-hex!', stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toEqual({ error: 'Transaction hash is missing or invalid' });
    });

    it('rejects missing stakeAddr', async () => {
      const result = await verifyDeposit(validTxHash, '', { treasuryDonation: 1000000 });
      expect(result).toEqual({ error: 'Stake address is missing' });
    });

    it('rejects when no options provided', async () => {
      const result = await verifyDeposit(validTxHash, stakeAddr);
      expect(result).toEqual({
        error: 'At least one of treasuryDonation or depositAddress/depositAmount must be provided',
      });
    });

    it('rejects incomplete deposit options (address only)', async () => {
      const result = await verifyDeposit(validTxHash, stakeAddr, { depositAddress: depositAddr });
      expect(result).toEqual({
        error: 'Both depositAddress and depositAmount are required for deposit verification',
      });
    });

    it('rejects incomplete deposit options (amount only)', async () => {
      const result = await verifyDeposit(validTxHash, stakeAddr, { depositAmount: 1000000 });
      expect(result).toEqual({
        error: 'Both depositAddress and depositAmount are required for deposit verification',
      });
    });
  });

  describe('treasury donation', () => {
    it('returns error when tx not found', async () => {
      fetchTxInfo.mockResolvedValueOnce(null);
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toEqual({ error: 'Transaction not found' });
    });

    it('returns error when stake key not in inputs', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithoutStakeKey);
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toEqual({
        error: 'The specified stake key did not contribute to this transaction',
      });
    });

    it('returns true when donation meets requirement', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithTreasuryDonation);
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 5000000 });
      expect(result).toBe(true);
    });

    it('returns true when donation exceeds requirement', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithTreasuryDonation);
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toBe(true);
    });

    it('returns error when donation below requirement', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithTreasuryDonation);
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 10000000 });
      expect(result).toEqual({
        error: expect.stringContaining('less than the required'),
      });
    });

    it('returns error when donation is null', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithDeposit); // treasury_donation is null
      const result = await verifyDeposit(validTxHash, stakeAddr, { treasuryDonation: 1000000 });
      expect(result).toEqual({
        error: expect.stringContaining('less than the required'),
      });
    });
  });

  describe('deposit to address', () => {
    it('returns true when deposit meets requirement', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithDeposit);
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        depositAddress: depositAddr,
        depositAmount: 15000000,
      });
      expect(result).toBe(true);
    });

    it('returns error when deposit below requirement', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithDeposit);
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        depositAddress: depositAddr,
        depositAmount: 20000000,
      });
      expect(result).toEqual({
        error: expect.stringContaining('less than the required'),
      });
    });

    it('sums multiple outputs to target address', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithDeposit);
      // txWithDeposit has two outputs to depositAddr: 10000000 + 5000000 = 15000000
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        depositAddress: depositAddr,
        depositAmount: 15000000,
      });
      expect(result).toBe(true);
    });

    it('returns error when no outputs to target address', async () => {
      fetchTxInfo.mockResolvedValueOnce(txWithDeposit);
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        depositAddress: 'addr1qxnonexistent',
        depositAmount: 1000000,
      });
      expect(result).toEqual({
        error: expect.stringContaining('less than the required'),
      });
    });
  });

  describe('combined checks', () => {
    it('returns true when both treasury and deposit pass', async () => {
      const combinedTx = {
        ...txWithDeposit,
        treasury_donation: '5000000',
      };
      fetchTxInfo.mockResolvedValueOnce(combinedTx);
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        treasuryDonation: 5000000,
        depositAddress: depositAddr,
        depositAmount: 10000000,
      });
      expect(result).toBe(true);
    });

    it('returns error when treasury passes but deposit fails', async () => {
      const combinedTx = {
        ...txWithDeposit,
        treasury_donation: '5000000',
      };
      fetchTxInfo.mockResolvedValueOnce(combinedTx);
      const result = await verifyDeposit(validTxHash, stakeAddr, {
        treasuryDonation: 5000000,
        depositAddress: depositAddr,
        depositAmount: 99999999,
      });
      expect(result).toEqual({
        error: expect.stringContaining('less than the required'),
      });
    });
  });
});
