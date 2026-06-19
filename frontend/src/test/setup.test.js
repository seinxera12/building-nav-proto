// Smoke test to verify test infrastructure is working
import { describe, it, expect } from 'vitest';

describe('Test Infrastructure', () => {
  it('should have jsdom environment', () => {
    expect(window).toBeDefined();
    expect(document).toBeDefined();
  });

  it('should have jest-dom matchers', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello';
    document.body.appendChild(div);
    expect(div).toBeInTheDocument();
    expect(div).toHaveTextContent('Hello');
    document.body.removeChild(div);
  });

  it('should have fast-check available', async () => {
    const fc = await import('fast-check');
    expect(fc).toBeDefined();
    expect(typeof fc.property).toBe('function');
    expect(typeof fc.integer).toBe('function');
  });

  it('should have @testing-library/react available', async () => {
    const { render, screen } = await import('@testing-library/react');
    expect(render).toBeDefined();
    expect(screen).toBeDefined();
  });

  it('should have user-event available', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    expect(userEvent).toBeDefined();
    expect(typeof userEvent.setup).toBe('function');
  });
});

describe('Leaflet Mock', () => {
  it('should provide mock map instance globally', () => {
    expect(global.mockMapInstance).toBeDefined();
  });

  it('should have spyable map.flyTo', () => {
    const map = global.mockMapInstance;
    map.flyTo([50, 10], 2);
    expect(map.flyTo).toHaveBeenCalledWith([50, 10], 2);
  });

  it('should have spyable map.setView', () => {
    const map = global.mockMapInstance;
    map.setView([50, 10], 2);
    expect(map.setView).toHaveBeenCalledWith([50, 10], 2);
  });

  it('should reset mock calls between tests', () => {
    const map = global.mockMapInstance;
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.setView).not.toHaveBeenCalled();
  });
});
