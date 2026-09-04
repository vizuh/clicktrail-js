/** Bound optional analytics calls, including injected senders that ignore abort. */
export async function withDeliveryTimeout<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('ClickTrail delivery exceeded 3000 ms.', 'TimeoutError');
      reject(error);
      controller.abort(error);
    }, 3000);
  });
  try {
    return await Promise.race([send(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
