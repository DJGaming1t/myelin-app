export type PasswordRule = {
  key: 'length' | 'lowercase' | 'uppercase' | 'number';
  label: string;
  passes: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    { key: 'length', label: '10 or more characters', passes: password.length >= 10 },
    { key: 'lowercase', label: 'A lowercase letter', passes: /[a-z]/.test(password) },
    { key: 'uppercase', label: 'An uppercase letter', passes: /[A-Z]/.test(password) },
    { key: 'number', label: 'A number', passes: /\d/.test(password) },
  ];
}

export function passwordIsReady(password: string) {
  return getPasswordRules(password).every((rule) => rule.passes);
}
