export function maskEmail(email?: string | null) {
  if (!email || !email.includes('@')) return 'your email address';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0] ?? ''}•@${domain}`;
  return `${name.slice(0, 2)}${'•'.repeat(Math.min(5, name.length - 2))}@${domain}`;
}
