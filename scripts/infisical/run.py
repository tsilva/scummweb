"""Fetch development secrets in memory, then replace this process with the app."""

import os
import sys

from common import Infisical, ROOT, SecretError, application_environment

COMMANDS = {
    "dev": ["pnpm", "run", "dev:app", "--port", "auto"],
    "build": ["pnpm", "run", "build"],
    "check": ["node", "scripts/check-infisical-secrets.mjs"],
    "issues": ["node", "scripts/list_sentry_issues.mjs"],
}


def selected_command(arguments):
    if not arguments or arguments[0] not in COMMANDS:
        raise SecretError("Usage: python3 scripts/infisical/run.py <dev|build|check|issues>")
    if arguments[0] == "issues":
        if "--env-file" in arguments[1:]:
            raise SecretError("Private env-file overrides are not supported.")
        return [*COMMANDS["issues"], *arguments[1:]]
    if arguments[1:] and not (arguments[0] == "dev"
                              and arguments[1:] in (["--port", "auto"], ["--port=auto"])):
        raise SecretError("Only --port auto is supported for development; project and environment overrides are rejected.")
    return COMMANDS[arguments[0]]


def main():
    command = selected_command(sys.argv[1:])
    environment = application_environment(Infisical().read())
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
