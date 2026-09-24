export interface SingleTurnAdapterDependencies<TCandidate> {
    generateCandidate: () => Promise<TCandidate>;
    reviewCandidate: (candidate: TCandidate) => Promise<TCandidate>;
}

// This seam deliberately owns only the legacy generate-then-review order.
// Routing, retries, persistence, and all state remain with its callers.
export const runSingleTurnAdapter = async <TCandidate>(
    dependencies: SingleTurnAdapterDependencies<TCandidate>,
): Promise<TCandidate> => {
    const candidate = await dependencies.generateCandidate();
    return dependencies.reviewCandidate(candidate);
};
