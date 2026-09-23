export const calculateMessageStartScrollTop = (
    containerScrollTop: number,
    messageTop: number,
    containerTop: number,
    inset = 8,
) => Math.max(0, containerScrollTop + messageTop - containerTop - inset);

export const setInstantScrollTop = (container: HTMLElement, top: number) => {
    const previous = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = top;
    if (previous) container.style.scrollBehavior = previous;
    else container.style.removeProperty('scroll-behavior');
};
