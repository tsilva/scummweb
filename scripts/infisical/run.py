"""Launch local checks without keys and route Sentry reads through Agent Vault."""

import argparse
import os
import sys

from common import Infisical, ROOT, SecretError, application_environment, cli_environment, publisher_environment

COMMANDS = {
    "dev": ["pnpm", "run", "dev:app", "--port", "auto"],
    "check": ["node", "scripts/check-infisical-secrets.mjs"],
    "issues": ["node", "scripts/list_sentry_issues.mjs"],
    "publish": [sys.executable, "scripts/upload_games_to_r2.py"],
    "publish-artwork": [sys.executable, "scripts/upload_artwork_to_r2.py"],
}


def selected_command(arguments):
    if not arguments or arguments[0] not in COMMANDS:
        raise SecretError("Usage: python3 scripts/infisical/run.py <dev|check|issues|publish|publish-artwork>")
    if arguments[0] == "publish-artwork":
        if arguments[1:]:
            raise SecretError("Artwork publishing does not accept target overrides or flags.")
        return COMMANDS["publish-artwork"]
    if arguments[0] == "publish":
        # Validate before fetching secrets. The uploader retains the flag semantics.
        parser = argparse.ArgumentParser(add_help=False)
        parser.add_argument("--game")
        for option in ("--force", "--prune"):
            parser.add_argument(option, action="store_true")
        parser.add_argument("--help", "-h", action="store_true")
        parser.parse_args(arguments[1:])
        return [*COMMANDS["publish"], *arguments[1:]]
    if arguments[0] == "issues":
        if "--env-file" in arguments[1:]:
            raise SecretError("Private env-file overrides are not supported.")
        return [sys.executable, "-I", "-S", "-B",
                str(ROOT / "scripts/infisical/sentry_vault.py"),
                "issues", *arguments[1:]]
    if arguments[1:] and not (arguments[0] == "dev"
                              and arguments[1:] in (["--port", "auto"], ["--port=auto"])):
        raise SecretError("Only --port auto is supported for development; project and environment overrides are rejected.")
    return COMMANDS[arguments[0]]


def main():
    command = selected_command(sys.argv[1:])
    if sys.argv[1] in ("publish", "publish-artwork"):
        environment = (cli_environment() if any(arg in ("--help", "-h") for arg in sys.argv[2:])
                       else publisher_environment(Infisical().read_publisher_credentials()))
    else:
        environment = application_environment({})
    os.chdir(ROOT)
    os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except SecretError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Could not launch the application; credential details suppressed.", file=sys.stderr)
        sys.exit(1)
