import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so Element.scrollIntoView is simply absent.
// Any component that keeps a highlighted row in view calls it; stubbing it
// here keeps that behaviour out of production code, where it is real.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
