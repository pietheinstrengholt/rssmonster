const args = process.argv.slice(2);

if (args.length !== 2 || !args[0]) {
  console.error('Usage: npm run reset:password -- <username> <new-password>');
  process.exitCode = 1;
} else {
  let db;
  try {
    db = (await import('../models/index.js')).default;
    db.sequelize.options.logging = false;
    const { resetPasswordForUsername } = await import('../services/email/passwordReset.js');
    await resetPasswordForUsername(args[0], args[1]);
    console.log('Password updated. Previous sessions and password reset links are invalidated.');
  } catch (error) {
    console.error(error?.name === 'PasswordResetError'
      ? error.message
      : 'Password reset failed. Check the backend database configuration and authentication secrets.');
    process.exitCode = 1;
  } finally {
    if (db) await db.sequelize.close();
  }
}
