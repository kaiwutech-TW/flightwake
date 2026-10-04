#!/usr/bin/env python3
"""Run a command under a pseudo-terminal and answer it like a person: wait until its output settles, type one answer,
press Enter, repeat. Prints everything the terminal received (raw, so callers can check escape sequences and lines).
Usage: python3 test/pty-answers.py <timeout-seconds> <cmd> [args...] -- <answer> <answer> ...
  An answer of "" is a bare Enter. Exits with the child's exit code, or 124 on timeout."""
import os, pty, select, sys, time


def main():
    argv = sys.argv[1:]
    if '--' not in argv or len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    sep = argv.index('--')
    timeout = float(argv[0])
    cmd, answers = argv[1:sep], argv[sep + 1:]
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execvp(cmd[0], cmd)
        except OSError as e:
            sys.stderr.write('pty-answers: cannot exec %s: %s\n' % (cmd[0], e))
            os._exit(127)
    deadline = time.time() + timeout
    out = bytearray()

    def drain(quiet):
        last = time.time()
        while time.time() < deadline:
            r, _, _ = select.select([fd], [], [], 0.05)
            if r:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return False
                if not data:
                    return False
                out.extend(data)
                last = time.time()
            elif time.time() - last > quiet:
                return True
        return False

    alive = drain(0.8)
    for a in answers:
        if not alive:
            break
        os.write(fd, a.encode('utf-8') + b'\r')
        alive = drain(0.5)
    drain(1.0)
    sys.stdout.buffer.write(bytes(out))
    sys.stdout.flush()
    if time.time() >= deadline:
        try:
            os.kill(pid, 9)
        except OSError:
            pass
        os.waitpid(pid, 0)
        return 124
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else (status >> 8)


if __name__ == '__main__':
    code = main()
    sys.exit(code if code >= 0 else 128 - code)
