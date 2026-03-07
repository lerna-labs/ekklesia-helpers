// Validation
export {
  validateAddress,
  getAddressType,
  pubKeyToBech32,
  extractParts,
  sanitizeInput,
  type AddressError,
  type DrepAddressResult,
  type CalidusAddressResult,
  type ValidateAddressResult,
  type AddressTypeInfo,
} from "./validation/index.js";

// Crypto
export {
  verifySignature,
  isPartyToScript,
  getScriptCriteria,
  validateScriptSignatures,
  type SignatureObject,
  type SignatureError,
  type ScriptCriteria,
} from "./crypto/index.js";

// Auth
export {
  verifyToken,
  type TokenVerificationSuccess,
  type TokenVerificationError,
  type TokenVerificationResult,
} from "./auth/index.js";

// Cardano
export {
  getScript,
  fetchCalidusKey,
  fetchDrepName,
  validateDrep,
  fetchHandle,
  fetchTxInfo,
  fetchPoolTicker,
  fetchPoolMetadata,
  fetchName,
  resetProviders,
  type CalidusKey,
  type TxPaymentAddr,
  type TxIO,
  type TxInfo,
  type DrepInfo,
  type CardanoProvider,
  type PoolMetadata,
  UnsupportedOperationError,
  ProviderError,
  verifyDeposit,
  type DepositOptions,
  type DepositError,
} from "./cardano/index.js";

// Server
export {
  initializeConsole,
  resetConsole,
  connectToDatabase,
  disconnectFromDatabase,
  checkDatabaseConnection,
  isDatabaseConnected,
  checkDatabaseConnectionMW,
  loadEnvironmentVariables,
  loadRoutes,
} from "./server/index.js";
