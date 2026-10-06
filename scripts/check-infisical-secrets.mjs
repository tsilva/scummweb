const keys = ['SENTRY_AUTH_TOKEN'];
const managerKeys = ['BWS_ACCESS_TOKEN', 'INFISICAL_TOKEN', 'INFISICAL_CLIENT_SECRET', 'INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET', 'INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN'];
for (const key of keys) console.log(`${key}: ${process.env[key] ? 'present' : 'absent'}`);
if (managerKeys.some(key => process.env[key])) {
  console.error('Manager credentials unexpectedly reached the application process.');
  process.exitCode = 1;
}
