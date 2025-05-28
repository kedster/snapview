// root/snapviewbackend/auth.js
import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, verifyPassword, setCookie, getCookie } from './utils.js';
import { getUserByEmail, createUser, getUserById } from './db.js';

const JWT_COOKIE_NAME = 'snap_session_token';
const JWT_EXPIRATION = '2h'; // JWT Expiration time
const JWT_ALGORITHM = 'HS256';

async function getJwtSecret(env) {
    return new TextEncoder().encode(env.JWT_SECRET);
}

export async function generateToken(payload, env) {
    const secret = await getJwtSecret(env);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: JWT_ALGORITHM })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRATION)
        .sign(secret);
}

export async function verifyToken(token, env) {
    if (!token) return null;
    try {
        const secret = await getJwtSecret(env);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return null;
    }
}

export async function handleSignup(request, env) {
    try {
        const { email, password } = await request.json();
        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (password.length < 8) {
            return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const existingUser = await getUserByEmail(env.DB, email);
        if (existingUser) {
            return new Response(JSON.stringify({ error: 'Email already in use' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        const userId = crypto.randomUUID();
        const { hash: passwordHash, salt } = await hashPassword(password);
        const user = await createUser(env.DB, { id: userId, email, passwordHash, salt });

        if (!user) {
            return new Response(JSON.stringify({ error: 'Could not create user' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        const token = await generateToken({ sub: user.id, email: user.email, tier: user.tier }, env);
        const cookie = setCookie(JWT_COOKIE_NAME, token, {
            httpOnly: true,
            secure: !env.BASE_URL.startsWith('http://localhost'), // true in prod
            sameSite: 'Lax',
            path: '/',
            maxAge: 2 * 60 * 60, // 2 hours
        });

        return new Response(JSON.stringify({ message: 'Signup successful', user: { id: user.id, email: user.email, tier: user.tier } }), {
            status: 201,
            headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Signup error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function handleLogin(request, env) {
    try {
        const { email, password } = await request.json();
        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const user = await getUserByEmail(env.DB, email);
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const passwordMatch = await verifyPassword(password, user.password_hash, user.salt);
        if (!passwordMatch) {
            return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // Fetch user details again to ensure tier is up-to-date if it can change outside login
        const freshUser = await getUserById(env.DB, user.id);

        const token = await generateToken({ sub: freshUser.id, email: freshUser.email, tier: freshUser.tier }, env);
        const cookie = setCookie(JWT_COOKIE_NAME, token, {
            httpOnly: true,
            secure: !env.BASE_URL.startsWith('http://localhost'), // true in prod
            sameSite: 'Lax',
            path: '/',
            maxAge: 2 * 60 * 60, // 2 hours
        });

        return new Response(JSON.stringify({ message: 'Login successful', user: { id: freshUser.id, email: freshUser.email, tier: freshUser.tier } }), {
            status: 200,
            headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Login error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function handleLogout(request, env) {
    // Expire the cookie
    const cookie = setCookie(JWT_COOKIE_NAME, '', {
        httpOnly: true,
        secure: !env.BASE_URL.startsWith('http://localhost'),
        sameSite: 'Lax',
        path: '/',
        expires: new Date(0), // Set to a past date
    });
    return new Response(JSON.stringify({ message: 'Logout successful' }), {
        status: 200,
        headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
    });
}

export async function getCurrentUser(request, env) {
    const token = getCookie(request, JWT_COOKIE_NAME);
    if (!token) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const payload = await verifyToken(token, env);
    if (!payload) {
        // If token is invalid, clear it
        const expiredCookie = setCookie(JWT_COOKIE_NAME, '', { expires: new Date(0), path: '/', httpOnly: true, secure: !env.BASE_URL.startsWith('http://localhost'), sameSite: 'Lax' });
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Set-Cookie': expiredCookie } });
    }

    // Optionally, fetch fresh user data from DB to ensure it's up-to-date
    const user = await getUserById(env.DB, payload.sub);
    if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    // Don't send sensitive info like password hash
    const { password_hash, salt, ...safeUser } = user;
    return new Response(JSON.stringify({ user: safeUser }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export { JWT_COOKIE_NAME };