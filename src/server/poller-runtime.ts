type PollerRuntime = {
  started: boolean;
  ownsLock: boolean;
  epoch: number | null;
  stopping: boolean;
  ownerId: string;
  timer: NodeJS.Timeout | null;
};

function createOwnerId(): string {
  return `poller-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
}

export const pollerRuntime: PollerRuntime = ((globalThis as { __gatePoller?: PollerRuntime }).__gatePoller ??= {
  started: false,
  ownsLock: false,
  epoch: null,
  stopping: false,
  ownerId: createOwnerId(),
  timer: null,
});

export function getPollerState() {
  return { started: pollerRuntime.started, ownsLock: pollerRuntime.ownsLock };
}

export function getPollerEpoch(): number | null {
  return pollerRuntime.ownsLock ? pollerRuntime.epoch : null;
}

export function isPollerStopping(): boolean {
  return pollerRuntime.stopping;
}
