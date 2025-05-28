// root/snapviewbackend/middleware.js
import { verifyToken } from './auth.js';
import { getCookie } from './utils.js';
import { getUserById } from './db.js';
import { JWT_COOKIE_NAME } from './auth.js';

export async function requireAuth(request, env) {
    const token = getCookie(request, JWT_COOKIE_NAME);
    if (!token) {
        request.authError = { message: 'Authentication required.', status: 401 };
        return; // Allow router to handle response
    }

    const payload = await verifyToken(token, env);
    if (!payload || !payload.sub) {
        request.authError = { message: 'Invalid or expired token.', status: 401, clearCookie: true };
        return;
    }

    // Attach user to request for downstream handlers, fetch fresh user data
    const user = await getUserById(env.DB, payload.sub);
    if (!user) {
        request.authError = { message: 'User not found.', status: 404, clearCookie: true };
        return;
    }
    request.user = { id: user.id, email: user.email, tier: user.tier, stripeCustomerId: user.stripe_customer_id };
}

export function checkTier(requiredTier) {
    return (request) => { // This returns the actual middleware function
        if (!request.user) { // Should be caught by requireAuth first
            request.tierError = { message: 'Authentication error before tier check.', status: 500 };
            return;
        }
        if (request.user.tier !== requiredTier && request.user.tier !== 'admin') { // Example: admin bypasses tier
            // More sophisticated: if (tiers.indexOf(request.user.tier) < tiers.indexOf(requiredTier))
            request.tierError = { message: `Access denied. '${requiredTier}' tier required. You are on '${request.user.tier}'.`, status: 403 };
        }
    };
}