/**
 * Helper for verifying transaction deposits and treasury donations.
 * Confirms that a transaction meets deposit/donation requirements and that a
 * specified stake key contributed to the transaction inputs.
 */

import { fetchTxInfo } from './cardanoApi.js';

const regExpHex = /^[0-9a-fA-F]+$/;

/** Options for {@link verifyDeposit}. */
export interface DepositOptions {
  /** Minimum treasury donation in lovelace. */
  treasuryDonation?: string | number | bigint;
  /** Address that should receive the deposit (bech32). */
  depositAddress?: string;
  /** Required deposit amount in lovelace. */
  depositAmount?: string | number | bigint;
}

/** Error result from {@link verifyDeposit}. */
export interface DepositError {
  error: string;
}

/**
 * Verify that a transaction meets deposit/donation requirements
 * and that a specific stake key contributed to it.
 *
 * @param txHash - Transaction hash (hex).
 * @param stakeAddr - Stake address to verify as contributor (bech32).
 * @param options - Deposit or treasury donation requirements.
 * @returns `true` if all checks pass, or an object with an `error` message
 *   describing which requirement the transaction failed.
 * @throws {@link ProviderError} if the chain data cannot be fetched. A returned
 *   `error` therefore always means the transaction genuinely failed a check,
 *   never that we were unable to look it up — an outage must not read as a
 *   rejected deposit.
 *
 * @example
 * ```ts
 * const result = await verifyDeposit(txHash, stakeAddr, {
 *   treasuryDonation: 1_000_000,
 * });
 * if (result !== true) console.error(result.error);
 * ```
 */
export async function verifyDeposit(
  txHash: string,
  stakeAddr: string,
  options: DepositOptions = {},
): Promise<true | DepositError> {
  if (!txHash || !regExpHex.test(txHash)) {
    return { error: 'Transaction hash is missing or invalid' };
  }

  if (!stakeAddr) {
    return { error: 'Stake address is missing' };
  }

  const { treasuryDonation, depositAddress, depositAmount } = options;
  const hasTreasuryCheck = treasuryDonation != null;
  const hasDepositCheck = depositAddress != null || depositAmount != null;

  if (!hasTreasuryCheck && !hasDepositCheck) {
    return {
      error: 'At least one of treasuryDonation or depositAddress/depositAmount must be provided',
    };
  }

  if (hasDepositCheck && (!depositAddress || depositAmount == null)) {
    return {
      error: 'Both depositAddress and depositAmount are required for deposit verification',
    };
  }

  const tx = await fetchTxInfo(txHash);
  if (!tx) {
    return { error: 'Transaction not found' };
  }

  // Verify the stake key contributed to the transaction inputs
  const stakeKeyInInputs = tx.inputs?.some((input) => input.stake_addr === stakeAddr);

  if (!stakeKeyInInputs) {
    return { error: 'The specified stake key did not contribute to this transaction' };
  }

  // Treasury donation check
  if (hasTreasuryCheck) {
    const actualDonation = tx.treasury_donation ? BigInt(tx.treasury_donation) : 0n;
    const requiredDonation = BigInt(treasuryDonation);

    if (actualDonation < requiredDonation) {
      return {
        error: `Treasury donation of ${actualDonation} lovelace is less than the required ${requiredDonation}`,
      };
    }
  }

  // Deposit to address check
  if (hasDepositCheck) {
    const totalToAddress = (tx.outputs || [])
      .filter((output) => output.payment_addr?.bech32 === depositAddress)
      .reduce((sum, output) => sum + BigInt(output.value), 0n);

    const requiredAmount = BigInt(depositAmount!);

    if (totalToAddress < requiredAmount) {
      return {
        error: `Deposit of ${totalToAddress} lovelace to ${depositAddress} is less than the required ${requiredAmount}`,
      };
    }
  }

  return true;
}
