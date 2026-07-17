export class WorkerCoordinator {
  constructor({ workerCount = 2, handler }) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }

    this.workerCount = workerCount;
    this.handler = handler;
    this.rounds = new Map();
    this.latestRoundByWorker = new Map();
    this.activeRound = this.#createRound(1);
  }

  submit(workerId) {
    const id = String(workerId);
    const round = this.activeRound;

    // A retry from a worker already in the round is idempotent.
    if (round.workers.has(id)) {
      return {
        ...this.#publicState(round, id),
        accepted: true
      };
    }

    if (round.workers.size >= this.workerCount) {
      return {
        ...this.#publicState(round, id),
        accepted: false,
        message: "This round already has both workers"
      };
    }

    round.workers.add(id);
    this.latestRoundByWorker.set(id, round.number);

    if (round.workers.size === this.workerCount) {
      this.#runHandler(round);
    }

    return {
      ...this.#publicState(round, id),
      accepted: true
    };
  }

  getStatus(workerId) {
    const id = String(workerId);
    const roundNumber = this.latestRoundByWorker.get(id);

    if (roundNumber === undefined) {
      return {
        workerId: id,
        round: this.activeRound.number,
        status: "waiting",
        stage: "not_submitted",
        message: "Submit completion for this round first"
      };
    }

    return this.#publicState(this.rounds.get(roundNumber), id);
  }

  #createRound(number) {
    const round = {
      number,
      workers: new Set(),
      status: "waiting",
      stage: "collecting_workers",
      error: undefined
    };
    this.rounds.set(number, round);
    return round;
  }

  #runHandler(round) {
    // Change state before invoking user code so no duplicate request can start it twice.
    round.stage = "handling";

    Promise.resolve()
      .then(() => this.handler({
        round: round.number,
        workerIds: [...round.workers]
      }))
      .then(() => {
        round.status = "completed";
        round.stage = "completed";
        round.completedAt = new Date().toISOString();

        if (this.activeRound === round) {
          this.activeRound = this.#createRound(round.number + 1);
        }
      })
      .catch((error) => {
        round.status = "failed";
        round.stage = "failed";
        round.error = error instanceof Error ? error.message : String(error);
      });
  }

  #publicState(round, workerId) {
    const state = {
      workerId,
      round: round.number,
      status: round.status,
      stage: round.stage,
      submittedWorkers: round.workers.size,
      requiredWorkers: this.workerCount
    };

    if (round.completedAt) {
      state.completedAt = round.completedAt;
    }
    if (round.error) {
      state.error = round.error;
    }

    return state;
  }
}
