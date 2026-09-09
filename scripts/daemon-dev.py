#!/usr/bin/env python3
"""Double-fork daemonizer: starts the Next.js dev server fully detached
(reparented to PID 1) so it survives the end of the tool session."""
import os
import sys
import time

PROJECT = '/home/z/my-project'
LOG = os.path.join(PROJECT, 'dev.log')

pid = os.fork()
if pid == 0:
    # intermediate child — new session, then fork again
    os.setsid()
    pid2 = os.fork()
    if pid2 == 0:
        # grandchild — will be reparented to init (tini) when the
        # intermediate exits immediately below
        os.chdir(PROJECT)
        devnull = os.open(os.devnull, os.O_RDONLY)
        os.dup2(devnull, 0)
        log = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
        os.dup2(log, 1)
        os.dup2(log, 2)
        os.execvp('node', ['node', 'node_modules/.bin/next', 'dev', '-p', '3000'])
        os._exit(1)
    else:
        os._exit(0)
else:
    os.waitpid(pid, 0)

# give the listener a moment, then report
time.sleep(1)
print('daemon spawned')
