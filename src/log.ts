const pad = (n: number) => String(n).padStart(2, '0');

// Data formattata [DD-MM-YYYY HH:mm:ss]
export function logDate(): string {
    const d = new Date();
    return `[${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

export const log = (...a: unknown[]) => console.log(logDate(), ...a);
export const warn = (...a: unknown[]) => console.warn(logDate(), ...a);
export const error = (...a: unknown[]) => console.error(logDate(), ...a);
