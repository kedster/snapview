// root/snapviewbackend/db.js
export async function getUserById(db, userId) {
    const stmt = db.prepare('SELECT id, email, tier, stripe_customer_id FROM users WHERE id = ?');
    return await stmt.bind(userId).first();
}

export async function getUserByEmail(db, email) {
    const stmt = db.prepare('SELECT id, email, password_hash, salt, tier, stripe_customer_id FROM users WHERE email = ?');
    return await stmt.bind(email.toLowerCase()).first();
}

export async function createUser(db, { id, email, passwordHash, salt }) {
    const stmt = db.prepare('INSERT INTO users (id, email, password_hash, salt) VALUES (?, ?, ?, ?) RETURNING id, email, tier');
    return await stmt.bind(id, email.toLowerCase(), passwordHash, salt).first();
}

export async function updateUserTier(db, userId, tier, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus) {
    const stmt = db.prepare(`
        UPDATE users
        SET tier = ?, stripe_customer_id = ?, stripe_subscription_id = ?, stripe_subscription_status = ?, updated_at = strftime('%s', 'now')
        WHERE id = ?
        RETURNING id, email, tier
    `);
    return await stmt.bind(tier, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, userId).first();
}

export async function updateUserStripeInfo(db, userId, stripeCustomerId, stripeSubscriptionId = null, stripeSubscriptionStatus = null) {
    let query = 'UPDATE users SET stripe_customer_id = ?, ';
    const params = [stripeCustomerId];

    if (stripeSubscriptionId !== null) {
        query += 'stripe_subscription_id = ?, ';
        params.push(stripeSubscriptionId);
    }
    if (stripeSubscriptionStatus !== null) {
        query += 'stripe_subscription_status = ?, ';
        params.push(stripeSubscriptionStatus);
    }
    query += "updated_at = strftime('%s', 'now') WHERE id = ? RETURNING id, email, tier";
    params.push(userId);

    const stmt = db.prepare(query);
    return await stmt.bind(...params).first();
}