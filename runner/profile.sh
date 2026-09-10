# What an agent's shell is, when somebody arrives.
#
# Sourced by every login shell — ssh and the dashboard terminal alike.

# Opened for this agent at start, from the broker, under the ring. If a shell
# arrives before that finished, ask now rather than start blind.
[ -s /run/harness/env ] || /usr/local/bin/fetch-secrets >/dev/null 2>&1
[ -r /run/harness/env ] && . /run/harness/env

# The name this machine answers to, rather than a container id nobody can read.
[ -r /etc/harness/name ] && PS1="$(cat /etc/harness/name):\w\$ "

# A plan token in the environment is not a logged-in CLI. Cheap and idempotent.
[ -x /usr/local/bin/brain-login ] && /usr/local/bin/brain-login 2>/dev/null

# Start in the thing this machine exists to run.
#
# A bare prompt is the wrong default here. The machine was provisioned with a
# brain and a credential for it; making a person type the command is a step
# that teaches nothing. HARNESS_BRAIN is sealed alongside the credential, so an
# agent whose secrets the chain will no longer release does not get told what
# to launch either — it falls back to a shell, which is the honest outcome.
#
# Only for an interactive login, and never twice: exec'ing the CLI from a shell
# the CLI itself spawned is a loop nobody enjoys discovering.
if [ -n "${HARNESS_BRAIN:-}" ] && [ -z "${HARNESS_NO_BRAIN:-}" ] && [ -t 0 ]; then
    export HARNESS_NO_BRAIN=1
    case "$HARNESS_BRAIN" in
        claude)
            command -v claude >/dev/null 2>&1 && {
                echo "$(cat /etc/harness/name 2>/dev/null) — starting Claude Code."
                echo "Exit it for a shell; HARNESS_NO_BRAIN=1 skips this."
                exec claude
            } ;;
        codex)
            command -v codex >/dev/null 2>&1 && {
                echo "$(cat /etc/harness/name 2>/dev/null) — starting Codex."
                echo "Exit it for a shell; HARNESS_NO_BRAIN=1 skips this."
                exec codex
            } ;;
    esac
fi
