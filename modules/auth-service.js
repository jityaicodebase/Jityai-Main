/**
 * ============================================================================
 * AUTHENTICATION SERVICE
 * ============================================================================
 * Handles JWT-based authentication for cloud-ready multi-tenant system
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRY = '7d'; // Extended session for demo convenience
const SALT_ROUNDS = 10;

class AuthService {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Generate JWT token for authenticated user
     */
    generateToken(user) {
        const payload = {
            user_id: user.user_id,
            email: user.email,
            store_id: user.store_id,
            role: user.role,
            full_name: user.full_name // Add full_name for UI display
        };

        return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    }

    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    /**
     * Hash password
     */
    async hashPassword(password) {
        return bcrypt.hash(password, SALT_ROUNDS);
    }

    /**
     * Compare password with hash
     */
    async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    /**
     * Register new user and store
     */
    async register({ email, password, fullName, storeName, storeLocation }) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Check if user exists
            const existing = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                throw new Error('Email already registered');
            }

            // 2. Create Store ID (slugified)
            const storeId = storeName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

            // 3. Create Store with location
            await client.query(
                `INSERT INTO store_settings (store_id, store_name, store_type, store_location) 
                 VALUES ($1, $2, 'grocery', $3)`,
                [storeId, storeName, storeLocation || '']
            );

            // 4. Create User
            const passwordHash = await this.hashPassword(password);
            const userResult = await client.query(
                `INSERT INTO users (email, password_hash, store_id, role, full_name) 
                 VALUES ($1, $2, $3, 'owner', $4) 
                 RETURNING user_id, email, store_id, role, full_name`,
                [email, passwordHash, storeId, fullName]
            );

            await client.query('COMMIT');

            const user = userResult.rows[0];
            const token = this.generateToken(user);

            return {
                success: true,
                token,
                user: {
                    user_id: user.user_id,
                    email: user.email,
                    store_id: user.store_id,
                    role: user.role,
                    full_name: user.full_name,
                    store_name: storeName,
                    store_location: storeLocation || ''
                }
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Authenticate user
     */
    async login(email, password, ipAddress = null, userAgent = null) {
        const client = await this.pool.connect();

        try {
            // Get user
            const userResult = await client.query(
                `SELECT u.user_id, u.email, u.password_hash, u.store_id, u.role, u.is_active, 
                        u.login_attempts, u.locked_until, u.full_name, COALESCE(s.store_name, 'Unknown Store') as store_name, 
                        COALESCE(s.store_location, '') as store_location
                 FROM users u
                 LEFT JOIN store_settings s ON u.store_id = s.store_id
                 WHERE u.email = $1`,
                [email]
            );

            if (userResult.rows.length === 0) {
                // Log failed attempt
                await this.logAudit(client, null, null, 'auth.failed', {
                    email,
                    reason: 'user_not_found',
                    ip_address: ipAddress
                }, 'failure');

                throw new Error('Invalid credentials');
            }

            const user = userResult.rows[0];

            // Check if account is locked (Skip for demo-store)
            if (user.store_id !== 'demo-store' && user.locked_until && new Date(user.locked_until) > new Date()) {
                const waitTime = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
                throw new Error(`Account locked due to too many failed attempts. Try again in ${waitTime} minutes.`);
            }

            // Check if account is active
            if (!user.is_active) {
                throw new Error('Account is disabled');
            }

            // Verify password
            const isValid = await this.comparePassword(password, user.password_hash);

            if (!isValid) {
                // Increment failed attempts (Skip for demo-store)
                if (user.store_id !== 'demo-store') {
                    const newAttempts = user.login_attempts + 1;
                    const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

                    await client.query(
                        `UPDATE users 
                         SET login_attempts = $1, locked_until = $2 
                         WHERE user_id = $3`,
                        [newAttempts, lockUntil, user.user_id]
                    );
                }

                // Log failed attempt
                await this.logAudit(client, user.store_id, user.user_id, 'auth.failed', {
                    email,
                    reason: 'invalid_password',
                    attempts: newAttempts,
                    ip_address: ipAddress
                }, 'failure');

                throw new Error('Invalid credentials');
            }

            // Successful login - reset attempts and update last login
            await client.query(
                `UPDATE users 
                 SET login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP 
                 WHERE user_id = $1`,
                [user.user_id]
            );

            // Log successful login
            await this.logAudit(client, user.store_id, user.user_id, 'auth.login', {
                email,
                ip_address: ipAddress,
                user_agent: userAgent
            }, 'success');

            // Generate token
            const token = this.generateToken(user);

            return {
                token,
                user: {
                    user_id: user.user_id,
                    email: user.email,
                    store_id: user.store_id,
                    role: user.role,
                    full_name: user.full_name,
                    store_name: user.store_name,
                    store_location: user.store_location || ''
                }
            };

        } finally {
            client.release();
        }
    }

    /**
     * Verify API key for store connector
     */
    async verifyApiKey(apiKey) {
        const client = await this.pool.connect();

        try {
            // Hash the provided key
            const keyHash = apiKey; // In production, use proper hashing

            const result = await client.query(
                `SELECT ak.api_key_id, ak.store_id, ak.permissions, ak.key_type
                 FROM api_keys ak
                 WHERE ak.key_hash = $1 
                   AND ak.is_active = TRUE
                   AND (ak.expires_at IS NULL OR ak.expires_at > CURRENT_TIMESTAMP)`,
                [keyHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const apiKeyData = result.rows[0];

            // Update last used
            await client.query(
                `UPDATE api_keys 
                 SET last_used_at = CURRENT_TIMESTAMP, usage_count = usage_count + 1 
                 WHERE api_key_id = $1`,
                [apiKeyData.api_key_id]
            );

            return apiKeyData;

        } finally {
            client.release();
        }
    }

    /**
     * Admin password reset
     */
    async resetPassword(userId, newPassword, adminUserId = null) {
        const client = await this.pool.connect();

        try {
            const passwordHash = await this.hashPassword(newPassword);

            await client.query(
                `UPDATE users 
                 SET password_hash = $1, login_attempts = 0, locked_until = NULL 
                 WHERE user_id = $2`,
                [passwordHash, userId]
            );

            // Get user details for audit
            const userResult = await client.query(
                'SELECT store_id FROM users WHERE user_id = $1',
                [userId]
            );

            if (userResult.rows.length > 0) {
                await this.logAudit(client, userResult.rows[0].store_id, adminUserId, 'auth.password_reset', {
                    target_user_id: userId,
                    reset_by: adminUserId ? 'admin' : 'self'
                }, 'success');
            }

            return true;

        } finally {
            client.release();
        }
    }

    /**
     * Log audit event
     */
    async logAudit(client, storeId, userId, actionType, metadata, status = 'success', error = null) {
        try {
            await client.query(
                `INSERT INTO operational_audit_log 
                 (store_id, user_id, action_type, metadata, status, error_message, ip_address)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [storeId, userId, actionType, JSON.stringify(metadata), status, error, metadata.ip_address || null]
            );
        } catch (err) {
            console.error('Failed to log audit:', err);
        }
    }
}

module.exports = AuthService;
