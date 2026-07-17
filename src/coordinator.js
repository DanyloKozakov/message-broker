export class WorkerCoordinator {
  constructor({ workerCount = 2, handler, allowedWorkerIds, logger = console }) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }

    this.allowedWorkerIds = new Set(allowedWorkerIds ?? []);
    if (this.allowedWorkerIds.size !== workerCount) {
      throw new RangeError(`Exactly ${workerCount} unique allowed worker IDs are required`);
    }

    this.workerCount = workerCount;
    this.handler = handler;
    this.logger = logger;
    this.rounds = new Map();
    this.latestRoundByWorker = new Map();
    this.activeRound = this.#createRound(1);
  }

  submit(workerId) {
    const id = String(workerId);
    const round = this.activeRound;

    if (!this.allowedWorkerIds.has(id)) {
      this.logger.warn(`Worker submission rejected: workerId=${id} reason=not_allowed`);
      return {
        workerId: id,
        accepted: false,
        reason: "not_allowed",
        message: "Worker ID is not allowed"
      };
    }

    // A retry from a worker already in the round is idempotent.
    if (round.workers.has(id)) {
      this.logger.info(
        `Worker submission duplicate: workerId=${id} round=${round.number} submissions=${round.workers.size}/${this.workerCount}`
      );
      return {
        ...this.#publicState(round, id),
        accepted: true
      };
    }

    if (round.workers.size >= this.workerCount) {
      this.logger.warn(`Worker submission rejected: workerId=${id} round=${round.number} reason=round_full`);
      return {
        ...this.#publicState(round, id),
        accepted: false,
        message: "This round already has both workers"
      };
    }

    round.workers.add(id);
    this.latestRoundByWorker.set(id, round.number);

    this.logger.info(
      `Worker submission accepted: workerId=${id} round=${round.number} submissions=${round.workers.size}/${this.workerCount}`
    );

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

    if (!this.allowedWorkerIds.has(id)) {
      this.logger.warn(`Worker status rejected: workerId=${id} reason=not_allowed`);
      return {
        workerId: id,
        authorized: false,
        reason: "not_allowed",
        message: "Worker ID is not allowed"
      };
    }

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
        this.logger.info(
          `Round completed: round=${round.number} workerIds=${[...round.workers].join(",")}`
        );

        if (this.activeRound === round) {
          this.activeRound = this.#createRound(round.number + 1);
        }
      })
      .catch((error) => {
        round.status = "failed";
        round.stage = "failed";
        round.error = error instanceof Error ? error.message : String(error);
        this.logger.error(`Round failed: round=${round.number} error=${round.error}`);
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
