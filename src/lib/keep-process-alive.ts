/**
 * Node may exit while an async pipeline still has queued work when the
 * promise chain itself is not attached to the top-level module lifecycle.
 * Keep CLI jobs alive until the supplied task settles.
 */
export function keepProcessAlive<T>(task: Promise<T>): Promise<T> {
  const heartbeat = setInterval(() => undefined, 1000);
  return task.finally(() => clearInterval(heartbeat));
}
