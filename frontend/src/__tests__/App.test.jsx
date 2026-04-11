import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App.jsx';

const mockPayloads = {
  '/api/data': {
    classes: { data: { 1: '1A' } },
    subjects: { data: { 3: 'Matematika' } },
    classrooms: { data: { 5: 'A101' } },
    teachers: { data: { 9: 'Novak' } },
    periods: {
      data: {
        1: {
          period: 1,
          short: '1',
          start: '08:00',
          end: '08:45',
        },
      },
    },
  },
  '/api/timetable': {
    classes: [
      {
        id: 1,
        ttitems: [
          {
            uniperiod: 1,
            subjectid: 3,
            classroomids: [5],
            teacherids: [9],
            starttime: '08:00',
            endtime: '08:45',
          },
        ],
      },
    ],
  },
  '/api/events': {
    classes: [],
  },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path) => ({
      ok: true,
      text: async () => JSON.stringify(mockPayloads[path]),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the school header and timetable data', async () => {
    render(<App />);

    expect(await screen.findByText('Aurora Learning Hub')).toBeInTheDocument();
    expect(await screen.findByText('1A')).toBeInTheDocument();
    expect(await screen.findByText('Matematika')).toBeInTheDocument();
  });
});
