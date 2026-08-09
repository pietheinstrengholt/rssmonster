// Simulates a hostile parser that never yields so termination must be preemptive.
while (true) {
  // Intentionally consumes CPU until the parent terminates this worker.
}
