type FirebaseLikeError = { code?: string | number; message?: string };

export function authErrorMessage(error: unknown, action: 'signin' | 'signup' | 'reset' | 'google' | 'delete') {
  const details = error as FirebaseLikeError | null | undefined;
  const code = typeof details?.code === 'string' || typeof details?.code === 'number'
    ? String(details.code)
    : '';
  const message = typeof details?.message === 'string' ? details.message : '';

  if (code.includes('network-request-failed')) {
    return 'MYELIN cannot reach the sign-in service right now. Check your connection and try again.';
  }

  if (code.includes('too-many-requests')) {
    return 'Too many attempts were made in a short time. Try again later.';
  }

  if (code.includes('invalid-email')) {
    return 'Check that the email address is written correctly.';
  }

  if (code.includes('weak-password') || code.includes('password-does-not-meet-requirements')) {
    return 'That password does not meet the current password requirements.';
  }

  if (code.includes('operation-not-allowed')) {
    return action === 'google'
      ? 'Google sign-in is not enabled correctly in Firebase for this build.'
      : 'Email/password sign-in is not enabled correctly in Firebase for this build.';
  }

  if (
    code.includes('developer-error') ||
    code.includes('DEVELOPER_ERROR') ||
    code === '10' ||
    (action === 'google' && /DEVELOPER_ERROR|developer console is not set up correctly/i.test(message))
  ) {
    return 'Google sign-in is not configured for this build yet. You can use email sign-in while the app’s Google setup is corrected.';
  }

  if (code === 'auth/native-google-setup-required') {
    return 'Google sign-in needs the Android development-build setup before it can run natively. Email sign-in is already available.';
  }

  // Android Credential Manager can report a configuration failure as cancelled
  // after account selection. Hiding it makes the button appear to do nothing.
  if (code === 'auth/google-cancelled' || code === 'SIGN_IN_CANCELLED') {
    return 'Google sign-in closed before completing. If you selected an account, this build’s Google setup may need checking. You can also use email sign-in.';
  }

  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
    return '';
  }

  // Deliberately avoid confirming whether an email address has an account.
  if (action === 'signin') return 'We could not sign you in. Check your details and try again.';
  if (action === 'signup') return 'We could not create that account. Check the details and try again.';
  if (action === 'google') return 'Google sign-in did not finish. Try again.';
  if (action === 'delete') return 'The account could not be deleted right now. Sign in again if needed, then retry.';
  return 'The request could not be completed. Try again.';
}
