/**
 * Tiny indirection so taskfenceStore can clear the stored session without
 * importing sessionPersistence, which imports taskfenceStore back.
 */
export { clearSession as forgetSession } from './persist'
