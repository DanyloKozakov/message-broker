// Put the work that must run after both workers finish in this function.
export async function handleCompletedRound({ round, workerIds }) {
  console.log(`Handling round ${round} for workers: ${workerIds.join(", ")}`);
}
