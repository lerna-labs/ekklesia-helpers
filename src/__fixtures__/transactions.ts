/**
 * Mock TxInfo objects for verifyDeposit tests.
 */

import type { TxInfo } from '../cardano/cardanoApi.js';

const baseTx: Omit<TxInfo, 'inputs' | 'outputs' | 'treasury_donation'> = {
  tx_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
  block_hash: '0000000000000000000000000000000000000000000000000000000000000000',
  block_height: 100000,
  epoch_no: 500,
  tx_timestamp: 1700000000,
  total_output: '10000000',
  fee: '200000',
  deposit: '0',
};

const stakeAddr = 'stake1uyvx67glm2hdjcfp9pg0d59x0595n372k8sh437vk3hda0gmuz8dq';
const depositAddr =
  'addr1qxy2fxv2d8lp286dft6kc2vr9yu3mhyasjhm0g3q8f8lquprwlav3gxsv3v7k67tljfq2ky9r9kcgy5r8f0xt5qqxue2sng3rrj';

/** Transaction with treasury donation and stake key in inputs. */
export const txWithTreasuryDonation: TxInfo = {
  ...baseTx,
  treasury_donation: '5000000',
  inputs: [
    {
      value: '20000000',
      tx_hash: 'prev_tx_hash_1',
      tx_index: 0,
      stake_addr: stakeAddr,
      payment_addr: { cred: 'abc123', bech32: 'addr1qxsome...' },
    },
  ],
  outputs: [
    {
      value: '14800000',
      tx_hash: baseTx.tx_hash,
      tx_index: 0,
      stake_addr: stakeAddr,
      payment_addr: { cred: 'abc123', bech32: 'addr1qxsome...' },
    },
  ],
};

/** Transaction with deposit to specific address. */
export const txWithDeposit: TxInfo = {
  ...baseTx,
  treasury_donation: null,
  inputs: [
    {
      value: '20000000',
      tx_hash: 'prev_tx_hash_1',
      tx_index: 0,
      stake_addr: stakeAddr,
      payment_addr: { cred: 'abc123', bech32: 'addr1qxsome...' },
    },
  ],
  outputs: [
    {
      value: '10000000',
      tx_hash: baseTx.tx_hash,
      tx_index: 0,
      stake_addr: null,
      payment_addr: { cred: 'def456', bech32: depositAddr },
    },
    {
      value: '5000000',
      tx_hash: baseTx.tx_hash,
      tx_index: 1,
      stake_addr: null,
      payment_addr: { cred: 'def456', bech32: depositAddr },
    },
    {
      value: '4800000',
      tx_hash: baseTx.tx_hash,
      tx_index: 2,
      stake_addr: stakeAddr,
      payment_addr: { cred: 'abc123', bech32: 'addr1qxsome...' },
    },
  ],
};

/** Transaction where stake key is NOT in inputs. */
export const txWithoutStakeKey: TxInfo = {
  ...baseTx,
  treasury_donation: '5000000',
  inputs: [
    {
      value: '20000000',
      tx_hash: 'prev_tx_hash_1',
      tx_index: 0,
      stake_addr: 'stake1uxother_address',
      payment_addr: { cred: 'other123', bech32: 'addr1qxother...' },
    },
  ],
  outputs: [
    {
      value: '14800000',
      tx_hash: baseTx.tx_hash,
      tx_index: 0,
      stake_addr: 'stake1uxother_address',
      payment_addr: { cred: 'other123', bech32: 'addr1qxother...' },
    },
  ],
};

export { stakeAddr, depositAddr };
