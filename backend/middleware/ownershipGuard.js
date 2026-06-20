/**
 * ownershipGuard.js
 *
 * Middleware factory that prevents IDOR (Insecure Direct Object Reference) attacks.
 * Verifies that the record being accessed belongs to the authenticated user.
 * ADMINs bypass all ownership checks and can access any record.
 *
 * Usage:
 *   router.delete('/:id', authMiddleware, ownershipGuard('sessions', 'id'), handler);
 *   router.patch('/update', authMiddleware, ownershipGuard('persons', 'body.identityId'), handler);
 */

const db = require('../db-postgres');

/**
 * @param {string} tableName   - The DB table to check ownership on
 * @param {string} recordIdPath - Dot-path to the record ID in req: 'params.id', 'body.identityId', 'query.id'
 */
function ownershipGuard(tableName, recordIdPath = 'params.id') {
  return async (req, res, next) => {
    // ADMINs bypass ownership checks
    if (req.user && req.user.role === 'ADMIN') {
      return next();
    }

    // Extract record ID from the specified path
    const parts = recordIdPath.split('.');
    let recordId = req;
    for (const part of parts) {
      recordId = recordId?.[part];
    }

    if (!recordId) {
      // No record ID to check — let the handler deal with it
      return next();
    }

    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      const row = await db.get(
        `SELECT user_id FROM ${tableName} WHERE id = ?`,
        [recordId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Record not found.' });
      }

      if (row.user_id && row.user_id !== req.user.id) {
        console.warn(
          `[OwnershipGuard] IDOR attempt: user=${req.user.id} tried to access ${tableName}/${recordId} owned by user=${row.user_id}`
        );
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this resource.'
        });
      }

      // Ownership verified
      next();
    } catch (err) {
      console.error(`[OwnershipGuard] DB error checking ownership on ${tableName}:`, err.message);
      // On DB error, allow the main handler to deal with it (fail open — change to fail closed if needed)
      next();
    }
  };
}

module.exports = ownershipGuard;
