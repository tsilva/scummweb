// Local app checks need no private service or secret-manager credentials.
const privateNames = Object.keys(process.env).filter(name =>
  !/^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(name) &&
  /TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|DATABASE_(URL|DSN)|CREDENTIAL/.test(name));
if (privateNames.some(name => process.env[name])) {
  console.error('Local command unexpectedly received private credentials; values withheld.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ok: true, read_only: true, credential_mode: 'none', local_sentry_uploads: false}));
}
