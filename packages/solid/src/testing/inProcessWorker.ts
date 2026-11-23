// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WorkerLike } from "../offPage";
import { offPageJobs } from "../offPageJobs";
import type { Port } from "../offPageProtocol";
import { serveOffPage, type Jobs } from "../offPageServe";

/** One end of a MessageChannel as a Port, started as it is listened to. */
function portOf(port: MessagePort): Port {
  return {
    postMessage: (message, transfer = []) => port.postMessage(message, transfer),
    addEventListener: (type, listener) => {
      port.addEventListener(type, listener);
      port.start();
    },
  };
}

/**
 * A worker for tests, run in this process: the jobs (offPageJobs by
 * default) are served over a MessageChannel, so that what goes between
 * the page and the worker is copied as a worker's messages are.
 * `terminate` closes the channel; what the job still does goes nowhere.
 */
export function inProcessWorker(jobs: Jobs = offPageJobs()): WorkerLike & { terminated: boolean } {
  const channel = new MessageChannel();
  serveOffPage(portOf(channel.port2), jobs);
  const page = portOf(channel.port1);
  const worker = {
    terminated: false,
    postMessage: page.postMessage,
    addEventListener: (type: string, listener: (event: MessageEvent & Event) => void) => {
      if (type === "message") page.addEventListener("message", listener);
    },
    terminate: () => {
      worker.terminated = true;
      channel.port1.close();
      channel.port2.close();
    },
  };
  return worker;
}
