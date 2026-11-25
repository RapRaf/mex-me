import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';
import { KNOWN_IPS } from './config';
import { warn } from './log';

// Proxy fidati: nginx gira sulla stessa macchina e inoltra su loopback.
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1']);

type ReqLike = Pick<IncomingMessage, 'socket' | 'headers'>;

// IP reale del client. Se la connessione TCP arriva da un proxy fidato (nginx)
// si usa X-Real-IP, che nginx sovrascrive con $remote_addr e quindi non è
// falsificabile dal client. Negli altri casi si usa l'IP della connessione.
export function getClientIp(req: ReqLike): string {
    const socketIp = req.socket.remoteAddress?.replace(/^::ffff:/, '');
    if (socketIp && TRUSTED_PROXIES.has(socketIp)) {
        const realIp = req.headers['x-real-ip'];
        if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().replace(/^::ffff:/, '');
    }
    return socketIp || 'Sconosciuto';
}

// KNOWN_IPS vuota (o non impostata) = accesso consentito a chiunque.
export function isKnownIp(ip: string): boolean {
    if (Object.keys(KNOWN_IPS).length === 0) return true;
    return Object.prototype.hasOwnProperty.call(KNOWN_IPS, ip);
}

export const ipName = (ip: string): string => KNOWN_IPS[ip] || ip;

// Blocca con 403 ogni richiesta HTTP da IP non presenti in KNOWN_IPS.
export function httpGuard(req: Request, res: Response, next: NextFunction) {
    const ip = getClientIp(req);
    if (!isKnownIp(ip)) {
        warn(`Accesso HTTP negato per IP non autorizzato: ${ip}`);
        res.status(403).send('Forbidden: IP non autorizzato.');
        return;
    }
    next();
}

// allowRequest di Socket.IO: se false engine.io risponde 403.
export function socketGuard(req: IncomingMessage, cb: (err: string | null | undefined, ok: boolean) => void) {
    const ip = getClientIp(req);
    const ok = isKnownIp(ip);
    if (!ok) warn(`Connessione socket.io negata per IP non autorizzato: ${ip}`);
    cb(null, ok);
}
