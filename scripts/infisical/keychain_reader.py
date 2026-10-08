"""Read only manifest-bound keyenv accounts; values leave only through a private pipe."""

import argparse
import json
import os
from pathlib import Path
import stat
import sys

from keyenv.access import access_request
from keyenv.core import binding_state, keychain_lookup, load_manifest, require_native_keychain


def collect(path):
    require_native_keychain()
    manifest = load_manifest(path)
    result = {"repository": manifest.root.name, "path": str(manifest.root), "keys": {}}
    with access_request(manifest, "Infisical migration", environment={}, preapproved=True):
        for name, spec in manifest.secrets.items():
            state = binding_state(manifest, spec.account)
            if state != "authorized":
                result["keys"][name] = {"status": "binding-" + state}
                continue
            stored = keychain_lookup(manifest, spec.account)
            result["keys"][name] = (
                {"status": "available", "source": stored.source, "value": stored.value}
                if stored is not None else {"status": "missing"}
            )
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-fd", type=int)
    args = parser.parse_args()
    if args.output_fd is not None:
        if args.output_fd <= 2 or not stat.S_ISFIFO(os.fstat(args.output_fd).st_mode):
            raise ValueError("credential output requires a private pipe")
    result = collect(args.manifest)
    if args.output_fd is None:
        for item in result["keys"].values():
            item.pop("value", None)
        print(json.dumps(result))
    else:
        with os.fdopen(args.output_fd, "w") as pipe:
            json.dump(result, pipe)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Keychain inspection failed. Credential details were suppressed.", file=sys.stderr)
        sys.exit(1)
