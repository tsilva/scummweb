"""Copy manifest-bound native Keychain credentials to linked Infisical development."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from common import Infisical, ROOT, SecretError, cli_environment, matches


def keyenv_python():
    executable = shutil.which("keyenv")
    if not executable:
        raise SecretError("Install keyenv before migrating its Keychain accounts.")
    first = Path(executable).read_text().splitlines()[0]
    if not first.startswith("#!/") or not Path(first[2:]).is_file():
        raise SecretError("Could not locate keyenv's installed Python interpreter.")
    return first[2:]


def read_keychain(root=ROOT):
    read_fd, write_fd = os.pipe()
    process = None
    try:
        process = subprocess.Popen(
            [keyenv_python(), str(Path(__file__).with_name("keychain_reader.py")),
             "--manifest", str(root / ".keyenv.toml"), "--output-fd", str(write_fd)],
            pass_fds=(write_fd,), stdout=subprocess.DEVNULL, env=cli_environment(),
        )
    except Exception:
        os.close(read_fd)
        raise SecretError("Could not start the native Keychain reader.") from None
    finally:
        os.close(write_fd)
    with os.fdopen(read_fd, "r") as pipe:
        payload = pipe.read(1_048_577)
    if len(payload) > 1_048_576:
        process.kill()
        process.wait()
        raise SecretError("Keychain response exceeded the permitted size.")
    if process.wait():
        raise SecretError("Keychain read failed; originals retained.")
    try:
        return json.loads(payload)
    except Exception:
        raise SecretError("Invalid Keychain response; raw output suppressed.") from None


def transfer(source, destination):
    blocked = [key for key, item in source["keys"].items()
               if item["status"] not in ("available", "missing")]
    if blocked:
        raise SecretError("Keychain bindings are missing or unauthorized; resolve them before migration.")
    values = {key: item["value"] for key, item in source["keys"].items()
              if item["status"] == "available"}
    # Check every available key before creating any. Never replace differing values.
    existing = destination.read()
    for key, value in values.items():
        if key in existing and not matches(existing[key], value):
            raise SecretError(f"Different existing value for {key}; no credentials were written.")
    report = {}
    for key, item in source["keys"].items():
        report[key] = (destination.create_and_verify(key, item["value"])
                       if key in values else "absent from keyenv; skipped")
        print(f"{key}: {report[key]}", flush=True)
    return report


def main():
    destination = Infisical()
    destination.read()  # Authenticate before asking Keychain for any values.
    transfer(read_keychain(), destination)
    print("Transfer verified. Keychain originals retained. No secret values were displayed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Migration cancelled; Keychain originals retained.", file=sys.stderr)
        sys.exit(130)
    except SecretError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Migration failed; credential details suppressed and Keychain originals retained.", file=sys.stderr)
        sys.exit(1)
