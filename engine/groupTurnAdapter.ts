export interface GroupTurnAdapterDependencies<TCandidate> {
    generateCandidate: () => Promise<TCandidate>;
    reviewCandidate: (candidate: TCandidate) => Promise<TCandidate>;
}

// This seam deliberately owns only the legacy group generate-then-review order.
// Routing, proposed state, persistence, and all commits remain with its caller.
export const runGroupTurnAdapter = async <TCandidate>(
    dependencies: GroupTurnAdapterDependencies<TCandidate>,
): Promise<TCandidate> => {
    const candidate = await dependencies.generateCandidate();
    return dependencies.reviewCandidate(candidate);
};
