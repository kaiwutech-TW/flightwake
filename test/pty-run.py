#!/usr/bin/env python3
"""Run a command under a pseudo-terminal (so stdin/stdout are a TTY), feed it input, drain its output.
Usage: python3 test/pty-run.py <timeout-seconds> <input-string> <cmd> [args...]
  input-string: written to the terminal right away; backslash escapes are decoded ("\\x03" = Ctrl-C, "\\n" = Enter).
Prints the child's output on stdout; exits with the child's exit code (128+signal if killed), or 124 on timeout."""
import os, pty, select, signal, sys, time


def main():
    if len(sys.argv) < 4:
        sys.stderr.write(__doc__)
        return 2
    timeout = float(sys.argv[1])
    data = sys.argv[2].encode('utf-8').decode('unicode_escape').encode('latin-1', 'replace') if sys.argv[2] else b''
    cmd = sys.argv[3:]
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execvp(cmd[0], cmd)
        except KeyboardInterrupt:
            os._exit(130)
        except OSError as e:
            sys.stderr.write('pty-run: cannot exec %s: %s\n' % (cmd[0], e))
            os._exit(127)
    deadline = time.time() + timeout
    if data:
        time.sleep(0.3)  # let the child exec first, so a Ctrl-C byte reaches it and not the pre-exec fork
        try:
            os.write(fd, data)
        except OSError:
            pass
    status = None
    while True:
        left = deadline - time.time()
        if left <= 0:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
            os.waitpid(pid, 0)
            return 124
        r, _, _ = select.select([fd], [], [], min(left, 0.2))
        if r:
            try:
                chunk = os.read(fd, 4096)
            except OSError:  # Linux: EIO once the child side closed
                chunk = b''
            if chunk:
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
                continue
            # EOF on the pty: child is done (or closed it); wait for it within the remaining time
            while time.time() < deadline:
                p, st = os.waitpid(pid, os.WNOHANG)
                if p:
                    status = st
                    break
                time.sleep(0.05)
            if status is None:
                try:
                    os.kill(pid, signal.SIGKILL)
                except OSError:
                    pass
                os.waitpid(pid, 0)
                return 124
            break
        p, st = os.waitpid(pid, os.WNOHANG)
        if p:
            status = st
            # drain whatever is left
            try:
                while select.select([fd], [], [], 0.1)[0]:
                    chunk = os.read(fd, 4096)
                    if not chunk:
                        break
                    sys.stdout.buffer.write(chunk)
            except OSError:
                pass
            break
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    return 128 + os.WTERMSIG(status)


sys.exit(main())
