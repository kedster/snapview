// root/snapviewbackend/utils.js

// Password Hashing (PBKDF2 with SHA-256)
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // bytes
const KEY_LENGTH = 64; // bytes for SHA-256 output as hex

// Helper to convert ArrayBuffer to hex string
function buf2hex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper to convert hex string to ArrayBuffer
function hex2buf(hex) {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

export async function hashPassword(password, saltHex) {
    const salt = saltHex ? hex2buf(saltHex) : crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const passwordBuf = new TextEncoder().encode(password);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuf,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        KEY_LENGTH * 8 // length in bits
    );

    return {
        hash: buf2hex(derivedBits),
        salt: saltHex || buf2hex(salt), // return existing salt if provided, else new one
    };
}

export async function verifyPassword(password, storedHashHex, saltHex) {
    const { hash: newHash } = await hashPassword(password, saltHex);
    return newHash === storedHashHex;
}

// Cookie Helper
export function setCookie(name, value, options = {}) {
    const MAPPINGS = {
        expires: 'Expires',
        maxAge: 'Max-Age',
        domain: 'Domain',
        path: 'Path',
        secure: 'Secure',
        httpOnly: 'HttpOnly',
        sameSite: 'SameSite',
    };

    const parts = [`${name}=${value}`];
    for (const key in options) {
        if (options.hasOwnProperty(key) && MAPPINGS[key]) {
            const cookieOptionValue = options[key];
            if (MAPPINGS[key] === 'Secure' || MAPPINGS[key] === 'HttpOnly') {
                if (cookieOptionValue) parts.push(MAPPINGS[key]);
            } else {
                parts.push(`${MAPPINGS[key]}=${cookieOptionValue}`);
            }
        }
    }
    return parts.join('; ');
}

export function getCookie(request, name) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';');
    for (let cookie of cookies) {
        const [cookieName, ...cookieValueParts] = cookie.trim().split('=');
        if (cookieName === name) {
            return cookieValueParts.join('=');
        }
    }
    return null;
}