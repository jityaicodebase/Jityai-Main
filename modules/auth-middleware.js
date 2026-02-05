/**
 * ============================================================================
 * AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * Protects API routes and enforces store-level data isolation
 */

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user context to request
 */
function authenticateJWT(authService) {
    return async (req, res, next) => {
        try {
            // Extract token from header
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'NO_TOKEN'
                });
            }

            const token = authHeader.substring(7); // Remove "Bearer "

            // Verify token
            const decoded = authService.verifyToken(token);

            if (!decoded) {
                return res.status(403).json({
                    error: 'Invalid or expired token',
                    code: 'INVALID_TOKEN'
                });
            }

            // Attach user context to request
            req.user = {
                user_id: decoded.user_id,
                email: decoded.email,
                store_id: decoded.store_id,
                role: decoded.role,
                full_name: decoded.full_name
            };

            next();

        } catch (error) {
            console.error('Auth middleware error:', error);
            return res.status(500).json({
                error: 'Authentication failed',
                code: 'AUTH_ERROR'
            });
        }
    };
}

/**
 * API Key Authentication Middleware (for store connector)
 * Verifies API key and attaches store context
 */
function authenticateAPIKey(authService) {
    return async (req, res, next) => {
        try {
            // Extract API key from header
            const apiKey = req.headers['x-api-key'];

            if (!apiKey) {
                return res.status(401).json({
                    error: 'API key required',
                    code: 'NO_API_KEY'
                });
            }

            // Verify API key
            const keyData = await authService.verifyApiKey(apiKey);

            if (!keyData) {
                return res.status(403).json({
                    error: 'Invalid or expired API key',
                    code: 'INVALID_API_KEY'
                });
            }

            // Attach API key context to request
            req.apiKey = {
                api_key_id: keyData.api_key_id,
                store_id: keyData.store_id,
                permissions: keyData.permissions,
                key_type: keyData.key_type
            };

            // Also set store_id for consistency
            req.store_id = keyData.store_id;

            next();

        } catch (error) {
            console.error('API key auth error:', error);
            return res.status(500).json({
                error: 'API key authentication failed',
                code: 'API_KEY_ERROR'
            });
        }
    };
}

/**
 * Store Scoping Middleware
 * CRITICAL: Ensures users can only access their own store's data
 * Must be used AFTER authenticateJWT
 */
function requireStoreScope(req, res, next) {
    // Get store_id from authenticated user
    const userStoreId = req.user?.store_id || req.apiKey?.store_id;

    if (!userStoreId) {
        return res.status(403).json({
            error: 'Store context missing',
            code: 'NO_STORE_CONTEXT'
        });
    }

    // Attach store_id to request for DB queries
    req.store_id = userStoreId;

    // CRITICAL: If the route has :storeId parameter, verify it matches auth
    if (req.params.storeId && req.params.storeId !== userStoreId) {
        console.warn(`⚠️ Store mismatch attempt: user=${userStoreId}, requested=${req.params.storeId}`);
        return res.status(403).json({
            error: 'Access denied: store mismatch',
            code: 'STORE_MISMATCH'
        });
    }

    next();
}

/**
 * Role-based access control
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'NO_AUTH'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                code: 'FORBIDDEN',
                required_role: allowedRoles
            });
        }

        next();
    };
}

/**
 * Optional authentication (for public + private routes)
 */
function optionalAuth(authService) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                // No token provided - continue without auth
                return next();
            }

            const token = authHeader.substring(7);
            const decoded = authService.verifyToken(token);

            if (decoded) {
                req.user = {
                    user_id: decoded.user_id,
                    email: decoded.email,
                    store_id: decoded.store_id,
                    role: decoded.role
                };
            }

            next();

        } catch (error) {
            // Ignore auth errors for optional routes
            next();
        }
    };
}

module.exports = {
    authenticateJWT,
    authenticateAPIKey,
    requireStoreScope,
    requireRole,
    optionalAuth
};
